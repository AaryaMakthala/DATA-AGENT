"""Dataset-level validity gate (CLAUDE.md Known Bugs, Issue 6a).

Runs right after profiling and target detection, before the LLM analysis
node -- so a dataset (or its detected target) that can't be modeled is
caught early and reported clearly to the caller, instead of wasting an LLM
call and a full cleaning/visualization pass on data that was never usable.

This is broader than the single-class-target check in `ml_recommender.py`
(Issue 1's backstop): it also catches empty files, all-duplicate datasets,
and near-empty datasets. Both layers share the same cardinality check via
`ml_recommender.check_target_cardinality` so there is exactly one definition
of what makes a target unusable.
"""

from typing import Any, Optional

import pandas as pd

from app.tools.ml_recommender import check_target_cardinality
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Below this row count, results are still computed but flagged as
# illustrative-only rather than blocked outright.
_MIN_ROWS_WARNING = 5

# Warn (not block) when this share of rows or more are exact duplicates.
_HIGH_DUPLICATE_WARNING_PCT = 20.0


def validate_dataset(
    df: pd.DataFrame,
    target_column: Optional[str],
    identifier_columns: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Decide whether a dataset (and its detected target, if any) can be modeled.

    Args:
        df: The original, uncleaned dataframe (loaded straight from the
            upload -- never a post-cleaning or post-encoding frame).
        target_column: The target column detected by
            `ml_recommender.detect_target_column` on this same original
            dataframe, or None if the dataset looks unsupervised.
        identifier_columns: Columns detected as identifiers by
            `ml_recommender.detect_identifier_columns`. Used to confirm at
            least one real feature column would survive cleaning -- a dataset
            whose every column is an identifier (or whose only column is the
            target) has nothing to model and, left ungated, makes the cleaner
            drop every column and write an empty CSV that crashes downstream
            profiling/visualization.

    Returns:
        {"valid": bool, "errors": list[str], "warnings": list[str],
         "duplicate_percentage": float}. `valid` is False only when `errors`
        is non-empty -- warnings never block analysis. `duplicate_percentage`
        is the share of rows that are exact duplicates (0-100), surfaced as a
        metric even when it's below the blocking threshold.
    """
    errors: list[str] = []
    warnings: list[str] = []

    n_rows = df.shape[0]
    duplicate_count = int(df.duplicated().sum()) if n_rows > 0 else 0
    duplicate_percentage = round(duplicate_count / n_rows * 100, 2) if n_rows > 0 else 0.0

    if df.shape[0] == 0:
        errors.append("The uploaded file has no data rows.")
    if df.shape[1] == 0:
        errors.append("The uploaded file has no columns.")
    if df.shape[0] > 0 and df.drop_duplicates().shape[0] < 2:
        errors.append(
            "After removing duplicate rows, fewer than 2 unique rows remain -- not enough data to analyze."
        )

    if duplicate_percentage >= _HIGH_DUPLICATE_WARNING_PCT:
        warnings.append(
            f"{duplicate_percentage:.1f}% of rows ({duplicate_count}) are exact duplicates; "
            "they will be removed during cleaning."
        )

    if target_column is not None and target_column in df.columns:
        cardinality_error = check_target_cardinality(df, target_column)
        if cardinality_error is not None:
            errors.append(cardinality_error)

    # No feature columns would survive cleaning: every column is either the
    # target or an identifier (which the cleaner drops). Without this gate the
    # cleaner produces a zero-column CSV that crashes the profiler/visualizer
    # with a raw 500 instead of the graceful "can't be analyzed" response.
    identifiers = set(identifier_columns or [])
    feature_columns = [
        col for col in df.columns if col != target_column and col not in identifiers
    ]
    if df.shape[1] > 0 and not feature_columns:
        errors.append(
            "No usable feature columns remain: every column looks like an identifier "
            "(unique IDs, names, or free text) or the target. There is nothing for a "
            "model to learn from."
        )

    if 0 < df.shape[0] < _MIN_ROWS_WARNING:
        warnings.append(
            f"Only {df.shape[0]} rows -- too little data for a reliable model recommendation; "
            "treat results as illustrative only."
        )

    # A dataset with no detectable target isn't invalid -- it's still useful for
    # exploratory/clustering analysis -- but the user should know supervised
    # modeling won't happen.
    if target_column is None and feature_columns:
        warnings.append(
            "No clear target column was detected. The dataset will be analyzed for exploratory "
            "insights and clustering rather than supervised prediction."
        )

    valid = len(errors) == 0
    logger.info(
        "Validator: dataset valid=%s duplicate_pct=%.1f errors=%s warnings=%s",
        valid, duplicate_percentage, errors, warnings,
    )
    return {
        "valid": valid,
        "errors": errors,
        "warnings": warnings,
        "duplicate_percentage": duplicate_percentage,
    }
