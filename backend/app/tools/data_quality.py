"""Data quality scoring (0-100) computed purely in Python from the profile.

No LLM is involved -- this is a deterministic score derived from the profiler's
statistics plus the detected target, so the frontend can show a single
at-a-glance "how clean is this data" number alongside the concrete issues that
dragged it down.

The score is a weighted sum of five components, each scored 0-1 (1 = perfect)
then combined by weight:

    missing values     30%   fraction of cells that are missing
    duplicate rows     20%   fraction of rows that are exact duplicates
    outliers           20%   fraction of numeric cells flagged as IQR outliers
    feature quality    20%   share of columns that carry usable signal
                             (penalizes constant and identifier-like columns)
    class balance      10%   minority/majority ratio of the target (supervised
                             only; full credit when there is no target)

Every number here comes from real computation on the profiled data -- nothing
is illustrative (CLAUDE.md §14).
"""

from typing import Any, Optional

from app.utils.logger import get_logger

logger = get_logger(__name__)

# Component weights (must sum to 1.0).
_WEIGHT_MISSING = 0.30
_WEIGHT_DUPLICATES = 0.20
_WEIGHT_OUTLIERS = 0.20
_WEIGHT_FEATURES = 0.20
_WEIGHT_BALANCE = 0.10

# Thresholds above which a component contributes an entry to the issues list.
_MISSING_ISSUE_FRACTION = 0.05      # >5% of cells missing
_DUPLICATE_ISSUE_FRACTION = 0.05    # >5% duplicate rows
_OUTLIER_ISSUE_FRACTION = 0.05      # >5% of numeric cells are outliers
_IMBALANCE_ISSUE_RATIO = 0.2        # minority/majority < 0.2


def _missing_component(profile: dict[str, Any], total_cells: int) -> tuple[float, Optional[str]]:
    total_missing = sum(profile.get("missing_values", {}).values())
    fraction = total_missing / total_cells if total_cells else 0.0
    score = max(0.0, 1.0 - fraction)
    issue = None
    if fraction > _MISSING_ISSUE_FRACTION:
        issue = f"High missing values: {fraction * 100:.1f}% of all cells are empty."
    return score, issue


def _duplicate_component(profile: dict[str, Any], n_rows: int) -> tuple[float, Optional[str]]:
    duplicates = int(profile.get("duplicates", 0))
    fraction = duplicates / n_rows if n_rows else 0.0
    score = max(0.0, 1.0 - fraction)
    issue = None
    if fraction > _DUPLICATE_ISSUE_FRACTION:
        issue = f"Duplicate rows: {fraction * 100:.1f}% of rows ({duplicates}) are exact duplicates."
    return score, issue


def _outlier_component(profile: dict[str, Any], n_rows: int) -> tuple[float, Optional[str]]:
    outliers = profile.get("outliers", {})
    n_numeric = len(outliers)
    total_numeric_cells = n_rows * n_numeric
    if total_numeric_cells == 0:
        return 1.0, None
    total_outliers = sum(entry.get("count", 0) for entry in outliers.values())
    fraction = total_outliers / total_numeric_cells
    score = max(0.0, 1.0 - fraction)
    issue = None
    if fraction > _OUTLIER_ISSUE_FRACTION:
        issue = f"Outliers: {fraction * 100:.1f}% of numeric values fall outside the IQR fences."
    return score, issue


def _feature_component(
    profile: dict[str, Any],
    identifier_columns: Optional[list[str]],
) -> tuple[float, Optional[str]]:
    """Share of columns that carry usable modeling signal.

    Constant columns (a single unique value) and identifier columns contribute
    no signal, so a dataset that is mostly IDs/constants scores low here.
    """
    columns = profile.get("columns", {})
    n_cols = len(columns)
    if n_cols == 0:
        return 0.0, "No columns to model."

    identifiers = set(identifier_columns or [])

    constant_cols = 0
    for col, summary in profile.get("numeric_summary", {}).items():
        if summary.get("min") is not None and summary.get("min") == summary.get("max"):
            constant_cols += 1
    for col, summary in profile.get("categorical_summary", {}).items():
        if summary.get("unique_count", 0) <= 1:
            constant_cols += 1

    unusable = identifiers | {
        col for col, s in profile.get("categorical_summary", {}).items()
        if s.get("unique_count", 0) <= 1
    }
    # Count numeric constants that aren't already identifiers.
    usable_cols = [
        col for col in columns
        if col not in unusable
    ]
    # Remove numeric constants from usable set.
    numeric_constants = {
        col for col, s in profile.get("numeric_summary", {}).items()
        if s.get("min") is not None and s.get("min") == s.get("max")
    }
    usable_cols = [c for c in usable_cols if c not in numeric_constants]

    score = len(usable_cols) / n_cols
    issue = None
    dead = n_cols - len(usable_cols)
    if score < 0.5:
        issue = (
            f"Low feature quality: {dead} of {n_cols} columns are identifiers or constant "
            "and carry no modeling signal."
        )
    return score, issue


