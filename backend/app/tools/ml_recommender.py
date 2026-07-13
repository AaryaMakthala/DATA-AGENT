"""Heuristic ML algorithm recommender (CLAUDE.md §9).

This is a heuristic recommender, not a training pipeline. No models are ever
trained, fit, or run here -- every recommendation comes from reasoning about
the dataset's characteristics (shape, dtypes, target column, cardinality,
missing data, outliers) against established rules of thumb about which
algorithms suit which kinds of data. Nothing in this module's output is a
claim about measured performance on this dataset.

Two stages:
  A. Problem type detection -- is this classification, regression, or clustering?
  B. Heuristic model ranking -- given the detected problem type and the
     dataset's shape/composition, rank the standard candidate algorithms with
     a plain-English reason each.
"""

from typing import Any, Optional

import pandas as pd

from app.tools.profiler import ProfilerError, load_dataframe
from app.utils.logger import get_logger

logger = get_logger(__name__)

# --- Stage A thresholds -----------------------------------------------------

_TARGET_NAME_CANDIDATES = {"target", "label", "class", "y"}
# A last-column fallback target is rejected if it looks like a unique
# identifier (e.g. a primary key) rather than a label -- nearly every row
# having a distinct value is the tell.
_ID_LIKE_UNIQUENESS_RATIO = 0.95
_LOW_CARDINALITY_MAX_UNIQUE = 20
_LOW_CARDINALITY_MAX_RATIO = 0.05
# Below this absolute unique-value count, a numeric target is treated as
# categorical regardless of the unique/total ratio -- e.g. a binary 0/1
# target in a 12-row dataset has ratio 0.167 (fails the 0.05 check) but is
# unambiguously a class label, not a continuous quantity. The ratio check
# only earns its keep for disambiguating the 11-20 unique value range.
_ALWAYS_LOW_CARDINALITY_MAX_UNIQUE = 10

# --- Stage B thresholds ------------------------------------------------------

_SMALL_DATASET_ROWS = 300  # "a few hundred rows or fewer" (CLAUDE.md §9)
_HIGH_DIM_COLUMN_COUNT = 15
_SIGNIFICANT_OUTLIER_FRACTION = 0.02  # outlier occurrences per numeric cell
_SIGNIFICANT_MISSING_FRACTION = 0.05  # missing cells per total cell
_IMBALANCED_CLASS_RATIO = 0.2  # minority/majority class count ratio
_EXTREME_SKEW_THRESHOLD = 0.5  # avg |mean-median|/std across numeric columns


class MLRecommenderError(Exception):
    """Raised when a dataset cannot be reasoned about for algorithm recommendations."""


def _detect_target_column(df: pd.DataFrame) -> tuple[Optional[str], str]:
    """Identify a likely target column, or determine none exists (CLAUDE.md §9 Stage A).

    Returns:
        (target_column, reasoning). target_column is None when the dataset
        looks unsupervised (no named target-like column and the last column
        looks like an identifier rather than a label).
    """
    for column in df.columns:
        if column.strip().lower() in _TARGET_NAME_CANDIDATES:
            return column, f"Column '{column}' matches a common target-column naming convention."

    if df.shape[1] < 2:
        return None, "Dataset has only one column, so there is no feature/target split to supervise on."

    last_column = df.columns[-1]
    total = len(df)
    nunique = df[last_column].nunique(dropna=True)
    uniqueness_ratio = (nunique / total) if total else 0.0

    if uniqueness_ratio >= _ID_LIKE_UNIQUENESS_RATIO:
        return None, (
            f"No explicitly named target column found, and the last column '{last_column}' looks like a "
            f"unique identifier ({uniqueness_ratio:.2f} unique/total ratio) rather than a label; "
            "treating this as unsupervised data."
        )

    return last_column, (
        f"No explicitly named target column found; using the last column '{last_column}' as the target "
        f"by convention (its {uniqueness_ratio:.2f} unique/total ratio is low enough to plausibly be a label)."
    )


