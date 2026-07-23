"""Executes the LLM-produced cleaning plan against the real dataset (CLAUDE.md §7).

The LLM never touches the data -- `cleaning_prompt.py` only asks it for a JSON
plan (which columns to impute, drop duplicates, cap/remove outliers, one-hot
encode). This module is what actually applies that plan to the DataFrame with
pandas and writes the cleaned CSV to disk.
"""

from pathlib import Path
from typing import Any, Optional

import pandas as pd

from app.services import file_service
from app.tools.profiler import ProfilerError, load_dataframe
from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)

_VALID_MISSING_STRATEGIES = {"median", "mode", "drop"}
_VALID_OUTLIER_STRATEGIES = {"cap", "remove", "keep"}
_VALID_ENCODING_STRATEGIES = {"one_hot", "none"}

# One-hot encoding a high-cardinality column explodes the frame into thousands
# of near-empty dummy columns (e.g. a Customer_ID with one dummy per row).
# Skip encoding when a column has more than this many distinct values or when
# its unique/row ratio is above _MAX_ENCODE_UNIQUE_RATIO -- such columns are
# effectively identifiers/free text, not categorical features.
_MAX_CATEGORIES_FOR_ENCODING = 50
_MAX_ENCODE_UNIQUE_RATIO = 0.5

# A feature that is almost perfectly correlated with the target is target
# leakage -- it encodes the answer and would not be available at prediction
# time. We don't drop it automatically (that's a modeling decision), but we
# flag it loudly so it surfaces in the report.
_LEAKAGE_CORRELATION_THRESHOLD = 0.99

# Below this row count, IQR bounds are computed from too few points to be
# trustworthy, so capping/removal can strip legitimate extreme values. Outliers
# are still reported in the profile -- we just don't act on them here (CLAUDE.md
# Known Bugs, Issue 9).
_MIN_ROWS_FOR_OUTLIER_ACTION = 30

# Safeguard against row-collapsing missing-value "drop" strategies (CLAUDE.md
# Known Bugs, Issue 6). The LLM's cleaning prompt is allowed to choose "drop"
# for a column, and does so for very-high-missingness columns -- e.g. Titanic
# 'Cabin' is 77% missing, and dropping every row with a missing Cabin deletes
# 687 of 891 rows to preserve one column. That is almost always the wrong
# trade: you throw away most of the dataset to keep a mostly-empty feature.
# When a "drop" strategy would remove MORE than this fraction of the rows
# currently in hand, we drop the COLUMN instead of the rows -- preserving the
# sample size, which matters far more to every downstream model than one
# sparse feature. Below the threshold, "drop" still drops rows as planned.
_MAX_ROW_DROP_FRACTION_FOR_MISSING = 0.10

# Reason surfaced in the applied plan when the safeguard above converts a
# row-drop into a column-drop, so the report explains what actually happened.
_HIGH_MISSING_COLUMN_DROP_REASON = (
    "Column dropped instead of deleting rows: a 'drop' strategy here would have "
    "removed {pct:.0f}% of all rows ({missing} of {total}) to preserve one "
    "high-missingness column. Dropping the column preserves the sample size."
)

# Shown in place of whatever the LLM's raw plan proposed for the target column
# under missing_values/outliers/encoding -- those steps never actually run
# against the target (see the *_protection notes below), so the report must
# say so instead of echoing an action that never happened.
_TARGET_PROTECTED_LABEL = "skipped - target column is preserved"

# Shown in place of an encoding/outlier action the LLM proposed but the cleaner
# deliberately DID NOT execute (a high-cardinality/free-text column left
# un-encoded to avoid feature explosion; a non-numeric or too-few-rows column
# whose outliers weren't acted on). Without this the "Cleaning Plan Applied"
# report -- and the Cleaning Timeline built from it -- would claim an action
# ("One-hot encoded 'Ticket'") that never actually ran, contradicting the
# cleaned CSV (which still has the raw column). The timeline/before-after
# helpers treat any strategy that isn't the concrete action word as a no-op,
# so marking a skipped column with one of these labels drops it from both.
_ENCODING_SKIPPED_LABEL = (
    "skipped - column left un-encoded (high cardinality / free text would explode the feature space)"
)
_OUTLIER_SKIPPED_LABEL = (
    "skipped - outliers not acted on (non-numeric column or too few rows for reliable IQR bounds)"
)