def _balance_component(
    profile: dict[str, Any],
    target_column: Optional[str],
    problem_type: Optional[str],
) -> tuple[float, Optional[str]]:
    """Class-balance score for a classification target; full credit otherwise."""
    if not target_column or problem_type != "classification":
        return 1.0, None
    cat = profile.get("categorical_summary", {}).get(target_column)
    num = profile.get("numeric_summary", {}).get(target_column)
    freq = None
    if cat is not None:
        freq = cat.get("frequency_table")
    if not freq:
        # Numeric low-cardinality target: no frequency table in the profile,
        # so we can't assess balance here -- give full credit rather than guess.
        return 1.0, None
    counts = list(freq.values())
    if len(counts) < 2:
        return 1.0, None
    ratio = min(counts) / max(counts)
    score = min(1.0, ratio / _IMBALANCE_ISSUE_RATIO)  # <ratio 0.2 scales down, >=0.2 full
    issue = None
    if ratio < _IMBALANCE_ISSUE_RATIO:
        minority_pct = min(counts) / sum(counts) * 100
        issue = (
            f"Target imbalance: the smallest class of '{target_column}' is only "
            f"{minority_pct:.1f}% of rows (minority/majority ratio {ratio:.2f})."
        )
    return score, issue


def compute_quality_score(
    profile: dict[str, Any],
    target_column: Optional[str] = None,
    problem_type: Optional[str] = None,
    identifier_columns: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Compute a 0-100 data quality score plus the issues that lowered it.

    Args:
        profile: The JSON profile from `profiler.profile_csv`.
        target_column: The detected target (for the class-balance component),
            or None for unsupervised data.
        problem_type: The detected problem type ("classification"/"regression"/
            etc.). Class balance is only scored for classification.
        identifier_columns: Detected identifier columns (penalized in the
            feature-quality component).

    Returns:
        {"quality_score": int 0-100, "components": {name: 0-100},
         "issues": [str, ...]}. `issues` is ordered by component weight so the
        most impactful problems come first.
    """
    n_rows = int(profile.get("shape", {}).get("rows", 0))
    n_cols = int(profile.get("shape", {}).get("columns", 0))
    total_cells = n_rows * n_cols

    missing_s, missing_i = _missing_component(profile, total_cells)
    dup_s, dup_i = _duplicate_component(profile, n_rows)
    out_s, out_i = _outlier_component(profile, n_rows)
    feat_s, feat_i = _feature_component(profile, identifier_columns)
    bal_s, bal_i = _balance_component(profile, target_column, problem_type)

    overall = (
        missing_s * _WEIGHT_MISSING
        + dup_s * _WEIGHT_DUPLICATES
        + out_s * _WEIGHT_OUTLIERS
        + feat_s * _WEIGHT_FEATURES
        + bal_s * _WEIGHT_BALANCE
    )
    quality_score = int(round(overall * 100))

    # Ordered by weight (missing 30 > dup/out/feat 20 > balance 10).
    issues = [i for i in (missing_i, dup_i, out_i, feat_i, bal_i) if i]

    result = {
        "quality_score": quality_score,
        "components": {
            "missing_values": int(round(missing_s * 100)),
            "duplicates": int(round(dup_s * 100)),
            "outliers": int(round(out_s * 100)),
            "feature_quality": int(round(feat_s * 100)),
            "class_balance": int(round(bal_s * 100)),
        },
        "issues": issues,
    }
    logger.info("Data quality: score=%d issues=%d", quality_score, len(issues))
    return result
