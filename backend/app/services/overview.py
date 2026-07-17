"""§1 Dataset Overview card, §4 Dataset Health card (redesign brief).

Everything here is read off `PipelineContext` and the quality-score result
that `app.tools.quality.compute_quality_score` already produces -- no new
statistics are invented, only formatted.
"""

from typing import Any, Optional

from app.services.pipeline_context import PipelineContext

_HEALTH_BANDS = (
    (90, "Excellent", "Data is clean, well-structured, and ready for modeling with minimal further work."),
    (75, "Good", "Data is largely clean; a few minor issues are worth a look before modeling."),
    (55, "Fair", "Data has notable quality issues that were addressed during cleaning, but review the report before trusting results."),
    (0, "Poor", "Data has significant quality issues. Treat any downstream analysis as provisional and consider collecting more/better data."),
)

_READINESS_BANDS = (
    (90, "Excellent Dataset", "Ready for Machine Learning"),
    (75, "Good Dataset", "Ready for Machine Learning with minor caveats"),
    (55, "Fair Dataset", "Usable, but review data quality issues first"),
    (0, "Needs Attention", "Address data quality issues before modeling"),
)


def _band(score: int, bands: tuple) -> tuple:
    for threshold, *rest in bands:
        if score >= threshold:
            return tuple(rest)
    return tuple(bands[-1][1:])


def _memory_usage_label(row_count: int, column_count: int) -> str:
    # Rough estimate absent a live dataframe: ~8 bytes/numeric cell average
    # is not reliable, so this is presented as an order-of-magnitude label,
    # not a precise figure, to avoid implying false precision.
    approx_bytes = row_count * column_count * 8
    for unit, size in (("GB", 1e9), ("MB", 1e6), ("KB", 1e3)):
        if approx_bytes >= size:
            return f"~{approx_bytes / size:.1f} {unit}"
    return f"~{approx_bytes} B"


def build_dataset_overview(
    ctx: PipelineContext,
    dataset_name: str,
    quality_score: int,
    processing_status: str = "Complete",
) -> dict[str, Any]:
    """§1 Dataset Overview card."""
    profile = ctx.profile
    numeric_features = len(profile.get("numeric_summary", {}))
    categorical_features = len(profile.get("categorical_summary", {})) + len(profile.get("datetime_columns", {}))

    readiness_label, readiness_sub = _band(quality_score, _READINESS_BANDS)
    total_time = ctx.timings_as_dict().get("total_time", 0.0)

    return {
        "dataset_name": dataset_name,
        "rows": ctx.row_count,
        "columns": ctx.column_count,
        "memory_usage": _memory_usage_label(ctx.row_count, ctx.column_count),
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
        "detected_target": ctx.target_column,
        "problem_type": ctx.problem_type or "unknown",
        "processing_status": processing_status,
        "processing_time_seconds": total_time,
        "readiness_badge": {
            "label": readiness_label,
            "sublabel": readiness_sub,
            "score": quality_score,
        },
    }


def build_dataset_health(quality_score: int) -> dict[str, Any]:
    """§4 Dataset Health card."""
    label, explanation = _band(quality_score, _HEALTH_BANDS)
    return {
        "health": label,
        "score": quality_score,
        "explanation": explanation,
    }