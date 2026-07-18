"""Builds the enriched results sections (redesign brief §1-§20) from the
report dict your `/analyze/{file_id}` route already writes to disk and
`/results/{file_id}` already reads back.

This is intentionally NOT a rewrite of the pipeline. Everything here reads
fields your graph already produces (`profile`, `quality_score`,
`cleaning_plan`, `recommendations`, `report`, `charts`) and reshapes them
with the Phase 1/2 formatting helpers (app/services/overview.py,
insights.py, quality_presentation.py, ml_presentation.py,
executive_summary.py, cleaning_report.py). No new statistics are computed
except a fallback quality score, used only if `quality_score` is missing.

KNOWN LIMITATION -- read before wiring this in further
--------------------------------------------------------------------------
Your graph's state currently stores exactly ONE profile (`data["profile"]`).
The redesign brief's before/after comparison (§5) needs the profile from
BEFORE cleaning as well as after. Rather than fabricate numbers or silently
reuse the same profile for both sides (which would show "0 rows removed"
even when rows genuinely were dropped), this adapter omits the
`before_after` key entirely when only one profile is available -- the
frontend already treats that whole section as optional and hides it
cleanly.

TO GET REAL BEFORE/AFTER: in `agents/graph.py`, wherever the node that
profiles the ORIGINAL upload runs (before the cleaner), stash that result
onto the graph state under the key `profile_before_cleaning` alongside the
existing `profile` key (which, based on `AnalyzeResponse`/`ResultsResponse`,
already holds the post-cleaning profile -- confirm that's actually true in
your graph; if `profile` is actually the ORIGINAL profile instead, the key
names below need to swap). The moment `profile_before_cleaning` shows up in
the stored report dict, `build_results_response` below will automatically
start returning a real `before_after` section -- no other change needed.
"""

from typing import Any, Optional

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
from app.tools.data_quality import compute_quality_score
from app.utils.logger import get_logger

logger = get_logger(__name__)


def _infer_chart_type(url: str) -> str:
    """Best-effort chart type from the filename convention in visualizer.py
    (`{file_id}_bar_{col}.png`, `_hist_`, `_scatter_`, `_correlation_heatmap.png`).
    """
    name = url.rsplit("/", 1)[-1]
    if "correlation_heatmap" in name:
        return "heatmap"
    if "_bar_" in name:
        return "bar"
    if "_hist_" in name:
        return "histogram"
    if "_scatter_" in name:
        return "scatter"
    return "chart"


def _infer_chart_title(url: str) -> str:
    """Best-effort human title from the filename, since visualizer.py doesn't
    currently return titles alongside chart paths (a real fix belongs in
    visualizer.py itself -- this is a stopgap so charts aren't unlabeled).
    """
    name = url.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    if "correlation_heatmap" in name:
        return "Correlation Matrix"
    parts = name.split("_")
    for i, tok in enumerate(parts):
        if tok == "bar":
            return f"Frequency of '{' '.join(parts[i + 1:])}'"
        if tok == "hist":
            return f"Distribution of '{' '.join(parts[i + 1:])}'"
        if tok == "scatter":
            rest = parts[i + 1:]
            mid = len(rest) // 2
            return f"'{' '.join(rest[:mid])}' vs '{' '.join(rest[mid:])}'"
    return name.replace("_", " ").title()


def _build_chart_manifest(chart_urls: list[str]) -> list[dict[str, Any]]:
    return [
        {
            "path": url,
            "chart_type": _infer_chart_type(url),
            "title": _infer_chart_title(url),
            "description": None,
            "interpretation": None,
        }
        for url in chart_urls
    ]


