"""CSV profiling engine.

Reads a CSV file and produces a JSON-serializable statistical profile using
pandas/numpy only. This profile is what gets sent to the LLM later in the
pipeline -- the LLM never sees the raw dataset, only this summary.
"""

import csv
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.utils.config import Config
from app.utils.logger import get_logger, log_duration

logger = get_logger(__name__)

# Above this size we still profile the file, but log a warning since very
# large files can make profiling (esp. correlations) slow.
_LARGE_FILE_WARNING_MB = 200

# If a categorical column has more unique values than this, its frequency
# table is truncated to the top N to keep the JSON payload reasonable.
_MAX_FREQUENCY_ENTRIES = 50

# Minimum fraction of non-null values in an object column that must parse as
# dates before we treat the whole column as datetime. Guards against a stray
# parseable token flipping a genuinely categorical column to datetime.
_DATETIME_PARSE_THRESHOLD = 0.9

# --- ragged-column detection thresholds (see _detect_ragged_columns) -----
# How many raw data rows (after the header) to sample when checking whether
# the header's field count matches the data's actual field count.
_RAGGED_SAMPLE_ROWS = 20
# A mismatch only counts as "ragged" (vs. a normal, harmless 1-field offset
# from an implicit index column) when the data's field count is at least
# this many times the header's field count...
_RAGGED_RATIO_THRESHOLD = 2
# ...AND the absolute difference is at least this large. Both conditions
# must hold, so a routine off-by-one (index-column-shaped) file never
# triggers this.
_RAGGED_MIN_ABSOLUTE_DIFF = 2

# --- ROOT CAUSE FIX (large-dataset upload rejection) ----------------------
# Some real-world CSVs (e.g. files exported from "sample data" generators)
# ship with a single free-text banner/comment line ABOVE the real header,
# e.g.:
#   # This sample CSV file is provided by Sample-Files.com...
#   ID,Name,Age,...
#   1,Name_1,22,...
# Previously, _detect_ragged_columns correctly *detected* this (the "real"
# header + every data row have N fields, but row 0 -- the banner -- has 1)
# and raised ProfilerError, which is safe but forces the user to manually
# edit the file. Since this exact shape (one preamble line, everything below
# it uniformly N-wide) is unambiguous and mechanically repairable, we now
# attempt ONE auto-repair pass: drop the leading line and re-parse. If the
# re-parsed frame's column count then matches what the data rows actually
# contain, we proceed with a warning instead of failing the upload. If it
# does NOT resolve cleanly (e.g. genuinely corrupt/ragged data), we fall back
# to raising the original, unmodified ProfilerError -- no silent corruption.
_MAX_PREAMBLE_LINES_TO_STRIP = 1


class ProfilerError(Exception):
    """Raised when a CSV cannot be read or profiled, with a clear reason."""


def _log_df_state(stage: str, df: pd.DataFrame) -> None:
    """TEMPORARY diagnostic hook: log shape/columns/dtypes/dup-count at a pipeline stage.

    Added per debugging request to trace Bug #3 (duplicate-count mismatch)
    and the large-file ragged-header rejection. Safe to remove once both are
    confirmed fixed in production; left in as INFO-level so it's cheap and
    non-intrusive if kept.
    """
    logger.info(
        "DIAG[%s]: shape=%s dtypes=%s duplicated_sum=%d",
        stage, df.shape, dict(df.dtypes.astype(str)), int(df.duplicated().sum()),
    )