# Reason surfaced in the applied plan for each identifier column the cleaner
# drops (CLAUDE.md Known Bugs, Issue 5).
_IDENTIFIER_DROP_REASON = (
    "Unique identifier column that does not contribute meaningful information for machine learning."
)


class CleanerError(Exception):
    """Raised when the cleaning plan cannot be applied to the dataset."""


def _log_df_state(file_id: str, stage: str, df: pd.DataFrame) -> None:
    """TEMPORARY diagnostic hook: log shape/columns/dtypes/dup-count at a pipeline stage.

    Added per debugging request to trace Bug #3 (duplicate-count mismatch).
    Call sites are placed after every dataframe-mutating step in clean_csv:
    after CSV load, after identifier removal, after missing-value handling,
    after duplicate removal, after outlier handling, before the visualization
    snapshot, after encoding, and (by the caller, post-reload) after saving/
    reloading the cleaned CSV. Cheap at INFO level; safe to strip once Bug #3
    and any related issues are confirmed fixed in production.
    """
    logger.info(
        "DIAG[%s] %s: shape=%s columns=%s dtypes=%s duplicated_sum=%d",
        file_id, stage, df.shape, list(df.columns), dict(df.dtypes.astype(str)),
        int(df.duplicated().sum()),
    )


def _strategy_of(value: Any) -> Any:
    """Extract the executable strategy from a plan entry.

    The plan entry for a column may be either the flat legacy form (a bare
    strategy string like "median") or the enriched form the LLM can now return,
    `{"action": "median", "reason": "...", "confidence": "high"}`. Both are
    accepted so the richer, self-explaining output stays executable. Anything
    else returns None (the caller then skips it with a warning).
    """
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        action = value.get("action")
        return action if isinstance(action, str) else None
    return None


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


def _apply_missing_values(
    df: pd.DataFrame, plan: dict[str, Any], target_column: Optional[str]
) -> tuple[pd.DataFrame, dict[str, str]]:
    """Impute or drop missing values per-column, following the LLM's plan.

    When a column is imputed (median/mode), a companion `<column>_missing`
    indicator column (1 where the original value was NaN, else 0) is added
    first, so the model can still learn from the fact that a value was missing
    rather than losing that signal to imputation. No indicator is added for the
    "drop" strategy (those rows leave entirely) or when the column has no
    missing values.

    A "drop" strategy that would remove more than
    `_MAX_ROW_DROP_FRACTION_FOR_MISSING` of the rows in hand is converted to a
    COLUMN drop instead (CLAUDE.md Known Bugs, Issue 6) -- deleting most of the
    dataset to preserve one very-sparse column is almost never the right trade.

    The target column is never imputed/dropped-on -- see cleaner target
    protection note in `clean_csv`.

    Returns:
        `(df, column_drops)` where `column_drops` maps each column the
        safeguard dropped (instead of dropping rows) to a human-readable
        reason, so the caller can record it in the applied-plan report.
    """
    column_drops: dict[str, str] = {}
    for column, raw_strategy in plan.items():
        strategy = _strategy_of(raw_strategy)
        if column not in df.columns:
            logger.warning(
                "Cleaner: missing_values plan references unknown column '%s'; skipping. Available columns: %s",
                column, list(df.columns),
            )
            continue
        if column == target_column:
            logger.info("Cleaner: skipping missing_values strategy '%s' for target column '%s' -- target is preserved", strategy, column)
            continue
        if strategy not in _VALID_MISSING_STRATEGIES:
            logger.warning(
                "Cleaner: unrecognized missing_values strategy '%s' for column '%s'; skipping", strategy, column
            )
            continue

        na_mask = df[column].isna()
        if strategy == "drop":
            total = len(df)
            missing = int(na_mask.sum())
            # Safeguard: if dropping rows for this column would delete more than
            # the allowed fraction of the dataset, drop the column instead.
            if total > 0 and missing / total > _MAX_ROW_DROP_FRACTION_FOR_MISSING:
                reason = _HIGH_MISSING_COLUMN_DROP_REASON.format(
                    pct=missing / total * 100, missing=missing, total=total
                )
                df = df.drop(columns=[column])
                column_drops[column] = reason
                logger.info(
                    "Cleaner: converted 'drop' rows -> drop COLUMN for '%s' (%d/%d = %.1f%% missing "
                    "exceeds %.0f%% row-loss safeguard)",
                    column, missing, total, missing / total * 100,
                    _MAX_ROW_DROP_FRACTION_FOR_MISSING * 100,
                )
                continue
            before = len(df)
            df = df.dropna(subset=[column])
            logger.info("Cleaner: dropped %d rows with missing '%s'", before - len(df), column)
            continue

        # median / mode: add the missing-indicator before filling, but only if
        # there is actually something to indicate.
        if na_mask.any():
            indicator = f"{column}_missing"
            if indicator not in df.columns:
                df[indicator] = na_mask.astype(int)
                logger.info("Cleaner: added missing-indicator column '%s' (%d missing)", indicator, int(na_mask.sum()))

        if strategy == "median":
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
    return df, column_drops


