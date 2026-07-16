"""CSV profiling engine.

Reads a CSV file and produces a JSON-serializable statistical profile using
pandas/numpy only. This profile is what gets sent to the LLM later in the
pipeline -- the LLM never sees the raw dataset, only this summary.
"""

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


class ProfilerError(Exception):
    """Raised when a CSV cannot be read or profiled, with a clear reason."""


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
            df = pd.read_csv(file_path, encoding=encoding)
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

    _enforce_size_limits(df, file_path)
    df = _fix_missing_header_if_needed(df, file_path)
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