def _detect_problem_type(df: pd.DataFrame, target_column: Optional[str]) -> tuple[str, str]:
    """Classify the problem as classification, regression, or clustering (Stage A)."""
    if target_column is None:
        return "clustering", "No usable target column was identified, so this is treated as unsupervised."

    series = df[target_column].dropna()
    total = len(series)
    nunique = series.nunique()
    ratio = (nunique / total) if total else 0.0
    is_numeric = pd.api.types.is_numeric_dtype(df[target_column])

    if not is_numeric:
        return "classification", (
            f"Target '{target_column}' has dtype {df[target_column].dtype} (non-numeric) with "
            f"{nunique} unique values, so it's treated as a set of class labels."
        )

    if nunique <= _ALWAYS_LOW_CARDINALITY_MAX_UNIQUE:
        return "classification", (
            f"Target '{target_column}' is numeric but has only {nunique} unique values, which reads "
            "as encoded class labels regardless of dataset size, rather than a continuous quantity."
        )

    if nunique <= _LOW_CARDINALITY_MAX_UNIQUE and ratio < _LOW_CARDINALITY_MAX_RATIO:
        return "classification", (
            f"Target '{target_column}' is numeric but low-cardinality ({nunique} unique values, "
            f"{ratio:.3f} unique/total ratio), consistent with encoded class labels rather than a "
            "continuous quantity."
        )

    return "regression", (
        f"Target '{target_column}' is numeric with high cardinality ({nunique} unique values, "
        f"{ratio:.3f} unique/total ratio), consistent with a continuous target."
    )


def _dataset_signals(df: pd.DataFrame, profile: dict[str, Any], target_column: Optional[str]) -> dict[str, Any]:
    """Compute the dataset characteristics Stage B ranks candidates against."""
    feature_df = df.drop(columns=[target_column]) if target_column else df
    n_rows = int(profile["shape"]["rows"])
    numeric_cols = feature_df.select_dtypes(include="number").columns.tolist()
    categorical_cols = feature_df.select_dtypes(exclude="number").columns.tolist()

    total_outliers = sum(entry.get("count", 0) for entry in profile.get("outliers", {}).values())
    outlier_fraction = total_outliers / (n_rows * max(len(numeric_cols), 1)) if n_rows else 0.0

    total_cells = n_rows * max(profile["shape"]["columns"], 1)
    total_missing = sum(profile.get("missing_values", {}).values())
    missing_fraction = total_missing / total_cells if total_cells else 0.0

    return {
        "n_rows": n_rows,
        "n_numeric": len(numeric_cols),
        "n_categorical": len(categorical_cols),
        "is_small": n_rows <= _SMALL_DATASET_ROWS,
        "is_high_dim_or_mixed": (
            (len(numeric_cols) > 0 and len(categorical_cols) > 0)
            or profile["shape"]["columns"] >= _HIGH_DIM_COLUMN_COUNT
        ),
        "has_significant_outliers": outlier_fraction > _SIGNIFICANT_OUTLIER_FRACTION,
        "has_significant_missing": missing_fraction > _SIGNIFICANT_MISSING_FRACTION,
    }


def _class_balance_signal(df: pd.DataFrame, target_column: str) -> tuple[bool, str]:
    """Check for significant class imbalance in a classification target."""
    counts = df[target_column].dropna().value_counts()
    if len(counts) < 2:
        return False, "Target has fewer than two observed classes; class balance is not a factor."
    ratio = counts.min() / counts.max()
    imbalanced = ratio < _IMBALANCED_CLASS_RATIO
    descriptor = "imbalanced" if imbalanced else "reasonably balanced"
    return imbalanced, f"Class distribution is {descriptor} (minority/majority ratio {ratio:.2f})."


def _skew_signal(profile: dict[str, Any]) -> bool:
    """Estimate whether numeric columns are notably skewed, using mean/median/std from the profile."""
    numeric_summary = profile.get("numeric_summary", {})
    skew_scores = []
    for stats in numeric_summary.values():
        mean, median, std = stats.get("mean"), stats.get("median"), stats.get("std")
        if mean is None or median is None or not std:
            continue
        skew_scores.append(abs(mean - median) / std)
    if not skew_scores:
        return False
    return (sum(skew_scores) / len(skew_scores)) > _EXTREME_SKEW_THRESHOLD


