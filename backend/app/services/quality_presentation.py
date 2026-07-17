"""Reshapes `app.tools.quality.compute_quality_score`'s output into the two
UI structures the redesign brief asks for:
  §3 Data Quality Dashboard -- one card per component with a plain-English
     "why this score" explanation.
  §19 Data Quality Issues -- each issue string upgraded to a card with
     severity/impact/recommendation.

`compute_quality_score` itself is untouched -- this only adds presentation
text on top of numbers it already computed.
"""

from typing import Any

_COMPONENT_LABELS = {
    "missing_values": "Missing Values",
    "duplicates": "Duplicates",
    "outliers": "Outliers",
    "feature_quality": "Feature Quality",
    "class_balance": "Class Balance",
}

_COMPONENT_EXPLANATIONS = {
    "missing_values": lambda pct: f"Only {100 - pct}% of cells are missing." if pct >= 50 else f"{100 - pct}% of cells are missing.",
    "duplicates": lambda pct: f"{100 - pct}% of rows are exact duplicates.",
    "outliers": lambda pct: f"{100 - pct}% of numeric values fall outside the IQR fences.",
    "feature_quality": lambda pct: f"{100 - pct}% of columns are identifiers or constant and carry no modeling signal.",
    "class_balance": lambda pct: f"The minority class is underrepresented relative to the majority class." if pct < 100 else "The target classes are well balanced.",
}


def _status_color(score: int) -> str:
    if score >= 90:
        return "green"
    if score >= 70:
        return "yellow"
    if score >= 50:
        return "orange"
    return "red"


def build_quality_dashboard(quality_result: dict[str, Any]) -> dict[str, Any]:
    """§3 Data Quality Dashboard: overall score + one card per component."""
    overall = quality_result["quality_score"]
    if overall >= 90:
        status, sublabel = "Excellent", "Ready for ML"
    elif overall >= 70:
        status, sublabel = "Good", "Ready for ML with minor caveats"
    elif overall >= 50:
        status, sublabel = "Fair", "Review issues before modeling"
    else:
        status, sublabel = "Poor", "Address issues before modeling"

    components = []
    for key, score in quality_result["components"].items():
        # "100 - score" reads oddly for missing (the label wants % missing,
        # not % present); components below only need the invert amount for
        # the ones defined that way -- guard with min(100, max(0, ...)).
        inverted = max(0, min(100, score))
        explain_fn = _COMPONENT_EXPLANATIONS.get(key)
        explanation = explain_fn(inverted) if explain_fn else f"Score: {inverted}."
        components.append({
            "key": key,
            "label": _COMPONENT_LABELS.get(key, key.replace("_", " ").title()),
            "score": score,
            "status_color": _status_color(score),
            "explanation": explanation,
        })

    return {
        "overall_score": overall,
        "status": status,
        "sublabel": sublabel,
        "components": components,
    }


_SEVERITY_KEYWORDS = (
    ("High missing values", "High"),
    ("Duplicate rows", "Medium"),
    ("Outliers", "Medium"),
    ("Low feature quality", "High"),
    ("Target imbalance", "High"),
)

_IMPACT_TEXT = {
    "High missing values": "Models may learn biased patterns or fail to train on affected columns.",
    "Duplicate rows": "Duplicate rows can inflate the apparent size of the dataset and bias training toward repeated examples.",
    "Outliers": "Extreme values can distort model coefficients and skew distance-based algorithms.",
    "Low feature quality": "Identifier/constant columns add no predictive signal and may need to be excluded.",
    "Target imbalance": "A model may default to predicting the majority class and perform poorly on the minority class.",
}

_RECOMMENDATION_TEXT = {
    "High missing values": "Consider imputing with median/mode, or dropping columns with very high missingness.",
    "Duplicate rows": "Remove duplicate rows before training (the cleaner already does this if selected in the plan).",
    "Outliers": "Cap or remove outliers if they are data errors; keep them if they are legitimate extreme values.",
    "Low feature quality": "Drop identifier/constant columns before modeling.",
    "Target imbalance": "Use class weights, oversampling (e.g. SMOTE), or stratified sampling.",
}


def build_quality_issue_cards(issues: list[str]) -> list[dict[str, Any]]:
    """§19: each raw issue string from `compute_quality_score` becomes a card."""
    cards = []
    for issue in issues:
        matched_key = next((k for k, _ in _SEVERITY_KEYWORDS if issue.startswith(k)), None)
        severity = dict(_SEVERITY_KEYWORDS).get(matched_key, "Medium")
        cards.append({
            "issue": issue,
            "severity": severity,
            "impact": _IMPACT_TEXT.get(matched_key, "May affect model reliability."),
            "recommendation": _RECOMMENDATION_TEXT.get(matched_key, "Review this column before modeling."),
        })
    return cards