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


def validate_dataset(df: pd.DataFrame, target_column: Optional[str]) -> dict[str, Any]:
    """Decide whether a dataset (and its detected target, if any) can be modeled.

    Args:
        df: The original, uncleaned dataframe (loaded straight from the
            upload -- never a post-cleaning or post-encoding frame).
        target_column: The target column detected by
            `ml_recommender.detect_target_column` on this same original
            dataframe, or None if the dataset looks unsupervised.

    Returns:
        {"valid": bool, "errors": list[str], "warnings": list[str]}.
        `valid` is False only when `errors` is non-empty -- warnings never
        block analysis.
    """
    errors: list[str] = []
    warnings: list[str] = []

    if df.shape[0] == 0:
        errors.append("The uploaded file has no data rows.")
    if df.shape[1] == 0:
        errors.append("The uploaded file has no columns.")
    if df.shape[0] > 0 and df.drop_duplicates().shape[0] < 2:
        errors.append(
            "After removing duplicate rows, fewer than 2 unique rows remain -- not enough data to analyze."
        )

    if target_column is not None and target_column in df.columns:
        cardinality_error = check_target_cardinality(df, target_column)
        if cardinality_error is not None:
            errors.append(cardinality_error)

    if 0 < df.shape[0] < _MIN_ROWS_WARNING:
        warnings.append(
            f"Only {df.shape[0]} rows -- too little data for a reliable model recommendation; "
            "treat results as illustrative only."
        )

    valid = len(errors) == 0
    logger.info("Validator: dataset valid=%s errors=%s warnings=%s", valid, errors, warnings)
    return {"valid": valid, "errors": errors, "warnings": warnings}
