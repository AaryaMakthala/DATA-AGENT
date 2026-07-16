"""Heuristic ML algorithm recommender (CLAUDE.md §9).

This is a heuristic recommender, not a training pipeline. No models are ever
trained, fit, or run here -- every recommendation comes from reasoning about
the dataset's characteristics (shape, dtypes, target column, cardinality,
missing data, outliers) against established rules of thumb about which
algorithms suit which kinds of data. Nothing in this module's output is a
claim about measured performance on this dataset.

Two stages:
  A. Target + problem-type detection -- which column is the prediction target
     (scored by name meaning, dtype, cardinality, identifier probability, and
     predictability -- never "the last column by convention"), and is the
     resulting problem classification, regression, or clustering?
  B. Heuristic model ranking -- given the detected problem type and the
     dataset's shape/composition (size, numeric vs categorical mix, outliers,
     imbalance), rank the candidate algorithms with a confidence label and a
     plain-English reason each. The ranking is data-dependent: a small tabular
     set, a large one, and a categorical-heavy one produce different orders --
     Random Forest is not hard-wired to win.
"""

from typing import Any, Optional

import re

import pandas as pd

from app.tools.profiler import ProfilerError, load_dataframe
from app.utils.logger import get_logger

logger = get_logger(__name__)

# --- Stage A: target detection ----------------------------------------------

# Column names that almost unambiguously mark a prediction target.
_TARGET_NAME_STRONG = {
    "target", "label", "class", "outcome", "result", "y", "response",
    "churn", "churned", "default", "defaulted", "fraud", "fraudulent",
    "converted", "conversion", "survived", "approved", "click", "clicked",
    "spam", "diagnosis", "disease", "purchased", "subscribed",
}
# Business-metric name hints that make a *numeric* column a good regression
# target (a quantity you would realistically predict).
_REGRESSION_NAME_HINTS = {
    "salary", "price", "income", "cost", "revenue", "amount", "sales",
    "charges", "charge", "fare", "demand", "rating", "score", "value",
    "profit", "expense", "budget", "wage", "pay", "balance", "premium",
    "total", "sale", "spend", "spending", "earnings", "compensation",
}
# Name hints for columns that are almost always *features*, not targets --
# geography, timestamps, and contact fields. Down-weighted as target
# candidates (e.g. City is a feature, not something you predict).
_FEATURE_NAME_HINTS = {
    "city", "state", "country", "region", "zip", "zipcode", "postal",
    "address", "location", "lat", "lng", "latitude", "longitude", "date",
    "time", "year", "month", "day", "timestamp", "phone", "email",
}

# Column-name substrings that mark a column as a likely identifier (CLAUDE.md
# Known Bugs, Issue 4/5). Matched against word-ish tokens in the name so that
# 'Age' doesn't match 'id'/'e' and 'income' doesn't match 'code'.
_ID_NAME_PATTERNS = (
    "id", "uuid", "guid", "identifier", "code", "number", "no", "key",
    "index", "email", "phone", "name", "customer", "user", "transaction",
    "account", "ssn",
)
# Above this unique/total ratio a *non-numeric* column reads as an identifier
# (every row a distinct string). Applied to arbitrary numeric columns it would
# wrongly flag genuinely continuous features/targets in small datasets, so the
# numeric path uses the stricter "perfectly sequential integer index" test in
# `_is_sequential_integer` instead.
_ID_UNIQUENESS_RATIO = 0.8

# Cardinality thresholds shared by target detection and problem-type inference.
_LOW_CARDINALITY_MAX_UNIQUE = 20
_LOW_CARDINALITY_MAX_RATIO = 0.05
# Below this absolute unique-value count, a numeric target is treated as
# categorical regardless of the unique/total ratio -- e.g. a binary 0/1
# target in a 12-row dataset has ratio 0.167 (fails the 0.05 check) but is
# unambiguously a class label, not a continuous quantity.
_ALWAYS_LOW_CARDINALITY_MAX_UNIQUE = 10

# --- Stage B: model ranking thresholds --------------------------------------