def _sample_field_counts(file_path: Path, skip_lines: int = 0) -> list[int]:
    """Read raw field counts for up to _RAGGED_SAMPLE_ROWS lines, after skipping `skip_lines`."""
    with file_path.open("r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f)
        for _ in range(skip_lines):
            try:
                next(reader)
            except StopIteration:
                return []
        counts = []
        for _ in range(_RAGGED_SAMPLE_ROWS + 1):  # +1 header row
            try:
                row = next(reader)
            except StopIteration:
                break
            if row:
                counts.append(len(row))
        return counts


def _try_strip_leading_preamble(file_path: Path, header_fields: int, typical_fields: int) -> pd.DataFrame | None:
    """Attempt to auto-repair a single stray preamble line above the real header.

    Only fires for the narrow, unambiguous case this whole function exists to
    handle: the header pandas parsed has `header_fields` columns (usually 1,
    from a free-text banner line), and skipping exactly one more line yields a
    NEW header + all following data rows that agree on `typical_fields`
    columns. Returns the re-parsed DataFrame on success, or None if skipping a
    line doesn't resolve the mismatch (caller should then raise the original
    ProfilerError rather than guess further).
    """
    if header_fields != 1:
        # Only handle the classic "single free-text banner line" shape. A
        # multi-column-but-still-wrong header is a different failure mode we
        # don't want to guess about.
        return None

    for skip in range(1, _MAX_PREAMBLE_LINES_TO_STRIP + 1):
        counts_after_skip = _sample_field_counts(file_path, skip_lines=skip)
        if not counts_after_skip:
            continue
        new_header_fields = counts_after_skip[0]
        data_counts = counts_after_skip[1:]
        if not data_counts:
            continue
        if new_header_fields == typical_fields and all(c == typical_fields for c in data_counts):
            try:
                df = pd.read_csv(file_path, skiprows=skip, low_memory=False)
            except Exception:  # noqa: BLE001 -- any failure here just means "repair didn't work"
                return None
            if df.shape[1] == typical_fields:
                logger.warning(
                    "%s: auto-repaired by skipping %d leading non-data line(s) above the header "
                    "(detected banner/comment text, not tabular data)",
                    file_path.name, skip,
                )
                return df
    return None


def _detect_ragged_columns(file_path: Path, df: pd.DataFrame) -> pd.DataFrame:
    """Detect a header/data column-count mismatch pandas silently 'resolved'
    instead of raising, and fail loudly with an actionable message instead --
    unless the mismatch is auto-repairable (see _try_strip_leading_preamble),
    in which case the repaired DataFrame is returned.

    BACKGROUND: `pd.read_csv` treats row 0 as the header by default. If a
    stray non-data line precedes the real header (e.g. a comment/banner
    line like "# This sample CSV file is provided by ...", not marked as a
    comment since nothing in this pipeline passes `comment="#"`), that
    stray line becomes a 1-field header while every subsequent line --
    including the REAL header and every real data row -- has however many
    comma-separated fields the actual data has (e.g. 10). Pandas resolves
    this width mismatch via its "extra leading fields become an implicit
    index, only the trailing field(s) matching the header's declared count
    become the visible column(s)" heuristic. The result: a dataframe that
    silently reports 1 column of (what looks like free text but is
    actually) just the LAST field of a much wider dataset -- 9 of 10
    columns and the true column names vanish with no error, and every
    downstream stage (validation, LLM analysis, cleaning, ML
    recommendation) proceeds against this corrupted view without any way
    to know something went wrong.

    This check samples the first `_RAGGED_SAMPLE_ROWS` raw data rows with
    `csv.reader` (quote-aware, so it doesn't miscount commas inside quoted
    text) and compares their typical field count to `df.shape[1]` (what
    pandas actually parsed). A routine 1-field-off mismatch is common and
    usually legitimate (pandas' standard "extra field is an unnamed index
    column" convention) and is intentionally NOT flagged -- only a
    mismatch that is both >= `_RAGGED_RATIO_THRESHOLD`x and
    `_RAGGED_MIN_ABSOLUTE_DIFF` fields off raises, since that combination
    is not explainable by the normal index-column convention.

    Returns:
        The original `df`, or an auto-repaired DataFrame if a single
        leading preamble line was the cause and stripping it resolves the
        mismatch cleanly.

    Raises:
        ProfilerError: if the sampled data rows consistently have far more
            fields than the parsed header implies, AND auto-repair did not
            resolve it.
    """
    try:
        with file_path.open("r", encoding="utf-8", errors="replace", newline="") as f:
            reader = csv.reader(f)
            try:
                next(reader)  # the header row, as pandas saw it
            except StopIteration:
                return df
            sample_field_counts = []
            for _ in range(_RAGGED_SAMPLE_ROWS):
                try:
                    row = next(reader)
                except StopIteration:
                    break
                if row:
                    sample_field_counts.append(len(row))
    except OSError:
        # If we can't even re-open the file for sampling, don't block the
        # main read on this best-effort check -- the primary parse already
        # succeeded, and other error paths already handle unreadable files.
        return df

    if not sample_field_counts:
        return df

    typical_fields = Counter(sample_field_counts).most_common(1)[0][0]
    header_fields = df.shape[1]
    if (
        typical_fields > header_fields * _RAGGED_RATIO_THRESHOLD
        and typical_fields - header_fields >= _RAGGED_MIN_ABSOLUTE_DIFF
    ):
        repaired = _try_strip_leading_preamble(file_path, header_fields, typical_fields)
        if repaired is not None:
            return repaired
        raise ProfilerError(
            f"{file_path.name} looks malformed: the header implies {header_fields} "
            f"column(s), but data rows consistently have {typical_fields} comma-"
            "separated fields. This usually means there's a stray line (e.g. a "
            "comment or banner) before the real header row. Please remove any "
            "non-data lines before the header and re-upload."
        )
    return df


def _read_csv_with_fallback(file_path: Path) -> pd.DataFrame:
    """Read a CSV robustly, handling empty files, bad encodings, and corrupt data.

    Args:
        file_path: Path to the CSV file on disk.

    Returns:
        A parsed DataFrame.

    Raises:
        ProfilerError: with a specific, human-readable reason for any failure.
    """
    if not file_path.exists():
        raise ProfilerError(f"File not found: {file_path}")

    if file_path.stat().st_size == 0:
        raise ProfilerError(f"CSV file is empty: {file_path.name}")

    size_mb = file_path.stat().st_size / (1024 * 1024)
    if size_mb > _LARGE_FILE_WARNING_MB:
        logger.warning("Large file detected (%.1f MB): %s -- profiling may be slow", size_mb, file_path.name)

    last_error: Exception | None = None
    for encoding in ("utf-8", "latin-1"):
        try:
            # low_memory=False: without it, pandas can throw an internal
            # IndexError (not a catchable ParserError) when a DtypeWarning
            # for mixed-type columns coincides with a column-count mismatch
            # -- observed directly while reproducing the ragged-header case
            # on a real uploaded file. low_memory=False reads the whole file
            # in one pass instead of chunking, avoiding that code path.
            df = pd.read_csv(file_path, encoding=encoding, low_memory=False)
            if encoding != "utf-8":
                logger.warning("File %s is not UTF-8; parsed successfully with latin-1 fallback", file_path.name)
            break
        except UnicodeDecodeError as exc:
            last_error = exc
            logger.warning("Encoding %s failed for %s, trying next fallback", encoding, file_path.name)
            continue
        except pd.errors.EmptyDataError as exc:
            raise ProfilerError(f"CSV file has no columns to parse: {file_path.name}") from exc
        except pd.errors.ParserError as exc:
            raise ProfilerError(f"CSV file is corrupted or malformed: {file_path.name} ({exc})") from exc
    else:
        raise ProfilerError(
            f"Could not decode {file_path.name} with utf-8 or latin-1 encodings"
        ) from last_error

    if df.shape[1] == 0:
        raise ProfilerError(f"CSV file has no columns to parse: {file_path.name}")

    _log_df_state("after CSV load (pre ragged-check)", df)

    # Catches the specific silent-corruption case where pandas' column count
    # doesn't match what the data rows actually contain (see
    # _detect_ragged_columns's docstring) -- must run before
    # _fix_missing_header_if_needed, which has a narrower, different purpose
    # (an all-numeric header) and would not catch this. May return an
    # auto-repaired (preamble-stripped) DataFrame instead of `df`.
    df = _detect_ragged_columns(file_path, df)
    _log_df_state("after ragged-column check/repair", df)

    _enforce_size_limits(df, file_path)
    df = _fix_missing_header_if_needed(df, file_path)
    _log_df_state("after missing-header repair", df)
    return df


def _enforce_size_limits(df: pd.DataFrame, file_path: Path) -> None:
    """Reject datasets too large to profile safely (CLAUDE.md/robustness spec).

    The correlation matrix is O(cols^2) and pandas holds the whole frame in
    memory, so an unbounded frame can OOM-kill the process mid-analysis. We
    fail fast with a clear, catchable error instead. Limits are configurable
    (Config.MAX_DATASET_ROWS / MAX_DATASET_COLUMNS); 0 disables a check.
    """
    max_rows = Config.MAX_DATASET_ROWS
    max_cols = Config.MAX_DATASET_COLUMNS
    if max_rows and df.shape[0] > max_rows:
        raise ProfilerError(
            f"{file_path.name} has {df.shape[0]:,} rows, above the {max_rows:,}-row limit. "
            "Please upload a smaller sample."
        )
    if max_cols and df.shape[1] > max_cols:
        raise ProfilerError(
            f"{file_path.name} has {df.shape[1]:,} columns, above the {max_cols:,}-column limit. "
            "Please reduce the number of columns."
        )


def _fix_missing_header_if_needed(df: pd.DataFrame, file_path: Path) -> pd.DataFrame:
    """Detect a headerless CSV (data mistakenly parsed as column names) and repair it.

    Heuristic: if every column name can be parsed as a number, the first row
    was almost certainly data, not a header -- pandas has no way to know this
    on its own since it always treats row 0 as the header by default.
    """
    columns_look_numeric = all(_is_number(str(col)) for col in df.columns)
    if not columns_look_numeric:
        return df

    logger.warning("No header row detected in %s; assigning generic column names", file_path.name)
    header_row = pd.DataFrame([df.columns.tolist()], columns=range(df.shape[1]))
    df.columns = range(df.shape[1])
    df = pd.concat([header_row, df], ignore_index=True)
    df.columns = [f"column_{i}" for i in range(df.shape[1])]

    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col])
        except (ValueError, TypeError):
            pass
    return df