def _apply_duplicates(df: pd.DataFrame, strategy: Any) -> pd.DataFrame:
    """Drop exact duplicate rows if the plan calls for it."""
    strategy = _strategy_of(strategy)
    if not isinstance(strategy, str):
        return df
    if strategy == "drop":
        before = len(df)
        df = df.drop_duplicates()
        logger.info("Cleaner: dropped %d duplicate rows", before - len(df))
    elif strategy != "keep":
        logger.warning("Cleaner: unrecognized duplicates strategy '%s'; keeping duplicates", strategy)
    return df


def _apply_outliers(
    df: pd.DataFrame, plan: dict[str, Any], target_column: Optional[str]
) -> tuple[pd.DataFrame, list[str]]:
    """Cap or remove IQR outliers per-column, following the LLM's plan.

    The target column is always excluded from outlier detection/capping/
    removal, regardless of problem type -- a classification label like a
    binary 0/1 Target is not an "outlier" just because one class is rare,
    and removing those rows silently collapses the target to a single class
    (see CLAUDE.md Known Bugs, Issue 6).

    On datasets under `_MIN_ROWS_FOR_OUTLIER_ACTION` rows, IQR bounds are too
    unreliable to act on, so capping/removal is skipped entirely and the
    outliers are left for the profile/report to surface (Known Bugs, Issue 9).

    Returns:
        `(df, skipped_columns)` where `skipped_columns` lists every column the
        LLM asked to cap/remove that was NOT acted on (too few rows overall, a
        non-numeric column, or a column no longer present). The caller rewrites
        those entries in the applied-plan report so the Cleaning Timeline never
        claims an outlier action that didn't run.
    """
    skipped: list[str] = []
    if len(df) < _MIN_ROWS_FOR_OUTLIER_ACTION:
        logger.info(
            "Cleaner: only %d rows (< %d) -- skipping all outlier capping/removal; "
            "outliers are reported in the profile but not acted on",
            len(df), _MIN_ROWS_FOR_OUTLIER_ACTION,
        )
        # Every column the plan intended to cap/remove was skipped wholesale.
        skipped = [
            col for col, raw in plan.items()
            if col != target_column and _strategy_of(raw) in ("cap", "remove")
        ]
        return df, skipped

    for column, raw_strategy in plan.items():
        strategy = _strategy_of(raw_strategy)
        if column not in df.columns:
            logger.warning("Cleaner: outliers plan references unknown column '%s'; skipping", column)
            if strategy in ("cap", "remove"):
                skipped.append(column)
            continue
        if column == target_column:
            logger.info("Cleaner: skipping outlier strategy '%s' for target column '%s' -- target is preserved", strategy, column)
            continue
        if not pd.api.types.is_numeric_dtype(df[column]):
            logger.warning("Cleaner: outlier strategy requested for non-numeric column '%s'; skipping", column)
            if strategy in ("cap", "remove"):
                skipped.append(column)
            continue
        if strategy not in _VALID_OUTLIER_STRATEGIES or strategy == "keep":
            continue

        series = df[column].dropna()
        if series.empty:
            if strategy in ("cap", "remove"):
                skipped.append(column)
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
    return df, skipped


