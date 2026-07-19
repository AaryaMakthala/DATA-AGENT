"""Reshapes `app.tools.ml_recommender.recommend_algorithms`'s output for
§15 (richer per-model cards), §16 (why lower-ranked models ranked lower),
and §17 (model readiness stars). No new ranking logic -- `ranked_models` is
already sorted by `_finalize_ranking`; this only formats it.
"""

from typing import Any, Optional

# Static reference characteristics shown per model card (§15). These are
# general, well-known properties of each algorithm family, not measurements
# on this dataset -- shown alongside (not instead of) the per-dataset
# confidence/reason already computed by `ml_recommender.py`.
_MODEL_PROFILES: dict[str, dict[str, Any]] = {
    "Gradient Boosting": {"interpretability": "Medium", "training_speed": "Medium", "inference_speed": "Fast", "handles_missing": "No (needs imputation)", "handles_outliers": "Good", "scalability": "Medium"},
    "Random Forest": {"interpretability": "Medium", "training_speed": "Fast", "inference_speed": "Fast", "handles_missing": "No (needs imputation)", "handles_outliers": "Good", "scalability": "Good"},
    "XGBoost": {"interpretability": "Medium", "training_speed": "Fast", "inference_speed": "Fast", "handles_missing": "Yes (native)", "handles_outliers": "Good", "scalability": "Excellent"},
    "LightGBM": {"interpretability": "Medium", "training_speed": "Very Fast", "inference_speed": "Very Fast", "handles_missing": "Yes (native)", "handles_outliers": "Good", "scalability": "Excellent"},
    "CatBoost": {"interpretability": "Medium", "training_speed": "Fast", "inference_speed": "Fast", "handles_missing": "Yes (native)", "handles_outliers": "Good", "scalability": "Excellent"},
    "Logistic Regression": {"interpretability": "Excellent", "training_speed": "Very Fast", "inference_speed": "Very Fast", "handles_missing": "No (needs imputation)", "handles_outliers": "Poor", "scalability": "Excellent"},
    "Linear Regression": {"interpretability": "Excellent", "training_speed": "Very Fast", "inference_speed": "Very Fast", "handles_missing": "No (needs imputation)", "handles_outliers": "Poor", "scalability": "Excellent"},
    "KMeans": {"interpretability": "Medium", "training_speed": "Fast", "inference_speed": "Fast", "handles_missing": "No (needs imputation)", "handles_outliers": "Poor", "scalability": "Good"},
    "DBSCAN": {"interpretability": "Medium", "training_speed": "Medium", "inference_speed": "Medium", "handles_missing": "No (needs imputation)", "handles_outliers": "Excellent", "scalability": "Fair (large datasets are slow)"},
}

_ADVANTAGES = {
    "Gradient Boosting": ["Strong accuracy on structured/tabular data", "Captures non-linear relationships"],
    "Random Forest": ["Robust, low-maintenance baseline", "Built-in feature importances", "Resistant to overfitting"],
    "XGBoost": ["Excellent accuracy on large tabular data", "Handles missing values natively", "Highly tunable"],
    "LightGBM": ["Very fast training on large data", "Low memory usage", "Native categorical support"],
    "CatBoost": ["Best-in-class categorical handling", "Strong out-of-the-box defaults"],
    "Logistic Regression": ["Highly interpretable coefficients", "Fast to train and deploy", "Works well with little data"],
    "Linear Regression": ["Highly interpretable coefficients", "Fast to train and deploy", "Works well with little data"],
    "KMeans": ["Simple, fast, and easy to explain"],
    "DBSCAN": ["Finds arbitrarily-shaped clusters", "Robust to noise/outliers"],
}