def _is_number(value: str) -> bool:
    try:
        float(value)
        return True
    except ValueError:
        return False


def _clean_for_json(value: Any) -> Any:
    """Convert numpy/pandas scalars to native Python types, NaN/inf to None."""
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        f = float(value)
        return None if (np.isnan(f) or np.isinf(f)) else round(f, 4)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
        return None
    return value


def _profile_numeric_columns(df: pd.DataFrame, numeric_cols: list[str]) -> dict[str, dict[str, Any]]:
    """Compute mean, median, std, min, max for each numeric column."""
    summary: dict[str, dict[str, Any]] = {}
    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            summary[col] = {"mean": None, "median": None, "std": None, "min": None, "max": None}
            continue
        summary[col] = {
            "mean": _clean_for_json(series.mean()),
            "median": _clean_for_json(series.median()),
            "std": _clean_for_json(series.std()),
            "min": _clean_for_json(series.min()),
            "max": _clean_for_json(series.max()),
        }
    return summary


def _profile_categorical_columns(df: pd.DataFrame, categorical_cols: list[str]) -> dict[str, dict[str, Any]]:
    """Compute unique value count and a frequency table for each categorical column."""
    summary: dict[str, dict[str, Any]] = {}
    for col in categorical_cols:
        value_counts = df[col].value_counts(dropna=True)
        unique_count = int(df[col].nunique(dropna=True))

        truncated = unique_count > _MAX_FREQUENCY_ENTRIES
        top_values = value_counts.head(_MAX_FREQUENCY_ENTRIES)
        frequency_table = {str(k): int(v) for k, v in top_values.items()}

        summary[col] = {
            "unique_count": unique_count,
            "frequency_table": frequency_table,
            "truncated": truncated,
        }
    return summary


