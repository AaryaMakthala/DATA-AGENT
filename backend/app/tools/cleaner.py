"""Executes the LLM-produced cleaning plan against the real dataset (CLAUDE.md §7).

The LLM never touches the data -- `cleaning_prompt.py` only asks it for a JSON
plan (which columns to impute, drop duplicates, cap/remove outliers, one-hot
encode). This module is what actually applies that plan to the DataFrame with
pandas and writes the cleaned CSV to disk.
"""

from pathlib import Path
from typing import Any, Optional

import pandas as pd

from app.tools.profiler import ProfilerError, load_dataframe
from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)

_VALID_MISSING_STRATEGIES = {"median", "mode", "drop"}
_VALID_OUTLIER_STRATEGIES = {"cap", "remove", "keep"}
_VALID_ENCODING_STRATEGIES = {"one_hot", "none"}

# Below this row count, IQR bounds are computed from too few points to be
# trustworthy, so capping/removal can strip legitimate extreme values. Outliers
# are still reported in the profile -- we just don't act on them here (CLAUDE.md
# Known Bugs, Issue 9).
_MIN_ROWS_FOR_OUTLIER_ACTION = 30

# Shown in place of whatever the LLM's raw plan proposed for the target column
# under missing_values/outliers/encoding -- those steps never actually run
# against the target (see the *_protection notes below), so the report must
# say so instead of echoing an action that never happened.
_TARGET_PROTECTED_LABEL = "skipped - target column is preserved"

# Reason surfaced in the applied plan for each identifier column the cleaner
# drops (CLAUDE.md Known Bugs, Issue 5).
_IDENTIFIER_DROP_REASON = (
    "Unique identifier column that does not contribute meaningful information for machine learning."
)


class CleanerError(Exception):
    """Raised when the cleaning plan cannot be applied to the dataset."""


def _sanitize_plan_for_report(cleaning_plan: dict[str, Any], target_column: Optional[str]) -> dict[str, Any]:
    """Rewrite the raw LLM plan's target-column entries to reflect reality.

    `missing_values`, `outliers`, and `encoding` never actually apply to the
    target column (see the `target_column` guards in `_apply_missing_values`,
    `_apply_outliers`, and `_apply_encoding` below) -- but the LLM doesn't
    know that when it proposes the plan. Without this, a plan like
    `{"outliers": {"Target": "remove"}}` gets echoed verbatim to the "Cleaning
    Plan Applied" report even though the target was never touched, which is
    misleading. `duplicates` is left untouched -- it isn't target-protected.
    """
    if target_column is None:
        return cleaning_plan
    sanitized = dict(cleaning_plan)
    for section in ("missing_values", "outliers", "encoding"):
        section_plan = sanitized.get(section)
        if isinstance(section_plan, dict) and target_column in section_plan:
            updated = dict(section_plan)
            updated[target_column] = _TARGET_PROTECTED_LABEL
            sanitized[section] = updated
    return sanitized


def _fillna_checked(df: pd.DataFrame, column: str, fill_value: Any) -> pd.DataFrame:
    """Fill missing values in `column` and verify no pre-existing value changed.

    Imputation must only ever populate cells that were NaN -- it must never
    alter a value that was already present (CLAUDE.md Known Bugs, Issue 8). We
    snapshot the non-null cells before filling and compare after; a mismatch
    means the imputation logic has a bug (not user error), so we log a loud
    warning rather than silently corrupting real data.
    """
    non_null_mask = df[column].notna()
    before = df.loc[non_null_mask, column].copy()
    df[column] = df[column].fillna(fill_value)
    after = df.loc[non_null_mask, column]
    if not before.equals(after):
        logger.warning(
            "Cleaner: imputation altered %d pre-existing non-null value(s) in column '%s' -- "
            "this indicates a bug in the imputation logic, not user data",
            int((before.values != after.values).sum()),
            column,
        )
    return df


def _apply_missing_values(df: pd.DataFrame, plan: dict[str, Any], target_column: Optional[str]) -> pd.DataFrame:
    """Impute or drop missing values per-column, following the LLM's plan.

    The target column is never imputed/dropped-on -- see cleaner target
    protection note in `clean_csv`.
    """
    for column, strategy in plan.items():
        if column not in df.columns:
            logger.warning("Cleaner: missing_values plan references unknown column '%s'; skipping", column)
            continue
        if column == target_column:
            logger.info("Cleaner: skipping missing_values strategy '%s' for target column '%s' -- target is preserved", strategy, column)
            continue
        if strategy not in _VALID_MISSING_STRATEGIES:
            logger.warning(
                "Cleaner: unrecognized missing_values strategy '%s' for column '%s'; skipping", strategy, column
            )
            continue

        if strategy == "drop":
            before = len(df)
            df = df.dropna(subset=[column])
            logger.info("Cleaner: dropped %d rows with missing '%s'", before - len(df), column)
        elif strategy == "median":
            if pd.api.types.is_numeric_dtype(df[column]):
                df = _fillna_checked(df, column, df[column].median())
            else:
                logger.warning(
                    "Cleaner: 'median' requested for non-numeric column '%s'; falling back to mode", column
                )
                mode = df[column].mode(dropna=True)
                if not mode.empty:
                    df = _fillna_checked(df, column, mode.iloc[0])
        elif strategy == "mode":
            mode = df[column].mode(dropna=True)
            if not mode.empty:
                df = _fillna_checked(df, column, mode.iloc[0])
    return df