_SMALL_DATASET_ROWS = 300  # "a few hundred rows or fewer" (CLAUDE.md §9)
_LARGE_DATASET_ROWS = 50_000  # where boosting-on-large-tabular really pulls ahead
_HIGH_DIM_COLUMN_COUNT = 15
_MANY_CATEGORICAL_MIN = 5  # >= this many categorical features reads as categorical-heavy
_SIGNIFICANT_OUTLIER_FRACTION = 0.02  # outlier occurrences per numeric cell
_SIGNIFICANT_MISSING_FRACTION = 0.05  # missing cells per total cell
_IMBALANCED_CLASS_RATIO = 0.2  # minority/majority class count ratio
_MINORITY_CLASS_WARNING_FRACTION = 0.1  # warn when smallest class < 10% of rows
_EXTREME_SKEW_THRESHOLD = 0.5  # avg |mean-median|/std across numeric columns


class MLRecommenderError(Exception):
    """Raised when a dataset cannot be reasoned about for algorithm recommendations."""


# ---------------------------------------------------------------------------
# Identifier detection (Issue 4/5)
# ---------------------------------------------------------------------------

def _name_matches_identifier(column: str) -> bool:
    """True if the column name contains an identifier-like token (word-boundary aware)."""
    tokens = re.split(r"[^a-z0-9]+", column.strip().lower())
    return any(token in _ID_NAME_PATTERNS for token in tokens if token)


def _is_sequential_integer(series: pd.Series) -> bool:
    """True if the column is a perfectly consecutive integer index (1,2,3,...).

    This is the tell of a surrogate key / row index that carries no predictive
    signal. It is deliberately strict -- every value distinct AND the values
    form an unbroken run (max-min == count-1) -- so it flags a running ID
    column without ever catching a genuinely continuous numeric metric like
    Salary or Price, whose values are near-unique but not consecutive.
    """
    clean = series.dropna()
    n = len(clean)
    if n < 2:
        return False
    if not pd.api.types.is_numeric_dtype(clean):
        return False
    # Must be integer-valued (int dtype, or floats that are whole numbers).
    if not ((clean % 1) == 0).all():
        return False
    if clean.nunique() != n:
        return False
    return (clean.max() - clean.min()) == (n - 1)


def is_identifier_column(col_name: str, series: pd.Series, total_rows: int) -> bool:
    """Decide whether a column is an identifier rather than a usable feature/target.

    A column qualifies if ANY of:
      * its name contains an identifier token ('id', 'uuid', 'code',
        'identifier', 'number', 'name', 'key', ...), OR
      * it is a non-numeric column whose values are almost all distinct
        (uniqueness ratio above `_ID_UNIQUENESS_RATIO` -- near-unique free
        text, e.g. a full name or record code), OR
      * it is a perfectly sequential integer index (see
        `_is_sequential_integer`) -- a surrogate row key.

    The numeric uniqueness path is intentionally restricted to the sequential
    test: a small dataset can have a genuinely continuous numeric feature (or
    a regression target) where every value is unique, and that must not be
    mistaken for an identifier.
    """
    if _name_matches_identifier(col_name):
        return True
    if _is_sequential_integer(series):
        return True
    if pd.api.types.is_numeric_dtype(series):
        return False
    uniqueness_ratio = (series.nunique(dropna=True) / total_rows) if total_rows else 0.0
    return uniqueness_ratio > _ID_UNIQUENESS_RATIO


def detect_identifier_columns(df: pd.DataFrame, target_column: Optional[str]) -> list[str]:
    """Return the columns that look like identifiers and should be excluded (Issue 4/5).

    The target column is never treated as an identifier even if its name or
    cardinality would otherwise match -- it has already been validated as a
    usable label by the time this runs.
    """
    total_rows = len(df)
    identifiers = []
    for column in df.columns:
        if column == target_column:
            continue
        if is_identifier_column(column, df[column], total_rows):
            identifiers.append(column)
    return identifiers


# ---------------------------------------------------------------------------
# Problem-type inference (shared by target scoring and final detection)
# ---------------------------------------------------------------------------

def _problem_type_for_series(series: pd.Series) -> tuple[str, int, float, bool]:
    """Infer whether a non-null series reads as a classification or regression target.

    Returns (problem_type, nunique, ratio, is_numeric). Single source of truth
    for the classification-vs-regression decision so target scoring and the
    final `_detect_problem_type` never disagree.
    """
    total = len(series)
    nunique = int(series.nunique())
    ratio = (nunique / total) if total else 0.0
    is_numeric = pd.api.types.is_numeric_dtype(series)

    if not is_numeric:
        return "classification", nunique, ratio, is_numeric
    if nunique <= _ALWAYS_LOW_CARDINALITY_MAX_UNIQUE:
        return "classification", nunique, ratio, is_numeric
    if nunique <= _LOW_CARDINALITY_MAX_UNIQUE and ratio < _LOW_CARDINALITY_MAX_RATIO:
        return "classification", nunique, ratio, is_numeric
    return "regression", nunique, ratio, is_numeric


