"""Assembles the final `results` JSON (redesign brief §21) from every piece
computed elsewhere in the pipeline. This is the ONLY place that shape gets
built -- routes should call `build_final_response(...)` and return its
output directly, rather than hand-assembling dicts in the route handler.

Nothing in this file computes a statistic itself; it only calls into:
  - app.tools.quality.compute_quality_score      (unmodified)
  - app.tools.ml_recommender.recommend_algorithms (unmodified)
  - app.services.overview, insights, before_after, cleaning_report,
    quality_presentation, ml_presentation, executive_summary (Phase 1, above)

This keeps the "don't touch the LangGraph flow / profiler / cleaner /
validator / quality / target detection" constraint intact -- everything here
is additive formatting on top of their existing outputs.
"""

from typing import Any, Optional, Union

from app.services.before_after import compute_before_after
from app.services.cleaning_report import (
    build_ai_decisions,
    build_cleaning_summary,
    build_cleaning_timeline,
)
from app.services.executive_summary import format_executive_summary
from app.services.insights import build_dataset_insights
from app.services.ml_presentation import (
    build_model_cards,
    build_model_readiness,
    build_why_not_others,
)
from app.services.overview import build_dataset_health, build_dataset_overview
from app.services.pipeline_context import PipelineContext
from app.services.quality_presentation import (
    build_quality_dashboard,
    build_quality_issue_cards,
)
from app.tools.quality import compute_quality_score


def build_final_response(
    ctx: PipelineContext,
    dataset_name: str,
    validation_result: dict[str, Any],
    llm_summary: Union[str, dict[str, Any]],
    applied_cleaning_plan: dict[str, Any],
    cleaning_execution_seconds: float,
    chart_manifest: list[dict[str, Any]],
    ml_result: dict[str, Any],
    download_urls: dict[str, str],
) -> dict[str, Any]:
    """Build the single JSON object the results page renders from.

    Args:
        ctx: The shared PipelineContext (must have `cleaned_profile` set --
            call this after `pipeline_context.attach_cleaned_profile`).
        dataset_name: Original uploaded filename, for display.
        validation_result: Output of `app.tools.validator.validate_dataset`.
        llm_summary: The LLM analysis node's summary (string or the new
            structured dict -- see `executive_summary.py`).
        applied_cleaning_plan: The `applied_plan` returned by
            `app.tools.cleaner.clean_csv`.
        cleaning_execution_seconds: Wall-clock time the cleaner took (from
            `ctx.timed("cleaning")`).
        chart_manifest: List of {path, chart_type, title, description} for
            every chart `visualizer.generate_charts` produced (Phase 3 wires
            the description/interpretation fields onto this; Phase 1 just
            passes whatever is given through unchanged).
        ml_result: Output of `app.tools.ml_recommender.recommend_algorithms`.
        download_urls: Pre-signed/route URLs for each of the §20 download
            options, e.g. {"cleaned_csv": "...", "analysis_report": "...",
            "json_results": "...", "charts_zip": "...", "cleaning_log": "..."}.

    Returns:
        The full nested JSON object matching §21's top-level keys:
        overview, validation, quality, analysis, cleaning_plan,
        cleaning_summary, before_after, visualizations, ml_recommendation,
        downloads, metadata.
    """
    if ctx.cleaned_profile is None:
        raise ValueError("build_final_response requires ctx.cleaned_profile to be set")

    # --- quality (unmodified backend logic, reshaped for the dashboard) ---
    quality_result = compute_quality_score(
        profile=ctx.cleaned_profile,
        target_column=ctx.target_column,
        problem_type=ctx.problem_type,
        identifier_columns=ctx.identifier_columns,
    )
    quality_dashboard = build_quality_dashboard(quality_result)
    quality_issue_cards = build_quality_issue_cards(quality_result["issues"])

    # --- overview / health ---
    overview = build_dataset_overview(ctx, dataset_name, quality_result["quality_score"])
    health = build_dataset_health(quality_result["quality_score"])

    # --- before/after + cleaning report ---
    before_after = compute_before_after(ctx, applied_cleaning_plan)
    cleaning_timeline = build_cleaning_timeline(applied_cleaning_plan)
    ai_decisions = build_ai_decisions(cleaning_timeline)
    cleaning_summary = build_cleaning_summary(
        applied_cleaning_plan, before_after, cleaning_execution_seconds
    )

    # --- ML presentation ---
    model_cards = build_model_cards(ml_result.get("ranked_models", []))
    why_not_others = build_why_not_others(ml_result.get("ranked_models", []))
    model_readiness = build_model_readiness(ml_result)

    # --- insights ---
    dataset_insights = build_dataset_insights(ctx)

    # --- executive summary ---
    executive_summary = format_executive_summary(llm_summary)

    return {
        "overview": overview,
        "validation": {
            "valid": validation_result.get("valid", True),
            "errors": validation_result.get("errors", []),
            "warnings": validation_result.get("warnings", []),
            "duplicate_percentage": validation_result.get("duplicate_percentage", 0.0),
        },
        "quality": {
            "score": quality_result["quality_score"],
            "components": quality_result["components"],
            "dashboard": quality_dashboard,
            "health": health,
            "issues": quality_issue_cards,
        },
        "analysis": {
            "executive_summary": executive_summary,
            "dataset_insights": dataset_insights,
        },
        "cleaning_plan": applied_cleaning_plan,
        "cleaning_summary": {
            **cleaning_summary,
            "timeline": cleaning_timeline,
            "ai_decisions": ai_decisions,
        },
        "before_after": before_after,
        "visualizations": {
            "charts": chart_manifest,
        },
        "ml_recommendation": {
            "problem_type": ml_result.get("problem_type"),
            "target_column": ml_result.get("target_column"),
            "detection_reasoning": ml_result.get("detection_reasoning"),
            "possible_targets": ml_result.get("possible_targets", []),
            "top_recommendation": ml_result.get("top_recommendation"),
            "models": model_cards,
            "why_not_others": why_not_others,
            "readiness": model_readiness,
            "excluded_columns": ml_result.get("excluded_columns", []),
            "warnings": ml_result.get("warnings", []),
        },
        "downloads": {
            "cleaned_csv": download_urls.get("cleaned_csv"),
            "analysis_report": download_urls.get("analysis_report"),
            "json_results": download_urls.get("json_results"),
            "charts_zip": download_urls.get("charts_zip"),
            "cleaning_log": download_urls.get("cleaning_log"),
        },
        "metadata": {
            "request_id": ctx.request_id,
            "file_id": ctx.file_id,
            "row_count": ctx.row_count,          # <- single source of truth; every
            "column_count": ctx.column_count,    #    "N rows" string in the UI should
                                                  #    read from HERE, not recompute it.
            "processing_metrics": ctx.timings_as_dict(),
        },
    }