def _apply_duplicates(df: pd.DataFrame, strategy: Any) -> pd.DataFrame:
    """Drop exact duplicate rows if the plan calls for it."""
    if not isinstance(strategy, str):
        return df
    if strategy == "drop":
        before = len(df)
        df = df.drop_duplicates()
        logger.info("Cleaner: dropped %d duplicate rows", before - len(df))
    elif strategy != "keep":
        logger.warning("Cleaner: unrecognized duplicates strategy '%s'; keeping duplicates", strategy)
    return df


def _apply_outliers(df: pd.DataFrame, plan: dict[str, Any], target_column: Optional[str]) -> pd.DataFrame:
    """Cap or remove IQR outliers per-column, following the LLM's plan.

    The target column is always excluded from outlier detection/capping/
    removal, regardless of problem type -- a classification label like a
    binary 0/1 Target is not an "outlier" just because one class is rare,
    and removing those rows silently collapses the target to a single class
    (see CLAUDE.md Known Bugs, Issue 6).

    On datasets under `_MIN_ROWS_FOR_OUTLIER_ACTION` rows, IQR bounds are too
    unreliable to act on, so capping/removal is skipped entirely and the
    outliers are left for the profile/report to surface (Known Bugs, Issue 9).
    """
    if len(df) < _MIN_ROWS_FOR_OUTLIER_ACTION:
        logger.info(
            "Cleaner: only %d rows (< %d) -- skipping all outlier capping/removal; "
            "outliers are reported in the profile but not acted on",
            len(df), _MIN_ROWS_FOR_OUTLIER_ACTION,
        )
        return df

    for column, strategy in plan.items():
        if column not in df.columns:
            logger.warning("Cleaner: outliers plan references unknown column '%s'; skipping", column)
            continue
        if column == target_column:
            logger.info("Cleaner: skipping outlier strategy '%s' for target column '%s' -- target is preserved", strategy, column)
            continue
        if not pd.api.types.is_numeric_dtype(df[column]):
            logger.warning("Cleaner: outlier strategy requested for non-numeric column '%s'; skipping", column)
            continue
        if strategy not in _VALID_OUTLIER_STRATEGIES or strategy == "keep":
            continue

        series = df[column].dropna()
        if series.empty:
            continue
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr

        if strategy == "cap":
            df[column] = df[column].clip(lower=lower, upper=upper)
            logger.info("Cleaner: capped outliers in '%s' to [%.4f, %.4f]", column, lower, upper)
        elif strategy == "remove":
            before = len(df)
            # Copy after boolean-mask filtering so later per-column assignments
            # (capping another column) operate on their own frame, not a slice
            # view of the original (avoids SettingWithCopyWarning + silent no-ops).
            df = df[df[column].isna() | df[column].between(lower, upper)].copy()
            logger.info("Cleaner: removed %d outlier rows from '%s'", before - len(df), column)
    return df


def _apply_encoding(df: pd.DataFrame, plan: dict[str, Any], target_column: Optional[str]) -> pd.DataFrame:
    """One-hot encode the columns the plan flags for it.

    The target column is never encoded -- it must reach the ML recommender
    in its original, unmodified form.
    """
    columns_to_encode = []
    for column, strategy in plan.items():
        if column not in df.columns:
            logger.warning("Cleaner: encoding plan references unknown column '%s'; skipping", column)
            continue
        if column == target_column:
            logger.info("Cleaner: skipping encoding strategy '%s' for target column '%s' -- target is preserved", strategy, column)
            continue
        if strategy not in _VALID_ENCODING_STRATEGIES:
            logger.warning("Cleaner: unrecognized encoding strategy '%s' for column '%s'; skipping", strategy, column)
            continue
        if strategy == "one_hot":
            columns_to_encode.append(column)

    if columns_to_encode:
        df = pd.get_dummies(df, columns=columns_to_encode, dtype=int)
        logger.info("Cleaner: one-hot encoded columns: %s", columns_to_encode)
    return df