_DISADVANTAGES = {
    "Gradient Boosting": ["Slower to train than Random Forest", "Sensitive to hyperparameters"],
    "Random Forest": ["Larger model size", "Less interpretable than linear models"],
    "XGBoost": ["More hyperparameters to tune", "Can overfit small datasets"],
    "LightGBM": ["Can overfit on small datasets", "Leaf-wise growth needs careful tuning"],
    "CatBoost": ["Slower training than LightGBM on very large data"],
    "Logistic Regression": ["Assumes a linear decision boundary", "Sensitive to outliers"],
    "Linear Regression": ["Assumes a linear relationship", "Sensitive to outliers"],
    "KMeans": ["Assumes spherical, similarly-sized clusters", "Requires choosing k in advance"],
    "DBSCAN": ["Sensitive to its distance-threshold parameter", "Struggles with varying density clusters"],
}


def _reference_key(model_name: str) -> str:
    """Map a ranked model's display name to its reference-data key.

    The regression ranker emits task-suffixed names ("XGBoost Regressor",
    "Gradient Boosting Regressor", "Random Forest Regressor", ...), but the
    static reference tables below are keyed by the base family name
    ("XGBoost", "Gradient Boosting", ...). Without this normalization every
    regression card except "Linear Regression" (which has no suffix and
    matched by luck) fell back to `{}` / `[]`, so it rendered with no specs
    and no pros/cons -- and the only fully-populated card, Linear Regression,
    made every model look like it had Linear Regression's properties.
    Stripping the trailing " Regressor" recovers the correct family profile.
    """
    if model_name.endswith(" Regressor"):
        return model_name[: -len(" Regressor")]
    return model_name


def build_model_cards(ranked_models: list[dict[str, str]]) -> list[dict[str, Any]]:
    """§15: enrich each ranked model with its static reference profile."""
    cards = []
    for m in ranked_models:
        key = _reference_key(m["name"])
        profile = _MODEL_PROFILES.get(key, {})
        cards.append({
            "model_name": m["name"],
            "confidence": m["confidence"],
            "reason": m["reason"],
            "advantages": _ADVANTAGES.get(key, []),
            "disadvantages": _DISADVANTAGES.get(key, []),
            **profile,
        })
    return cards


def build_why_not_others(ranked_models: list[dict[str, str]]) -> list[dict[str, str]]:
    """§16: explain why every model below #1 ranked lower, using its own reason
    (already dataset-specific from `ml_recommender.py`) reframed comparatively.
    """
    if len(ranked_models) < 2:
        return []
    top_name = ranked_models[0]["name"]
    explanations = []
    for m in ranked_models[1:]:
        explanations.append({
            "model": m["name"],
            "explanation": (
                f"Ranked below {top_name} ({m['confidence']} confidence): {m['reason']}"
            ),
        })
    return explanations


_READINESS_DIMENSIONS = {
    "business_intelligence": lambda p: 5,  # profiling/quality/insights are always available
    "visualization": lambda p: 5 if p.get("ranked_models") is not None else 4,
    "deployment": lambda p: 4,
}


def build_model_readiness(ml_result: dict[str, Any]) -> dict[str, Any]:
    """§17: star ratings (1-5) across BI / ML / DL / Visualization / Deployment.

    ML and DL ratings depend on the detected problem type and how much data
    there is -- both already known from `ml_result` and don't require a new
    signal. Deep Learning specifically is rated low unless the dataset is
    large, since none of these heuristics (or the pipeline) ever trains a
    neural network -- the rating reflects suitability, not something this
    app will do for you.
    """
    problem_type = ml_result.get("problem_type", "unknown")
    warnings = ml_result.get("warnings", [])
    small_data_warning = any("rows" in w and "below" in w for w in warnings)

    if problem_type == "invalid":
        ml_stars = 1
    elif small_data_warning:
        ml_stars = 3
    else:
        ml_stars = 5

    dl_stars = 2 if small_data_warning or problem_type in ("invalid", "unknown") else 3

    ratings = {
        "business_intelligence": 5,
        "machine_learning": ml_stars,
        "deep_learning": dl_stars,
        "visualization": 5,
        "deployment": 4 if problem_type not in ("invalid",) else 2,
    }
    return {k: {"stars": v, "display": "★" * v + "☆" * (5 - v)} for k, v in ratings.items()}