def build_results_response(file_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Return the enriched sections to merge into the existing `_response_payload`.

    Args:
        file_id: The file identifier (used only for logging/context here --
            no file I/O happens in this function).
        data: The report dict already loaded from disk in `get_results`
            (i.e. the same `data` passed to the existing `_response_payload`).

    Returns:
        A dict with keys `overview`, `quality`, `analysis`, `cleaning_summary`,
        `visualizations`, `ml_recommendation`, `downloads`, `metadata`, and
        (only when `profile_before_cleaning` is present -- see module
        docstring) `before_after`. Returns `{}` if there isn't enough data
        yet (e.g. `profile` missing) so the caller's legacy fields still work
        standalone.
    """
    profile = data.get("profile")
    if not profile:
        logger.warning("build_results_response: no 'profile' in report for file_id=%s; skipping enrichment", file_id)
        return {}

    rec: dict[str, Any] = data.get("recommendations") or {}
    applied_plan: dict[str, Any] = data.get("cleaning_plan") or {}
    report_text = data.get("report") or ""
    chart_urls: list[str] = data.get("charts") or []  # already "/charts/..." URLs from _charts_to_urls

    target_column = rec.get("target_column")
    problem_type = rec.get("problem_type")

    ctx = PipelineContext(
        request_id=file_id,
        file_id=file_id,
        original_file_path="",  # not needed post-hoc; nothing here re-reads the CSV
        profile=profile,
        row_count=int(profile.get("shape", {}).get("rows", 0)),
        column_count=int(profile.get("shape", {}).get("columns", 0)),
        target_column=target_column,
        problem_type=problem_type,
        target_reasoning=rec.get("detection_reasoning") or "",
        possible_targets=rec.get("possible_targets") or [],
        identifier_columns=rec.get("excluded_columns") or [],
    )

    profile_before = data.get("profile_before_cleaning")
    ctx.cleaned_profile = profile  # `profile` in the stored report is post-cleaning per AnalyzeResponse/ResultsResponse

    # --- quality: reuse the already-computed score rather than recompute,
    # so this can never drift from what the graph actually produced. Only
    # fall back to computing it here if it's missing from the stored report.
    quality_result: dict[str, Any] = data.get("quality_score") or compute_quality_score(
        profile=profile,
        target_column=target_column,
        problem_type=problem_type,
        identifier_columns=ctx.identifier_columns,
    )
    quality_score_value = quality_result.get("quality_score", 0)

    overview = build_dataset_overview(
        ctx,
        dataset_name=f"{file_id}.csv",
        quality_score=quality_score_value,
    )
    health = build_dataset_health(quality_score_value)
    quality_dashboard = build_quality_dashboard(quality_result)
    quality_issue_cards = build_quality_issue_cards(quality_result.get("issues", []))
    dataset_insights = build_dataset_insights(ctx)
    executive_summary = format_executive_summary(report_text)

    cleaning_timeline = build_cleaning_timeline(applied_plan)
    ai_decisions = build_ai_decisions(cleaning_timeline)

    result: dict[str, Any] = {
        "overview": overview,
        "quality": {
            "score": quality_score_value,
            "components": quality_result.get("components", {}),
            "dashboard": quality_dashboard,
            "health": health,
            "issues": quality_issue_cards,
        },
        "analysis": {
            "executive_summary": executive_summary,
            "dataset_insights": dataset_insights,
        },
        "visualizations": {
            "charts": _build_chart_manifest(chart_urls),
        },
        "ml_recommendation": {
            "problem_type": rec.get("problem_type"),
            "target_column": rec.get("target_column"),
            "detection_reasoning": rec.get("detection_reasoning"),
            "top_recommendation": rec.get("top_recommendation"),
            "models": build_model_cards(rec.get("ranked_models") or []),
            "why_not_others": build_why_not_others(rec.get("ranked_models") or []),
            "readiness": build_model_readiness(rec),
            "warnings": rec.get("warnings") or [],
        },
        "downloads": {
            "cleaned_csv": f"/download/{file_id}" if data.get("cleaned_file") else None,
            # These three don't have generator functions yet -- see the
            # integration notes in the accompanying message. Left null so
            # the frontend's download-center cards render as "Unavailable"
            # instead of a broken link.
            "analysis_report": None,
            "json_results": f"/results/{file_id}",
            "charts_zip": None,
            "cleaning_log": None,
        },
        "metadata": {
            "row_count": ctx.row_count,
            "column_count": ctx.column_count,
            # Per-stage timings aren't captured by the current graph state.
            # Wiring real numbers here requires timing each node in
            # agents/graph.py (see PipelineContext.timed() in
            # app/services/pipeline_context.py for a ready-made helper) and
            # adding the result to the stored report dict.
            "processing_metrics": {},
        },
    }

    if profile_before is not None:
        # Real before/after is possible -- build it properly instead of
        # leaving the section out.
        ctx.profile = profile_before
        ctx.cleaned_profile = profile
        try:
            before_after = compute_before_after(ctx, applied_plan)
            result["before_after"] = before_after
            result["cleaning_summary"] = {
                **build_cleaning_summary(applied_plan, before_after, execution_time_seconds=0.0),
                "timeline": cleaning_timeline,
                "ai_decisions": ai_decisions,
            }
        except Exception:  # noqa: BLE001 -- enrichment must never break /results
            logger.exception("Failed to compute before/after for file_id=%s despite profile_before_cleaning present", file_id)
            result["cleaning_summary"] = {"timeline": cleaning_timeline, "ai_decisions": ai_decisions}
    else:
        result["cleaning_summary"] = {
            "timeline": cleaning_timeline,
            "ai_decisions": ai_decisions,
            "note": (
                "rows_affected/columns_affected are unavailable until "
                "agents/graph.py stores 'profile_before_cleaning' in the "
                "state -- see report_adapter.py's module docstring."
            ),
        }

    return result