def _rank_classification_models(df: pd.DataFrame, signals: dict[str, Any], target_column: str) -> list[dict[str, str]]:
    """Rank Logistic Regression, Random Forest, Gradient Boosting, XGBoost for a classification problem."""
    is_imbalanced, balance_note = _class_balance_signal(df, target_column)

    candidates = {
        "Logistic Regression": 0,
        "Random Forest": 0,
        "Gradient Boosting": 0,
        "XGBoost": 0,
    }
    reason_parts: dict[str, list[str]] = {name: [] for name in candidates}

    if signals["is_small"]:
        candidates["Logistic Regression"] += 2
        candidates["Random Forest"] -= 1
        candidates["Gradient Boosting"] -= 1
        candidates["XGBoost"] -= 2
        reason_parts["Logistic Regression"].append(
            f"the dataset is small ({signals['n_rows']} rows), where simpler linear models tend to "
            "generalize better than tree ensembles that need more data to shine"
        )
        for name in ("Random Forest", "Gradient Boosting", "XGBoost"):
            reason_parts[name].append(f"the small dataset size ({signals['n_rows']} rows) limits how well it can learn")

    if signals["is_high_dim_or_mixed"]:
        candidates["Random Forest"] += 2
        candidates["Gradient Boosting"] += 2
        candidates["XGBoost"] += 2
        for name in ("Random Forest", "Gradient Boosting", "XGBoost"):
            reason_parts[name].append(
                "it handles mixed numeric/categorical and higher-dimensional features without heavy preprocessing"
            )
        reason_parts["Logistic Regression"].append(
            "the mixed/high-dimensional feature set would need substantial preprocessing to work well with a linear model"
        )

    if signals["has_significant_outliers"]:
        candidates["Random Forest"] += 1
        candidates["Gradient Boosting"] += 1
        candidates["XGBoost"] += 1
        candidates["Logistic Regression"] -= 1
        for name in ("Random Forest", "Gradient Boosting", "XGBoost"):
            reason_parts[name].append("it's robust to the outliers found in the profile")
        reason_parts["Logistic Regression"].append("it's more sensitive to the outliers detected in this dataset")

    if is_imbalanced:
        candidates["Random Forest"] += 1
        candidates["Gradient Boosting"] += 1
        candidates["XGBoost"] += 1
        for name in ("Random Forest", "Gradient Boosting", "XGBoost"):
            reason_parts[name].append(balance_note.lower())
    else:
        for name in candidates:
            reason_parts[name].append(balance_note.lower())

    return _finalize_ranking(candidates, reason_parts)


def _rank_regression_models(signals: dict[str, Any]) -> list[dict[str, str]]:
    """Rank Linear Regression, Random Forest Regressor, Gradient Boosting for a regression problem."""
    candidates = {
        "Linear Regression": 0,
        "Random Forest Regressor": 0,
        "Gradient Boosting": 0,
    }
    reason_parts: dict[str, list[str]] = {name: [] for name in candidates}

    if signals["is_small"]:
        candidates["Linear Regression"] += 2
        candidates["Random Forest Regressor"] -= 1
        candidates["Gradient Boosting"] -= 1
        reason_parts["Linear Regression"].append(
            f"the dataset is small ({signals['n_rows']} rows), favoring a simple model less prone to overfitting"
        )
        for name in ("Random Forest Regressor", "Gradient Boosting"):
            reason_parts[name].append(f"the small dataset size ({signals['n_rows']} rows) limits how well it can learn")

    if signals["is_high_dim_or_mixed"]:
        candidates["Random Forest Regressor"] += 2
        candidates["Gradient Boosting"] += 2
        for name in ("Random Forest Regressor", "Gradient Boosting"):
            reason_parts[name].append(
                "it handles mixed numeric/categorical and higher-dimensional features without heavy preprocessing"
            )
        reason_parts["Linear Regression"].append(
            "the mixed/high-dimensional feature set would need substantial preprocessing to fit well linearly"
        )

    if signals["has_significant_outliers"]:
        candidates["Random Forest Regressor"] += 1
        candidates["Gradient Boosting"] += 1
        candidates["Linear Regression"] -= 1
        for name in ("Random Forest Regressor", "Gradient Boosting"):
            reason_parts[name].append("it's robust to the outliers found in the profile")
        reason_parts["Linear Regression"].append("it's more sensitive to the outliers detected in this dataset")

    return _finalize_ranking(candidates, reason_parts)