def _apply_encoding(
    df: pd.DataFrame, plan: dict[str, Any], target_column: Optional[str]
) -> tuple[pd.DataFrame, list[str]]:
    """One-hot encode the columns the plan flags for it.

    The target column is never encoded -- it must reach the ML recommender
    in its original, unmodified form.

    Returns:
        `(df, skipped_columns)` where `skipped_columns` lists every column the
        LLM asked to one-hot encode that was NOT encoded because its
        cardinality would explode the feature space (an ID/free-text field the
        LLM mistook for a category). The caller rewrites those entries in the
        applied-plan report so the Cleaning Timeline never claims a column was
        one-hot encoded when it wasn't -- the cleaned CSV still has it raw.
    """
    columns_to_encode = []
    skipped: list[str] = []
    for column, raw_strategy in plan.items():
        strategy = _strategy_of(raw_strategy)
        if column not in df.columns:
            logger.warning(
                "Cleaner: encoding plan references unknown column '%s'; skipping. Available columns: %s",
                column, list(df.columns),
            )
            if strategy == "one_hot":
                skipped.append(column)
            continue
        if column == target_column:
            logger.info("Cleaner: skipping encoding strategy '%s' for target column '%s' -- target is preserved", strategy, column)
            continue
        if strategy not in _VALID_ENCODING_STRATEGIES:
            logger.warning("Cleaner: unrecognized encoding strategy '%s' for column '%s'; skipping", strategy, column)
            continue
        if strategy != "one_hot":
            continue

        # Guard against one-hot explosion: a high-cardinality column (an ID or
        # free-text field the LLM mistook for a category) would add thousands
        # of near-empty dummy columns. Skip it and say why.
        n_unique = int(df[column].nunique(dropna=True))
        unique_ratio = n_unique / len(df) if len(df) else 0.0
        if n_unique > _MAX_CATEGORIES_FOR_ENCODING or unique_ratio > _MAX_ENCODE_UNIQUE_RATIO:
            logger.warning(
                "Cleaner: skipping one-hot encoding of '%s' -- %d unique values (ratio %.2f) exceeds "
                "the %d-category / %.2f-ratio cap; encoding it would explode the feature space",
                column, n_unique, unique_ratio, _MAX_CATEGORIES_FOR_ENCODING, _MAX_ENCODE_UNIQUE_RATIO,
            )
            skipped.append(column)
            continue
        columns_to_encode.append(column)

    if columns_to_encode:
        df = pd.get_dummies(df, columns=columns_to_encode, dtype=int)
        logger.info("Cleaner: one-hot encoded columns: %s", columns_to_encode)
    return df, skipped


def _ensure_not_empty(df: pd.DataFrame, after_step: str) -> None:
    """Raise if a cleaning step emptied the frame (all rows or all columns gone).

    A plan that drops every row (aggressive missing-value/outlier removal) or
    every column would otherwise write an unusable CSV that crashes the
    downstream profiler/visualizer with a raw error. Fail here with a clear,
    catchable message instead.
    """
    if df.shape[0] == 0:
        raise CleanerError(
            f"Cleaning left the dataset with no rows after {after_step}. "
            "The cleaning plan was too aggressive for this data."
        )
    if df.shape[1] == 0:
        raise CleanerError(
            f"Cleaning left the dataset with no columns after {after_step}."
        )


def _detect_target_leakage(df: pd.DataFrame, target_column: Optional[str]) -> list[str]:
    """Return feature columns almost perfectly correlated with the target.

    A feature with |corr| > _LEAKAGE_CORRELATION_THRESHOLD against a numeric
    target effectively encodes the answer (target leakage) and would inflate
    any model's apparent performance. Only computable when both the target and
    the feature are numeric; non-numeric targets are skipped. This flags, it
    does not drop -- removal is a modeling decision left to the user.
    """
    if target_column is None or target_column not in df.columns:
        return []
    if not pd.api.types.is_numeric_dtype(df[target_column]):
        return []
    numeric_features = [
        c for c in df.select_dtypes(include="number").columns
        if c != target_column and not c.endswith("_missing")
    ]
    leaked: list[str] = []
    target = df[target_column]
    for col in numeric_features:
        if df[col].nunique(dropna=True) <= 1:
            continue
        corr = df[col].corr(target)
        if pd.notna(corr) and abs(corr) > _LEAKAGE_CORRELATION_THRESHOLD:
            leaked.append(col)
            logger.warning(
                "Cleaner: possible target leakage -- feature '%s' correlates %.4f with target '%s'",
                col, corr, target_column,
            )
    return leaked