def clean_csv(
    file_path: str,
    cleaning_plan: Any,
    file_id: str,
    target_column: Optional[str] = None,
    identifier_columns: Optional[list[str]] = None,
) -> tuple[str, dict[str, Any], str]:
    """Apply an LLM-produced cleaning plan to a CSV and save the cleaned result.

    Steps run in the order specified by CLAUDE.md §7: drop identifier columns,
    then missing values, duplicates, outliers, and finally categorical
    encoding. A snapshot of the frame taken *before* one-hot encoding is saved
    separately for visualization (Known Bugs, Issue 3) so charts are drawn
    from the original categorical columns rather than meaningless dummy-vs-dummy
    plots.

    Args:
        file_path: Path to the original uploaded CSV.
        cleaning_plan: Parsed JSON plan from the Cleaning Plan Node (see
            prompts/cleaning_prompt.py for the expected shape). May be
            malformed (e.g. a `{"raw_plan": ...}` fallback if the LLM didn't
            return valid JSON) -- handled gracefully by skipping steps that
            can't be understood rather than failing the whole pipeline.
        file_id: Identifier used to name the output file.
        target_column: The target column already identified by
            `detect_target_column` on the ORIGINAL uploaded dataframe (see
            `target_detection_node` in agents/graph.py). Deliberately NOT
            re-derived here -- target detection has exactly one call site in
            the whole pipeline, so every downstream node reuses that result
            instead of re-deriving it from whatever dataframe it happens to
            have on hand.
        identifier_columns: Columns detected as identifiers on the ORIGINAL
            dataframe (see `detect_identifier_columns`). These are dropped up
            front -- an arbitrary ID/Name/code carries no modeling signal and
            must not be charted or fed to the recommender (Known Bugs, Issues
            4 and 5).

    Returns:
        (cleaned_file_path, applied_plan, viz_file_path). `applied_plan` is
        what should be shown to the user -- the raw LLM plan with any
        target-column entries rewritten to reflect they were never applied
        (see `_sanitize_plan_for_report`) plus a `dropped_columns` section
        listing each identifier column dropped and why. `viz_file_path` is
        the pre-encoding snapshot the visualizer should draw from.

    Raises:
        CleanerError: if the original CSV can't be loaded.
    """
    try:
        df = load_dataframe(file_path)
    except ProfilerError as exc:
        raise CleanerError(f"Cannot clean unreadable CSV: {exc}") from exc

    if target_column is not None:
        logger.info("Cleaner: protecting detected target column '%s' from imputation/outlier/encoding steps", target_column)

    if not isinstance(cleaning_plan, dict) or "raw_plan" in cleaning_plan:
        logger.warning("Cleaner: cleaning plan is missing or malformed; no cleaning steps will be applied")
        applied_plan: dict[str, Any] = cleaning_plan if isinstance(cleaning_plan, dict) else {}
        cleaning_plan = {}
    else:
        applied_plan = _sanitize_plan_for_report(cleaning_plan, target_column)

    # Drop identifier columns first (never the target, even if it slipped into
    # the list) and record it in the applied plan so the report shows it.
    dropped = [
        col for col in (identifier_columns or [])
        if col in df.columns and col != target_column
    ]
    # Backstop: never drop every remaining column. The validator gates all-
    # identifier datasets to the invalid state before cleaning runs, so in the
    # real pipeline this is unreachable -- but if clean_csv is ever called
    # directly on such a frame, dropping all columns would write a zero-column
    # CSV that crashes the profiler ("no columns to parse"). Keep the columns
    # instead of producing an unreadable file.
    if dropped and len(dropped) >= df.shape[1]:
        logger.warning(
            "Cleaner: identifier drop would remove all %d columns; keeping them to avoid "
            "an empty dataset (dataset should have been gated as invalid upstream)",
            df.shape[1],
        )
        dropped = []
    if dropped:
        df = df.drop(columns=dropped)
        applied_plan = dict(applied_plan)
        applied_plan["dropped_columns"] = {col: _IDENTIFIER_DROP_REASON for col in dropped}
        logger.info("Cleaner: dropped identifier columns %s", dropped)

    missing_plan = cleaning_plan.get("missing_values")
    if isinstance(missing_plan, dict):
        df = _apply_missing_values(df, missing_plan, target_column)

    df = _apply_duplicates(df, cleaning_plan.get("duplicates", "keep"))

    outliers_plan = cleaning_plan.get("outliers")
    if isinstance(outliers_plan, dict):
        df = _apply_outliers(df, outliers_plan, target_column)

    # Snapshot for visualization BEFORE one-hot encoding (Issue 3): charts must
    # be drawn from the original categorical columns, not the dummy columns.
    viz_path = Config.CLEANED_FILES_FOLDER / f"{file_id}_viz.csv"
    try:
        df.to_csv(viz_path, index=False)
    except OSError as exc:
        raise CleanerError(f"Failed to write visualization snapshot to {viz_path}: {exc}") from exc

    encoding_plan = cleaning_plan.get("encoding")
    if isinstance(encoding_plan, dict):
        df = _apply_encoding(df, encoding_plan, target_column)

    output_path = Config.CLEANED_FILES_FOLDER / f"{file_id}_cleaned.csv"
    try:
        df.to_csv(output_path, index=False)
    except OSError as exc:
        raise CleanerError(f"Failed to write cleaned CSV to {output_path}: {exc}") from exc

    logger.info(
        "Cleaner: saved cleaned CSV to %s (%d rows, %d columns)", output_path.name, df.shape[0], df.shape[1]
    )
    return str(output_path), applied_plan, str(viz_path)