def _detect_outliers(df: pd.DataFrame, numeric_cols: list[str]) -> dict[str, dict[str, Any]]:
    """Detect outliers per numeric column using the IQR method."""
    outliers: dict[str, dict[str, Any]] = {}
    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            outliers[col] = {"count": 0, "lower_bound": None, "upper_bound": None}
            continue

        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        mask = (series < lower_bound) | (series > upper_bound)
        outliers[col] = {
            "count": int(mask.sum()),
            "lower_bound": _clean_for_json(lower_bound),
            "upper_bound": _clean_for_json(upper_bound),
        }
    return outliers


def _compute_correlations(df: pd.DataFrame, numeric_cols: list[str]) -> dict[str, dict[str, Any]]:
    """Compute the pairwise correlation matrix for numeric columns.

    Constant columns (zero variance) are dropped first -- their correlation
    with anything is NaN and clutters the matrix. If more than
    Config.MAX_CORRELATION_COLUMNS numeric columns remain, only the highest-
    variance ones are kept: the matrix is O(cols^2) to compute and render, and
    the low-variance tail carries the least signal.
    """
    usable = _correlatable_columns(df, numeric_cols)
    if len(usable) < 2:
        return {}
    corr_matrix = df[usable].corr()
    return {
        row: {col: _clean_for_json(corr_matrix.loc[row, col]) for col in corr_matrix.columns}
        for row in corr_matrix.index
    }


def _correlatable_columns(df: pd.DataFrame, numeric_cols: list[str]) -> list[str]:
    """Select the numeric columns worth correlating: non-constant, variance-capped."""
    non_constant = [col for col in numeric_cols if df[col].nunique(dropna=True) > 1]
    dropped = len(numeric_cols) - len(non_constant)
    if dropped:
        logger.info("Profiler: excluded %d constant numeric column(s) from correlation", dropped)

    cap = Config.MAX_CORRELATION_COLUMNS
    if cap and len(non_constant) > cap:
        variances = df[non_constant].var(numeric_only=True).sort_values(ascending=False)
        non_constant = variances.head(cap).index.tolist()
        logger.info(
            "Profiler: correlation limited to the %d highest-variance numeric columns (of %d)",
            cap, len(numeric_cols),
        )
    return non_constant