def _name_tokens(column: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", column.strip().lower()) if t}


def _score_target_candidate(
    column: str, series: pd.Series, total_rows: int
) -> Optional[dict[str, Any]]:
    """Score how plausibly a column is the prediction target (0..1), or None to skip.

    Combines four signals, per the redesign brief:
      * column-name meaning (explicit target word, business-metric hint, or a
        feature-ish geography/time/contact name that down-weights it),
      * datatype + cardinality (does it read as a clean regression or
        classification target, or as high-cardinality free text that can't be
        predicted),
      * predictability (near-unique text is not a learnable target).

    Returns {column, type, confidence, reason} or None when the column can't be
    a target at all (single-valued after dropping nulls).
    """
    clean = series.dropna()
    if clean.nunique() <= 1:
        return None  # constant column -- nothing to predict

    ptype, nunique, ratio, is_numeric = _problem_type_for_series(clean)
    tokens = _name_tokens(column)
    reasons: list[str] = []

    score = 0.0

    # --- name meaning ---
    if tokens & _TARGET_NAME_STRONG:
        score += 0.55
        reasons.append(f"name '{column}' matches a common target/label convention")
    elif is_numeric and (tokens & _REGRESSION_NAME_HINTS):
        score += 0.30
        reasons.append(f"name '{column}' is a business metric you'd typically predict")
    if tokens & _FEATURE_NAME_HINTS:
        score -= 0.30
        reasons.append(f"name '{column}' looks like a descriptive feature (geography/time/contact), not a target")

    # --- datatype + cardinality suitability ---
    if ptype == "regression":
        score += 0.35
        reasons.append(f"continuous numeric with {nunique} distinct values")
        # A strongly continuous spread (near-unique) is the natural shape of a
        # regression target; a coarser numeric column is a weaker target.
        if ratio >= 0.5:
            score += 0.15
        elif ratio >= 0.2:
            score += 0.08
    else:  # classification
        if nunique == 2:
            score += 0.40
            reasons.append("binary column -- a natural classification target")
        elif nunique <= _LOW_CARDINALITY_MAX_UNIQUE:
            score += 0.25
            reasons.append(f"low-cardinality categorical ({nunique} classes)")
        else:
            score += 0.05
            reasons.append(f"high-cardinality categorical ({nunique} values) -- weak as a target")

    # --- predictability penalty: near-unique free text can't be learned ---
    if not is_numeric and ratio > 0.5:
        score -= 0.40
        reasons.append(f"values are nearly all distinct ({ratio:.0%} unique) -- reads as free text, not a label")

    confidence = max(0.0, min(1.0, score))
    reason = "; ".join(reasons)
    reason = reason[0].upper() + reason[1:] if reason else "No strong target signal."
    return {
        "column": column,
        "type": ptype,
        "confidence": round(confidence, 2),
        "reason": reason,
    }


def score_target_candidates(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Rank every non-identifier column by its confidence as the prediction target.

    Identifier columns (surrogate keys, near-unique text, sequential indexes)
    are excluded outright -- they can never be a target. The remaining columns
    are scored by `_score_target_candidate` and returned highest-confidence
    first.
    """
    total_rows = len(df)
    identifiers = set(detect_identifier_columns(df, target_column=None))
    candidates: list[dict[str, Any]] = []
    for column in df.columns:
        if column in identifiers:
            continue
        scored = _score_target_candidate(column, df[column], total_rows)
        if scored is not None:
            candidates.append(scored)
    candidates.sort(key=lambda c: c["confidence"], reverse=True)
    return candidates


def detect_target_column(
    df: pd.DataFrame,
) -> tuple[Optional[str], str, list[dict[str, Any]]]:
    """Identify the most likely target column by confidence scoring (CLAUDE.md §9 Stage A).

    Never assumes the last column is the target. Detection has two tiers:

    1. Explicit intent -- if a column's name is an unambiguous target word
       ('target', 'label', 'class', 'churn', ...), that column is honored as
       the target directly, even if it turns out to be single-valued. This
       preserves the Known Bugs Issue 1/2 backstop: a user who names a column
       'Target' means it, so a single-class 'Target' must still reach the
       "invalid" rejection rather than being quietly swapped for some other
       column.
    2. Inference -- otherwise every non-identifier column is scored on name
       meaning, dtype, cardinality, and predictability; the highest scorer
       wins. When nothing scores meaningfully, the dataset is treated as
       unsupervised (target None).

    Returns:
        (target_column, reasoning, possible_targets). `possible_targets` is the
        full ranked candidate list (each {column, type, confidence, reason}) so
        callers can surface alternatives -- especially when no target is
        obvious.
    """
    if df.shape[1] < 2:
        return None, (
            "Dataset has only one column, so there is no feature/target split to supervise on."
        ), []

    candidates = score_target_candidates(df)

    # Tier 1: honor an explicitly-named target column. Among strongly-named
    # columns, prefer the highest-scored (a usable one over a degenerate one),
    # but fall back to a strong-named column even if it scored as unusable so
    # the single-class backstop in `_detect_problem_type` can reject it.
    strong_named = [c for c in df.columns if _name_tokens(c) & _TARGET_NAME_STRONG]
    if strong_named:
        scored_by_col = {c["column"]: c for c in candidates}
        best_named = max(
            strong_named,
            key=lambda c: scored_by_col[c]["confidence"] if c in scored_by_col else -1.0,
        )
        cand = scored_by_col.get(best_named)
        if cand is not None:
            reasoning = (
                f"Target inferred automatically based on dataset characteristics: '{best_named}' "
                f"(confidence {cand['confidence']:.2f}) -- {cand['reason']}."
            )
        else:
            reasoning = (
                f"Column '{best_named}' matches a common target-naming convention, so it is treated "
                "as the intended target."
            )
        return best_named, reasoning, candidates

    if not candidates:
        return None, (
            "No column scored as a plausible prediction target (all columns look like "
            "identifiers or free text); treating this as unsupervised data."
        ), []

    best = candidates[0]
    # A near-zero best score means nothing looks like a real target -- prefer
    # unsupervised over forcing a weak column into the target role.
    if best["confidence"] < 0.15:
        return None, (
            "No column scored as a plausible prediction target "
            f"(highest candidate '{best['column']}' scored only {best['confidence']:.2f}); "
            "treating this as unsupervised data."
        ), candidates

    reasoning = (
        f"Target inferred automatically based on dataset characteristics: '{best['column']}' "
        f"(confidence {best['confidence']:.2f}) -- {best['reason']}."
    )
    return best["column"], reasoning, candidates


def check_target_cardinality(df: pd.DataFrame, target_column: str) -> Optional[str]:
    """Return an error message if the target column can't support modeling, else None.

    Single source of truth for the "is this target usable at all" check --
    used both as the Stage A backstop below and by `validator.py`'s
    dataset-level validity gate (CLAUDE.md Known Bugs, Issues 1 and 6a).
    """
    series = df[target_column].dropna()
    if series.empty:
        return f"Target column '{target_column}' is entirely missing/null."
    nunique = series.nunique()
    if nunique <= 1:
        return (
            f"Target column '{target_column}' contains only {nunique} unique value(s) in "
            f"{len(series)} non-null row(s). A predictive model cannot learn from a single-class target."
        )
    return None


def _detect_problem_type(df: pd.DataFrame, target_column: Optional[str]) -> tuple[str, str]:
    """Classify the problem as classification, regression, clustering, or invalid (Stage A)."""
    if target_column is None:
        return "unknown", (
            "No explicit target column detected. Dataset can be used for exploratory analysis, "
            "clustering, anomaly detection, or visualization."
        )

    cardinality_error = check_target_cardinality(df, target_column)
    if cardinality_error is not None:
        return "invalid", cardinality_error

    series = df[target_column].dropna()
    ptype, nunique, ratio, is_numeric = _problem_type_for_series(series)

    if ptype == "classification":
        if not is_numeric:
            return "classification", (
                f"Target '{target_column}' has dtype {df[target_column].dtype} (non-numeric) with "
                f"{nunique} unique values, so it's treated as a set of class labels."
            )
        return "classification", (
            f"Target '{target_column}' is numeric but low-cardinality ({nunique} unique values, "
            f"{ratio:.3f} unique/total ratio), consistent with encoded class labels rather than a "
            "continuous quantity."
        )

    return "regression", (
        f"Target '{target_column}' is numeric with high cardinality ({nunique} unique values, "
        f"{ratio:.3f} unique/total ratio), consistent with a continuous target."
    )


# ---------------------------------------------------------------------------
# Stage B: dataset signals + model ranking
# ---------------------------------------------------------------------------

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

    n_numeric = len(numeric_cols)
    n_categorical = len(categorical_cols)
    return {
        "n_rows": n_rows,
        "n_numeric": n_numeric,
        "n_categorical": n_categorical,
        "is_small": n_rows <= _SMALL_DATASET_ROWS,
        "is_large": n_rows >= _LARGE_DATASET_ROWS,
        "is_high_dim_or_mixed": (
            (n_numeric > 0 and n_categorical > 0)
            or profile["shape"]["columns"] >= _HIGH_DIM_COLUMN_COUNT
        ),
        "is_categorical_heavy": (
            n_categorical >= _MANY_CATEGORICAL_MIN
            or (n_categorical >= 3 and n_categorical > n_numeric)
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
    return imbalanced, f"class distribution is {descriptor} (minority/majority ratio {ratio:.2f})"


def _format_minority_fraction(fraction: float) -> str:
    """Format a minority-class share so extreme imbalance never rounds to '0%'.

    A 1-in-100,000 minority is 0.001%, which `{:.0%}` renders as a misleading
    "0%". Pick enough decimal places to always show a non-zero figure: whole
    percents down to 1%, then progressively finer precision for rarer classes.
    """
    percent = fraction * 100
    if percent >= 1:
        return f"{percent:.0f}%"
    if percent >= 0.1:
        return f"{percent:.1f}%"
    if percent >= 0.01:
        return f"{percent:.2f}%"
    return f"{percent:.2g}%"


def _class_imbalance_warning(df: pd.DataFrame, target_column: str) -> Optional[str]:
    """Return a user-facing warning if the smallest class is under ~10% of rows (Issue 10)."""
    counts = df[target_column].dropna().value_counts()
    total = int(counts.sum())
    if len(counts) < 2 or total == 0:
        return None
    minority_count = int(counts.min())
    minority_fraction = minority_count / total
    if minority_fraction >= _MINORITY_CLASS_WARNING_FRACTION:
        return None
    share = _format_minority_fraction(minority_fraction)
    return (
        f"Target classes are highly imbalanced (minority class: {share} of rows -- "
        f"{minority_count:,} of {total:,}). "
        "Consider class weights, oversampling, or stratified splitting when training."
    )


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


def _confidence_label(score: float, top_score: float) -> str:
    """Map a candidate's score (relative to the winner) to a coarse confidence label."""
    gap = top_score - score
    if gap <= 0.5:
        return "High"
    if gap <= 2.0:
        return "Medium-High"
    return "Medium"


def _finalize_ranking(
    scores: dict[str, float], reason_parts: dict[str, list[str]]
) -> list[dict[str, str]]:
    """Sort candidates by score (desc), then compose a confidence label + reason for each.

    Ties break by insertion order of `scores`, so the caller controls the
    fallback ordering per problem type -- there is no single model hard-wired
    to win.
    """
    ordered = sorted(scores.keys(), key=lambda name: scores[name], reverse=True)
    top_score = scores[ordered[0]] if ordered else 0.0

    ranked: list[dict[str, str]] = []
    for name in ordered:
        parts = reason_parts.get(name, [])
        reason = "; ".join(parts[:3]) if parts else "A standard candidate for this problem type with no strong signal for or against it."
        reason = reason[0].upper() + reason[1:]
        if not reason.endswith("."):
            reason += "."
        ranked.append({
            "name": name,
            "confidence": _confidence_label(scores[name], top_score),
            "reason": reason,
        })
    return ranked


def _rank_classification_models(df: pd.DataFrame, signals: dict[str, Any], target_column: str) -> list[dict[str, str]]:
    """Rank classification candidates by dataset characteristics (not a fixed order)."""
    is_imbalanced, balance_note = _class_balance_signal(df, target_column)

    # Base scores encode the default preference for small/medium tabular data
    # (Gradient Boosting > Random Forest > XGBoost > Logistic Regression),
    # deliberately NOT Random-Forest-first.
    scores: dict[str, float] = {
        "Gradient Boosting": 3.0,
        "Random Forest": 2.0,
        "XGBoost": 2.0,
        "Logistic Regression": 1.0,
    }
    reason_parts: dict[str, list[str]] = {name: [] for name in scores}
    for name in ("Gradient Boosting", "Random Forest", "XGBoost"):
        reason_parts[name].append("strong on structured tabular data with non-linear relationships")
    reason_parts["Random Forest"].append("robust baseline that needs little tuning and is easy to interpret via feature importances")
    reason_parts["Logistic Regression"].append("a simple, highly interpretable linear baseline")

    # Large tabular data -> boosting libraries pull ahead; make optional
    # high-performance libraries available as candidates.
    if signals["is_large"]:
        scores["XGBoost"] += 4.0
        scores["LightGBM"] = 5.5
        scores["CatBoost"] = 5.0
        reason_parts["LightGBM"] = [f"scales efficiently to large datasets ({signals['n_rows']:,} rows)"]
        reason_parts["CatBoost"] = ["handles large tabular data well with strong defaults"]
        reason_parts["XGBoost"].append(f"excels on large datasets ({signals['n_rows']:,} rows)")

    # Categorical-heavy data -> CatBoost/boosting favored (native categorical handling).
    if signals["is_categorical_heavy"]:
        scores["CatBoost"] = max(scores.get("CatBoost", 0.0), 6.0)
        scores["XGBoost"] += 2.0
        scores["Gradient Boosting"] += 1.0
        reason_parts.setdefault("CatBoost", []).insert(0, f"handles the many categorical features ({signals['n_categorical']}) natively without heavy encoding")
        reason_parts["XGBoost"].append("handles mixed categorical/numeric features well")

    # Small dataset -> lift the simple baseline's rank (it generalizes well
    # with little data) and dock the most data-hungry ensemble (XGBoost).
    # Deliberately does NOT overtake Gradient Boosting: the brief wants
    # Gradient Boosting first for small/medium tabular data, with the linear
    # model as a clearly-explained simpler alternative, not the default winner.
    if signals["is_small"]:
        scores["Logistic Regression"] += 1.5
        scores["XGBoost"] -= 1.0
        reason_parts["Logistic Regression"].insert(0, f"the small dataset ({signals['n_rows']} rows) makes this simple, interpretable model a competitive baseline")
        reason_parts["XGBoost"].append(f"the small dataset ({signals['n_rows']} rows) gives this data-hungry booster less room to shine; it benefits from more data and tuning")

    # Outliers -> tree ensembles are robust; linear models are sensitive.
    if signals["has_significant_outliers"]:
        for name in ("Random Forest", "Gradient Boosting", "XGBoost"):
            scores[name] += 1.0
            reason_parts[name].append("robust to the outliers found in the profile")
        scores["Logistic Regression"] -= 1.0
        reason_parts["Logistic Regression"].append("more sensitive to the outliers detected in this dataset")

    # High-dim / mixed features -> tree ensembles handle them without heavy prep.
    if signals["is_high_dim_or_mixed"]:
        for name in ("Random Forest", "Gradient Boosting", "XGBoost"):
            scores[name] += 1.0
            reason_parts[name].append("handles higher-dimensional mixed features without heavy preprocessing")

    # Imbalance -> tree ensembles with class weighting cope better; always note it.
    if is_imbalanced:
        for name in ("Random Forest", "Gradient Boosting", "XGBoost"):
            scores[name] += 0.5
            reason_parts[name].append(balance_note)

    return _finalize_ranking(scores, reason_parts)


def _rank_regression_models(signals: dict[str, Any]) -> list[dict[str, str]]:
    """Rank regression candidates by dataset characteristics (not a fixed order)."""
    scores: dict[str, float] = {
        "Gradient Boosting Regressor": 3.0,
        "Random Forest Regressor": 2.0,
        "XGBoost Regressor": 2.0,
        "Linear Regression": 1.0,
    }
    reason_parts: dict[str, list[str]] = {name: [] for name in scores}
    for name in ("Gradient Boosting Regressor", "Random Forest Regressor", "XGBoost Regressor"):
        reason_parts[name].append("strong on structured tabular data with non-linear relationships")
    reason_parts["Random Forest Regressor"].append("robust baseline requiring minimal tuning")
    reason_parts["Linear Regression"].append("a simple, highly interpretable linear baseline")

    if signals["is_large"]:
        scores["XGBoost Regressor"] += 4.0
        scores["LightGBM Regressor"] = 5.5
        scores["CatBoost Regressor"] = 5.0
        reason_parts["LightGBM Regressor"] = [f"scales efficiently to large datasets ({signals['n_rows']:,} rows)"]
        reason_parts["CatBoost Regressor"] = ["handles large tabular data well with strong defaults"]
        reason_parts["XGBoost Regressor"].append(f"excels on large datasets ({signals['n_rows']:,} rows)")

    if signals["is_categorical_heavy"]:
        scores["CatBoost Regressor"] = max(scores.get("CatBoost Regressor", 0.0), 6.0)
        scores["XGBoost Regressor"] += 2.0
        scores["Gradient Boosting Regressor"] += 1.0
        reason_parts.setdefault("CatBoost Regressor", []).insert(0, f"handles the many categorical features ({signals['n_categorical']}) natively without heavy encoding")
        reason_parts["XGBoost Regressor"].append("handles mixed categorical/numeric features well")

    if signals["is_small"]:
        scores["Linear Regression"] += 1.5
        scores["XGBoost Regressor"] -= 1.0
        reason_parts["Linear Regression"].insert(0, f"the small dataset ({signals['n_rows']} rows) makes this simple, interpretable model a competitive baseline")
        reason_parts["XGBoost Regressor"].append(f"the small dataset ({signals['n_rows']} rows) gives this data-hungry booster less room to shine; it benefits from more data and tuning")

    if signals["has_significant_outliers"]:
        for name in ("Random Forest Regressor", "Gradient Boosting Regressor", "XGBoost Regressor"):
            scores[name] += 1.0
            reason_parts[name].append("robust to the outliers found in the profile")
        scores["Linear Regression"] -= 1.0
        reason_parts["Linear Regression"].append("more sensitive to the outliers detected in this dataset")

    if signals["is_high_dim_or_mixed"]:
        for name in ("Random Forest Regressor", "Gradient Boosting Regressor", "XGBoost Regressor"):
            scores[name] += 1.0
            reason_parts[name].append("handles higher-dimensional mixed features without heavy preprocessing")

    return _finalize_ranking(scores, reason_parts)


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
                "confidence": "High",
                "reason": f"The profile shows {detail}, which violates KMeans's assumption of roughly "
                "spherical, similarly-sized clusters -- DBSCAN's density-based approach handles noise "
                "and irregular cluster shapes better.",
            },
            {
                "name": "KMeans",
                "confidence": "Medium",
                "reason": "A reasonable alternative once the data is de-skewed or outliers are handled, "
                "but its spherical-cluster assumption is a weaker fit for this profile as-is.",
            },
        ]

    return [
        {
            "name": "KMeans",
            "confidence": "High",
            "reason": "The profile shows no extreme skew or significant outliers, so the roughly spherical, "
            "similarly-sized cluster assumption KMeans relies on is plausible here.",
        },
        {
            "name": "DBSCAN",
            "confidence": "Medium",
            "reason": "A solid alternative if the true cluster structure turns out to be density-based or "
            "noisy, but there's no strong signal for that in this profile.",
        },
    ]


