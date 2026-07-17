"""§10 Dataset Insights cards -- each a small, self-contained fact pulled
from the profile that already exists (`ctx.profile`), no recomputation of
statistics pandas already gave us in `profiler.profile_csv`.
"""

from typing import Any, Optional

from app.services.pipeline_context import PipelineContext


def _biggest_missing_column(profile: dict[str, Any]) -> Optional[dict[str, Any]]:
    missing_pct = profile.get("missing_value_percentages", {})
    if not missing_pct:
        return None
    col, pct = max(missing_pct.items(), key=lambda kv: kv[1])
    return {
        "icon": "alert-circle",
        "title": "Biggest Missing Column",
        "value": col,
        "detail": f"{pct}% of values are missing.",
    }


def _strongest_correlation(profile: dict[str, Any]) -> Optional[dict[str, Any]]:
    corr = profile.get("correlations", {})
    best_pair, best_value = None, 0.0
    seen = set()
    for row, cols in corr.items():
        for col, value in cols.items():
            if row == col or value is None:
                continue
            pair_key = frozenset((row, col))
            if pair_key in seen:
                continue
            seen.add(pair_key)
            if abs(value) > abs(best_value):
                best_value, best_pair = value, (row, col)
    if best_pair is None:
        return None
    return {
        "icon": "trending-up" if best_value > 0 else "trending-down",
        "title": "Strongest Correlation",
        "value": f"{best_pair[0]} & {best_pair[1]}",
        "detail": f"Correlation coefficient of {best_value:.2f}.",
    }


def _most_imbalanced_feature(profile: dict[str, Any]) -> Optional[dict[str, Any]]:
    worst_col, worst_ratio = None, 1.0
    for col, summary in profile.get("categorical_summary", {}).items():
        freq = summary.get("frequency_table", {})
        counts = list(freq.values())
        if len(counts) < 2:
            continue
        ratio = min(counts) / max(counts)
        if ratio < worst_ratio:
            worst_ratio, worst_col = ratio, col
    if worst_col is None:
        return None
    return {
        "icon": "scale",
        "title": "Most Imbalanced Feature",
        "value": worst_col,
        "detail": f"Minority/majority ratio of {worst_ratio:.2f}.",
    }


def _highest_variance_feature(profile: dict[str, Any]) -> Optional[dict[str, Any]]:
    best_col, best_cov = None, -1.0
    for col, summary in profile.get("numeric_summary", {}).items():
        std, mean = summary.get("std"), summary.get("mean")
        if std is None or not mean:
            continue
        cov = abs(std / mean)  # coefficient of variation -- comparable across scales
        if cov > best_cov:
            best_cov, best_col = cov, col
    if best_col is None:
        return None
    return {
        "icon": "activity",
        "title": "Highest Variance Feature",
        "value": best_col,
        "detail": f"Coefficient of variation {best_cov:.2f}.",
    }


def _most_important_numeric_feature(profile: dict[str, Any], target_column: Optional[str]) -> Optional[dict[str, Any]]:
    """Proxy for 'importance': absolute correlation with the target.

    This is explicitly a heuristic proxy, not a trained feature-importance
    score (no model is ever trained in this pipeline) -- labeled as such in
    the detail string so the UI doesn't overstate it.
    """
    if not target_column:
        return None
    corr = profile.get("correlations", {}).get(target_column)
    if not corr:
        return None
    best_col, best_value = None, 0.0
    for col, value in corr.items():
        if col == target_column or value is None:
            continue
        if abs(value) > abs(best_value):
            best_value, best_col = value, col
    if best_col is None:
        return None
    return {
        "icon": "star",
        "title": "Most Important Numeric Feature",
        "value": best_col,
        "detail": f"Correlates {best_value:.2f} with the target (proxy measure, not a trained importance score).",
    }


def _most_unique_category(profile: dict[str, Any]) -> Optional[dict[str, Any]]:
    best_col, best_count = None, -1
    for col, summary in profile.get("categorical_summary", {}).items():
        count = summary.get("unique_count", 0)
        if count > best_count:
            best_count, best_col = count, col
    if best_col is None:
        return None
    return {
        "icon": "hash",
        "title": "Most Unique Category",
        "value": best_col,
        "detail": f"{best_count} distinct values.",
    }


def _largest_outlier_count(profile: dict[str, Any]) -> Optional[dict[str, Any]]:
    outliers = profile.get("outliers", {})
    if not outliers:
        return None
    col, entry = max(outliers.items(), key=lambda kv: kv[1].get("count", 0))
    count = entry.get("count", 0)
    if count == 0:
        return None
    return {
        "icon": "alert-triangle",
        "title": "Largest Outlier Count",
        "value": col,
        "detail": f"{count} values fall outside the IQR fences.",
    }


def build_dataset_insights(ctx: PipelineContext) -> list[dict[str, Any]]:
    """Return every insight card that could be computed (skips ones with no signal)."""
    profile = ctx.profile
    candidates = [
        _biggest_missing_column(profile),
        _strongest_correlation(profile),
        _most_imbalanced_feature(profile),
        _highest_variance_feature(profile),
        _most_important_numeric_feature(profile, ctx.target_column),
        _most_unique_category(profile),
        _largest_outlier_count(profile),
    ]
    return [c for c in candidates if c is not None]