def clean_csv(
    file_path: str,
    cleaning_plan: Any,
    file_id: str,
    original_filename: str,
    target_column: Optional[str] = None,
    identifier_columns: Optional[list[str]] = None,
    df: Optional[pd.DataFrame] = None,
) -> tuple[str, dict[str, Any], str]:
    """Apply an LLM-produced cleaning plan to a CSV and save the cleaned result.

    Steps run in the order specified by CLAUDE.md §7: drop identifier columns,
    then missing values, duplicates, outliers, and finally categorical
    encoding. A snapshot of the frame taken *before* one-hot encoding is saved
    separately for visualization (Known Bugs, Issue 3) so charts are drawn
    from the original categorical columns rather than meaningless dummy-vs-dummy
    plots.

    Args:
        file_path: Path to the original uploaded CSV. Used only when `df` is
            not provided (see below).
        cleaning_plan: Parsed JSON plan from the Cleaning Plan Node (see
            prompts/cleaning_prompt.py for the expected shape). May be
            malformed (e.g. a `{"raw_plan": ...}` fallback if the LLM didn't
            return valid JSON) -- handled gracefully by skipping steps that
            can't be understood rather than failing the whole pipeline.
        file_id: Identifier used to name the output file.
        original_filename: The user's originally uploaded filename (resolved
            via file_service.resolve_original_filename by the caller), used
            to build human-readable output filenames instead of the raw
            file_id -- e.g. "large-dataset_cleaned.csv".
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
        df: Optional pre-loaded DataFrame of the original CSV. When provided
            by `python_cleaning_node` (which already loaded and repaired the
            CSV once in `profiler_node`), this avoids a redundant
            load_dataframe() call. When None (all other callers -- tests,
            harness, direct invocations), the file is loaded from `file_path`
            exactly as before. In both cases the cleaned result is still
            written to disk so downstream nodes can read it.

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
        if df is not None:
            # Reuse the DataFrame already loaded and repaired by profiler_node;
            # make a copy so cleaning mutations don't affect the caller's frame
            # (target_detection_node / validation_node share the same object).
            df = df.copy()
            logger.info("Cleaner: using pre-loaded DataFrame from state (skipping disk read)")
        else:
            df = load_dataframe(file_path)
    except ProfilerError as exc:
        raise CleanerError(f"Cannot clean unreadable CSV: {exc}") from exc

    _log_df_state(file_id, "after CSV load", df)

    if target_column is not None:
        logger.info("Cleaner: protecting detected target column '%s' from imputation/outlier/encoding steps", target_column)

    if not isinstance(cleaning_plan, dict) or "raw_plan" in cleaning_plan:
        logger.warning("Cleaner: cleaning plan is missing or malformed; no cleaning steps will be applied")
        applied_plan: dict[str, Any] = cleaning_plan if isinstance(cleaning_plan, dict) else {}
        cleaning_plan = {}
    else:
        applied_plan = _sanitize_plan_for_report(cleaning_plan, target_column)

    rows_initial = len(df)

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

    _log_df_state(file_id, "after identifier removal", df)

    missing_plan = cleaning_plan.get("missing_values")
    if isinstance(missing_plan, dict):
        df, missing_column_drops = _apply_missing_values(df, missing_plan, target_column)
        if missing_column_drops:
            # Record the safeguard's column drops in the applied plan so the
            # report shows the column was dropped (and why) rather than the
            # LLM's original row-drop proposal, which never ran.
            applied_plan = dict(applied_plan)
            merged_drops = dict(applied_plan.get("dropped_columns") or {})
            merged_drops.update(missing_column_drops)
            applied_plan["dropped_columns"] = merged_drops
    _ensure_not_empty(df, "missing-value handling")

    logger.info(
        "Cleaner diagnostics [%s]: rows_after_missing_values=%d (removed %d row(s) via missing-value 'drop' strategies)",
        file_id, len(df), rows_initial - len(df),
    )
    _log_df_state(file_id, "after missing-value handling", df)

    # --- Bug #3 fix -----------------------------------------------------
    # ROOT CAUSE (confirmed by reproduction): `original_duplicates` was
    # previously measured right after identifier-drop -- i.e. BEFORE
    # `_apply_missing_values` ran. But `_apply_missing_values` can both drop
    # rows (a "drop" missing-value strategy, e.g. 687 rows dropped for
    # missing 'Cabin' in the Titanic run) and change cell values (median/mode
    # imputation). Both of those legitimately change which rows are exact
    # duplicates of each other. Comparing a duplicate count measured BEFORE
    # that mutation to one measured AFTER it (`duplicates_remaining_post_dedup`)
    # is not a valid invariant -- the two counts describe different
    # dataframes, not two views of the same one. That mismatch is what the
    # logs reported as "Bug #3"; `_apply_duplicates` itself is not broken.
    #
    # FIX: measure `original_duplicates` here, immediately before
    # `_apply_duplicates` is called, on the exact frame it will operate on.
    # This makes the arithmetic invariant actually hold:
    #   - duplicates == "drop"  -> rows_removed_by_duplicates == original_duplicates
    #                              and duplicates_remaining_post_dedup == 0
    #   - duplicates == "keep"  -> rows_removed_by_duplicates == 0
    #                              and duplicates_remaining_post_dedup == original_duplicates
    duplicates_strategy = _strategy_of(cleaning_plan.get("duplicates", "keep"))
    rows_before_duplicates = len(df)
    original_duplicates = int(df.duplicated().sum())
    df = _apply_duplicates(df, cleaning_plan.get("duplicates", "keep"))
    rows_after_duplicates = len(df)
    rows_removed_by_duplicates = rows_before_duplicates - rows_after_duplicates
    duplicates_remaining_post_dedup = int(df.duplicated().sum())
    logger.info(
        "Cleaner diagnostics [%s]: duplicates_strategy=%r rows_before_duplicates=%d "
        "original_duplicates=%d rows_after_duplicates=%d rows_removed_by_duplicates=%d "
        "duplicates_remaining_post_dedup=%d",
        file_id, duplicates_strategy, rows_before_duplicates,
        original_duplicates, rows_after_duplicates,
        rows_removed_by_duplicates, duplicates_remaining_post_dedup,
    )
    # This warning previously fired -- and claimed drop_duplicates() had
    # been called -- even when the strategy was "keep", in which case
    # drop_duplicates() is never invoked and residual duplicates are
    # completely expected, not a bug. Now strategy-gated.
    if duplicates_strategy == "drop" and duplicates_remaining_post_dedup > 0:
        logger.warning(
            "Cleaner diagnostics [%s]: %d duplicate row(s) remain IMMEDIATELY after "
            "drop_duplicates() -- this should be mathematically impossible for an exact-match "
            "dedup on the same columns. Investigate _apply_duplicates.",
            file_id, duplicates_remaining_post_dedup,
        )
    if rows_removed_by_duplicates + duplicates_remaining_post_dedup != original_duplicates:
        logger.warning(
            "Cleaner diagnostics [%s]: DUPLICATE COUNT MISMATCH -- original_duplicates=%d but "
            "rows_removed_by_duplicates(%d) + duplicates_remaining_post_dedup(%d) = %d "
            "(discrepancy of %d) for strategy=%r. Investigate _apply_duplicates.",
            file_id, original_duplicates, rows_removed_by_duplicates, duplicates_remaining_post_dedup,
            rows_removed_by_duplicates + duplicates_remaining_post_dedup,
            original_duplicates - (rows_removed_by_duplicates + duplicates_remaining_post_dedup),
            duplicates_strategy,
        )
    _ensure_not_empty(df, "duplicate removal")
    _log_df_state(file_id, "after duplicate removal", df)

    outliers_plan = cleaning_plan.get("outliers")
    rows_before_outliers = len(df)
    if isinstance(outliers_plan, dict):
        df, outliers_skipped = _apply_outliers(df, outliers_plan, target_column)
        if outliers_skipped:
            # The report/timeline must reflect what actually ran: rewrite the
            # proposed cap/remove action for each skipped column so downstream
            # helpers don't claim an outlier action that never executed.
            applied_plan = dict(applied_plan)
            report_outliers = dict(applied_plan.get("outliers") or {})
            for col in outliers_skipped:
                report_outliers[col] = _OUTLIER_SKIPPED_LABEL
            applied_plan["outliers"] = report_outliers
    _ensure_not_empty(df, "outlier removal")

    rows_after_outliers = len(df)
    logger.info(
        "Cleaner diagnostics [%s]: rows_before_outliers=%d rows_after_outliers=%d rows_removed_by_outliers=%d",
        file_id, rows_before_outliers, rows_after_outliers, rows_before_outliers - rows_after_outliers,
    )
    _log_df_state(file_id, "after outlier handling", df)

    # Flag (don't drop) any feature that leaks the target -- surfaced in the
    # report so the user knows to exclude it before modeling.
    leaked = _detect_target_leakage(df, target_column)
    if leaked:
        applied_plan = dict(applied_plan)
        applied_plan["leakage_warnings"] = {
            col: f"Correlates >{_LEAKAGE_CORRELATION_THRESHOLD:.2f} with target '{target_column}' -- "
                 "likely target leakage; consider excluding it before modeling."
            for col in leaked
        }

    # Snapshot for visualization BEFORE one-hot encoding (Issue 3): charts must
    # be drawn from the original categorical columns, not the dummy columns.
    _log_df_state(file_id, "before visualization snapshot", df)
    viz_path = Config.CLEANED_FILES_FOLDER / file_service.build_artifact_filename(
        original_filename, "viz", "csv", Config.CLEANED_FILES_FOLDER, file_id
    )
    try:
        df.to_csv(viz_path, index=False)
    except OSError as exc:
        raise CleanerError(f"Failed to write visualization snapshot to {viz_path}: {exc}") from exc

    encoding_plan = cleaning_plan.get("encoding")
    if isinstance(encoding_plan, dict):
        df, encoding_skipped = _apply_encoding(df, encoding_plan, target_column)
        if encoding_skipped:
            # Same reconciliation as outliers above: a column the LLM asked to
            # one-hot encode but the cardinality guard skipped must NOT show up
            # in the report/timeline as "One-hot encoded 'X'" -- the cleaned CSV
            # still has it raw. Rewrite its proposed action to the skipped label
            # so build_cleaning_timeline / compute_before_after drop it.
            applied_plan = dict(applied_plan)
            report_encoding = dict(applied_plan.get("encoding") or {})
            for col in encoding_skipped:
                report_encoding[col] = _ENCODING_SKIPPED_LABEL
            applied_plan["encoding"] = report_encoding
    _log_df_state(file_id, "after encoding", df)

    output_path = Config.CLEANED_FILES_FOLDER / file_service.build_artifact_filename(
        original_filename, "cleaned", "csv", Config.CLEANED_FILES_FOLDER, file_id
    )
    try:
        df.to_csv(output_path, index=False)
    except OSError as exc:
        raise CleanerError(f"Failed to write cleaned CSV to {output_path}: {exc}") from exc

    logger.info(
        "Cleaner diagnostics [%s] SUMMARY: rows_initial=%d rows_final=%d total_rows_removed=%d | "
        "duplicates_strategy=%r original_duplicates=%d rows_removed_by_duplicates=%d "
        "duplicates_remaining_post_dedup=%d | rows_removed_by_other_operations=%d "
        "(missing-value drop + outlier removal)",
        file_id, rows_initial, len(df), rows_initial - len(df),
        duplicates_strategy, original_duplicates, rows_removed_by_duplicates, duplicates_remaining_post_dedup,
        (rows_initial - len(df)) - rows_removed_by_duplicates - (rows_before_outliers - rows_after_outliers)
        + (rows_before_outliers - rows_after_outliers),
    )

    logger.info(
        "Cleaner: saved cleaned CSV to %s (%d rows, %d columns)", output_path.name, df.shape[0], df.shape[1]
    )

    # Diagnostic: reload what was actually written to disk, to confirm the
    # saved file matches what we believe we just produced (catches any
    # to_csv/read_csv round-trip surprises, e.g. dtype coercion creating new
    # "duplicates" that didn't exist in memory).
    try:
        reloaded = pd.read_csv(output_path, low_memory=False)
        _log_df_state(file_id, "after reloading saved cleaned CSV", reloaded)
        if int(reloaded.duplicated().sum()) != duplicates_remaining_post_dedup:
            logger.warning(
                "Cleaner diagnostics [%s]: reloaded cleaned CSV has duplicated_sum=%d but in-memory "
                "frame had %d immediately before saving -- CSV round-trip is changing duplicate "
                "structure (likely dtype/string-formatting drift, e.g. float 1.0 vs int 1).",
                file_id, int(reloaded.duplicated().sum()), duplicates_remaining_post_dedup,
            )
    except Exception as exc:  # noqa: BLE001 -- diagnostic only, must never break the pipeline
        logger.warning("Cleaner diagnostics [%s]: could not reload saved CSV for verification: %s", file_id, exc)

    return str(output_path), applied_plan, str(viz_path)