# Minimum dataset size for a recommendation to be treated as reliable rather
# than illustrative. These don't block the recommendation (the heuristics still
# run) -- they attach a caution so the UI can temper expectations.
_MIN_RELIABLE_ROWS = 50
_MIN_RELIABLE_FEATURES = 2
# Rows-per-class floor below which a classifier can't be learned meaningfully.
_MIN_ROWS_PER_CLASS = 10


def _readiness_warnings(
    df: pd.DataFrame,
    signals: dict[str, Any],
    problem_type: str,
    target_column: Optional[str],
) -> list[str]:
    """Attach cautions when the dataset is too small/thin to model reliably.

    These are non-blocking (the heuristic ranking still runs, per CLAUDE.md §9
    -- nothing is trained here): they just tell the user the recommendation
    rests on very little data. Checks minimum rows, minimum feature count, and
    -- for classification -- minimum rows-per-class.
    """
    warnings: list[str] = []
    n_rows = signals.get("n_rows", len(df))
    n_features = signals.get("n_numeric", 0) + signals.get("n_categorical", 0)

    if n_rows < _MIN_RELIABLE_ROWS:
        warnings.append(
            f"Only {n_rows} rows: this is below the ~{_MIN_RELIABLE_ROWS}-row floor for a reliable "
            "model, so treat the recommendation as indicative rather than definitive."
        )
    if n_features < _MIN_RELIABLE_FEATURES:
        warnings.append(
            f"Only {n_features} usable feature column(s): with so few predictors, model choice "
            "matters less than gathering more informative features."
        )

    if problem_type == "classification" and target_column and target_column in df.columns:
        class_counts = df[target_column].dropna().value_counts()
        if not class_counts.empty and class_counts.min() < _MIN_ROWS_PER_CLASS:
            smallest = int(class_counts.min())
            warnings.append(
                f"The smallest class has only {smallest} row(s) (< {_MIN_ROWS_PER_CLASS}); a classifier "
                "cannot learn it reliably. Consider collecting more examples or merging rare classes."
            )
    return warnings