def _detect_datetime_columns(df: pd.DataFrame, object_cols: list[str]) -> dict[str, dict[str, Any]]:
    """Detect object columns that are really dates and summarize their range.

    Pandas parses date-looking CSV columns as plain object/string, so without
    this they'd be profiled as high-cardinality categoricals. For each column
    where at least `_DATETIME_PARSE_THRESHOLD` of the non-null values parse as
    dates, we report the min/max date and the distinct year/month/day counts
    the downstream feature-engineering hints can build on.
    """
    detected: dict[str, dict[str, Any]] = {}
    for col in object_cols:
        series = df[col].dropna()
        if series.empty:
            continue
        parsed = pd.to_datetime(series, errors="coerce", format="mixed")
        valid_ratio = parsed.notna().mean()
        if valid_ratio < _DATETIME_PARSE_THRESHOLD:
            continue
        parsed = parsed.dropna()
        detected[col] = {
            "type": "datetime",
            "min": str(parsed.min().date()),
            "max": str(parsed.max().date()),
            "distinct_years": int(parsed.dt.year.nunique()),
            "distinct_months": int(parsed.dt.month.nunique()),
            "distinct_days": int(parsed.dt.day.nunique()),
        }
        logger.info("Profiler: detected datetime column '%s' (%s to %s)", col, detected[col]["min"], detected[col]["max"])
    return detected


def load_dataframe(file_path: str) -> pd.DataFrame:
    """Load a CSV into a DataFrame using the same robust parsing profile_csv relies on.

    Shared with services that need to validate/preview a CSV (e.g. at upload time)
    without duplicating the encoding-fallback / missing-header repair logic.

    Raises:
        ProfilerError: if the file is missing, empty, corrupted, or otherwise
            cannot be parsed into a usable DataFrame.
    """
    path = Path(file_path)
    try:
        return _read_csv_with_fallback(path)
    except ProfilerError:
        raise
    except Exception as exc:  # noqa: BLE001 -- surface any unexpected pandas/OS error clearly
        raise ProfilerError(f"Unexpected error reading {path.name}: {exc}") from exc


def profile_csv(file_path: str) -> dict[str, Any]:
    """Profile a CSV file and return a JSON-serializable statistical summary.

    Args:
        file_path: Path to the CSV file to profile.

    Returns:
        A dict with keys: shape, columns, missing_values,
        missing_value_percentages, duplicates, numeric_summary,
        categorical_summary, datetime_columns, outliers, correlations.

    Raises:
        ProfilerError: if the file is missing, empty, corrupted, or otherwise
            cannot be parsed into a usable DataFrame.
    """
    path = Path(file_path)
    logger.info("Profiling CSV: %s", path.name)

    with log_duration(logger, f"profile_csv.file_read [{path.name}]"):
        df = load_dataframe(file_path)

    try:
        numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
        non_numeric_cols = df.select_dtypes(exclude=np.number).columns.tolist()

        with log_duration(logger, f"profile_csv.datetime_detection [{path.name}]"):
            datetime_columns = _detect_datetime_columns(df, non_numeric_cols)
        # Genuine datetime columns are summarized separately -- don't also
        # profile them as high-cardinality categoricals.
        categorical_cols = [c for c in non_numeric_cols if c not in datetime_columns]

        n_rows = int(df.shape[0])
        missing_counts = df.isnull().sum()
        missing_values = {str(col): int(count) for col, count in missing_counts.items() if count > 0}
        missing_value_percentages = {
            str(col): round(count / n_rows * 100, 2)
            for col, count in missing_counts.items()
            if count > 0 and n_rows > 0
        }

        with log_duration(logger, f"profile_csv.outlier_detection [{path.name}]"):
            outliers = _detect_outliers(df, numeric_cols)
        with log_duration(logger, f"profile_csv.correlations [{path.name}]"):
            correlations = _compute_correlations(df, numeric_cols)

        profile = {
            "shape": {"rows": int(df.shape[0]), "columns": int(df.shape[1])},
            "columns": {str(col): str(dtype) for col, dtype in df.dtypes.items()},
            "missing_values": missing_values,
            "missing_value_percentages": missing_value_percentages,
            "duplicates": int(df.duplicated().sum()),
            "numeric_summary": _profile_numeric_columns(df, numeric_cols),
            "categorical_summary": _profile_categorical_columns(df, categorical_cols),
            "datetime_columns": datetime_columns,
            "outliers": outliers,
            "correlations": correlations,
        }
    except (KeyError, ValueError) as exc:
        raise ProfilerError(f"Error computing profile statistics for {path.name}: {exc}") from exc

    logger.info(
        "Profiled %s: %d rows, %d columns, %d duplicates",
        path.name,
        profile["shape"]["rows"],
        profile["shape"]["columns"],
        profile["duplicates"],
    )
    return profile