def _rank_clustering_models(profile: dict[str, Any], signals: dict[str, Any]) -> list[dict[str, str]]:
    """Rank KMeans and DBSCAN for a clustering problem."""
    skewed = _skew_signal(profile)
    noisy = signals["has_significant_outliers"]

    if skewed or noisy:
        reason_bits = []
        if skewed:
            reason_bits.append("notable skew across numeric columns")
        if noisy:
            reason_bits.append("a significant fraction of outlier points")
        detail = " and ".join(reason_bits)
        return [
            {
                "name": "DBSCAN",
                "reason": f"The profile shows {detail}, which violates KMeans's assumption of roughly "
                "spherical, similarly-sized clusters -- DBSCAN's density-based approach handles noise "
                "and irregular cluster shapes better.",
            },
            {
                "name": "KMeans",
                "reason": "A reasonable alternative once the data is de-skewed or outliers are handled, "
                "but its spherical-cluster assumption is a weaker fit for this profile as-is.",
            },
        ]

    return [
        {
            "name": "KMeans",
            "reason": "The profile shows no extreme skew or significant outliers, so the roughly spherical, "
            "similarly-sized cluster assumption KMeans relies on is plausible here.",
        },
        {
            "name": "DBSCAN",
            "reason": "A solid alternative if the true cluster structure turns out to be density-based or "
            "noisy, but there's no strong signal for that in this profile.",
        },
    ]


def _finalize_ranking(candidates: dict[str, int], reason_parts: dict[str, list[str]]) -> list[dict[str, str]]:
    """Sort candidates by heuristic score and compose a plain-English reason for each."""
    ordered_names = list(candidates.keys())  # preserves a stable, documented tie-break order
    ranked_names = sorted(ordered_names, key=lambda name: candidates[name], reverse=True)

    ranked_models = []
    for name in ranked_names:
        parts = reason_parts[name]
        reason = "; ".join(parts[:3]) if parts else "No strong dataset signals favored or disfavored this model."
        reason = reason[0].upper() + reason[1:] + "." if reason and not reason.endswith(".") else reason
        ranked_models.append({"name": name, "reason": reason})
    return ranked_models


def recommend_algorithms(file_path: str, profile: dict[str, Any]) -> dict[str, Any]:
    """Produce a heuristic ML algorithm recommendation for a (cleaned) dataset.

    No models are trained here -- see module docstring. This reasons purely
    from the dataset's shape/dtypes/cardinality (via the DataFrame) and the
    profiler's precomputed statistics (missing values, outliers).

    Args:
        file_path: Path to the CSV to reason about (the cleaned CSV, per the
            LangGraph node sequence in CLAUDE.md §5).
        profile: The JSON profile produced by profiler.profile_csv for this
            dataset (used for outlier/missing/skew signals).

    Returns:
        A dict matching the shape in CLAUDE.md §9: problem_type,
        target_column, detection_reasoning, ranked_models, top_recommendation.

    Raises:
        MLRecommenderError: if the CSV cannot be loaded.
    """
    try:
        df = load_dataframe(file_path)
    except ProfilerError as exc:
        raise MLRecommenderError(f"Cannot recommend algorithms for unreadable CSV: {exc}") from exc

    target_column, target_reasoning = _detect_target_column(df)
    problem_type, type_reasoning = _detect_problem_type(df, target_column)
    detection_reasoning = f"{target_reasoning} {type_reasoning}".strip()

    logger.info(
        "ML recommender: detected problem_type=%s target_column=%s -- %s",
        problem_type, target_column, detection_reasoning,
    )

    signals = _dataset_signals(df, profile, target_column)

    if problem_type == "classification":
        ranked_models = _rank_classification_models(df, signals, target_column)
    elif problem_type == "regression":
        ranked_models = _rank_regression_models(signals)
    else:
        ranked_models = _rank_clustering_models(profile, signals)

    top_recommendation = ranked_models[0]["name"] if ranked_models else None

    return {
        "problem_type": problem_type,
        "target_column": target_column,
        "detection_reasoning": detection_reasoning,
        "ranked_models": ranked_models,
        "top_recommendation": top_recommendation,
    }