def recommend_algorithms(
    file_path: str,
    profile: dict[str, Any],
    target_column: Optional[str],
    target_reasoning: str,
    identifier_columns: Optional[list[str]] = None,
    possible_targets: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Produce a heuristic ML algorithm recommendation for a (cleaned) dataset.

    No models are trained here -- see module docstring. This reasons purely
    from the dataset's shape/dtypes/cardinality (via the DataFrame) and the
    profiler's precomputed statistics (missing values, outliers).

    Args:
        file_path: Path to the CSV to reason about (the cleaned CSV).
        profile: The JSON profile produced by profiler.profile_csv for this
            dataset (used for outlier/missing/skew signals).
        target_column: The target column already identified by
            `detect_target_column` on the ORIGINAL uploaded dataframe. NOT
            re-derived here (re-deriving from the cleaned/encoded file is the
            Known Bugs Issue 2 bug).
        target_reasoning: The reasoning string produced alongside
            `target_column` by that same original-dataframe detection call.
        identifier_columns: Columns detected as identifiers on the original
            dataframe, surfaced as `excluded_columns`.
        possible_targets: The ranked target-candidate list from
            `detect_target_column`, passed through so the UI can show which
            columns were considered (and why) -- most useful when no single
            target was obvious.

    Returns:
        A dict with: problem_type, target_column, detection_reasoning,
        possible_targets, ranked_models (each {name, confidence, reason}),
        top_recommendation, excluded_columns, warnings.

    Raises:
        MLRecommenderError: if the CSV cannot be loaded.
    """
    try:
        df = load_dataframe(file_path)
    except ProfilerError as exc:
        raise MLRecommenderError(f"Cannot recommend algorithms for unreadable CSV: {exc}") from exc

    problem_type, type_reasoning = _detect_problem_type(df, target_column)
    detection_reasoning = f"{target_reasoning} {type_reasoning}".strip()

    logger.info(
        "ML recommender: detected problem_type=%s target_column=%s -- %s",
        problem_type, target_column, detection_reasoning,
    )

    if problem_type == "invalid":
        # No dataset signals or candidate ranking make sense against a target
        # that can't be learned from -- don't compute or return either.
        ranked_models: list[dict[str, str]] = []
        warnings: list[str] = []
    else:
        signals = _dataset_signals(df, profile, target_column)
        warnings = []
        if problem_type == "classification":
            ranked_models = _rank_classification_models(df, signals, target_column)
            imbalance_warning = _class_imbalance_warning(df, target_column)
            if imbalance_warning is not None:
                warnings.append(imbalance_warning)
        elif problem_type == "regression":
            ranked_models = _rank_regression_models(signals)
        else:
            # "unknown" (no target detected): still surface clustering
            # candidates as suggestions.
            ranked_models = _rank_clustering_models(profile, signals)

        warnings.extend(_readiness_warnings(df, signals, problem_type, target_column))

    top_recommendation = ranked_models[0]["name"] if ranked_models else None

    return {
        "problem_type": problem_type,
        "target_column": target_column,
        "detection_reasoning": detection_reasoning,
        "possible_targets": list(possible_targets or []),
        "ranked_models": ranked_models,
        "top_recommendation": top_recommendation,
        "excluded_columns": list(identifier_columns or []),
        "warnings": warnings,
    }
