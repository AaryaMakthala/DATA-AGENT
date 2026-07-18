"""Builds the enriched results sections (redesign brief §1-§20) from the
report dict your `/analyze/{file_id}` route already writes to disk and
`/results/{file_id}` already reads back.

This is intentionally NOT a rewrite of the pipeline. Everything here reads
fields your graph already produces (`profile`, `cleaned_profile`,
`quality_score`, `cleaning_plan`, `recommendations`, `report`, `charts`) and
reshapes them with the Phase 1/2 formatting helpers (app/services/
overview.py, insights.py, quality_presentation.py, ml_presentation.py,
executive_summary.py, cleaning_report.py, before_after.py).

FIXED (this revision), two real bugs from the previous version:

1. Profile semantics were backwards. `data["profile"]` is the ORIGINAL
   pre-cleaning profile -- confirmed from agents/graph.py: `profiler_node`
   sets it once and nothing ever overwrites it. `agents/graph.py` now also
   persists `data["cleaned_profile"]` (post-cleaning, previously computed
   and discarded inside `ml_recommendation_node`). This module now uses
   `profile` as the true "before" and `cleaned_profile` as the true
   "after" -- real before/after cleaning comparisons are now possible
   whenever `cleaned_profile` is present, instead of always being omitted.

2. Chart image URLs were broken. `data["charts"]` holds visualizer.py's
   chart metadata dicts, whose `path` field is an ABSOLUTE FILESYSTEM PATH
   (e.g. `/srv/app/outputs/charts/abc123_bar_Sex.png`), not a URL. The
   previous version of this file passed that raw path straight to the
   frontend as if it were already a `/charts/...` URL --
   `safeResolveAssetUrl()` on the frontend correctly rejected it (doesn't
   match the `/charts/` prefix allowlist), so chart titles rendered but the
   `<img>` never did. Fixed by routing every chart path through
   `file_service.chart_path_to_url` -- the same shared conversion
   `routes.py`'s legacy `_charts_to_urls` uses, so both response shapes are
   guaranteed to agree.
"""

from typing import Any, Optional

from app.services.before_after import compute_before_after
from app.services.cleaning_report import (
    build_ai_decisions,
    build_cleaning_summary,
    build_cleaning_timeline,
)
from app.services.executive_summary import format_executive_summary
from app.services.file_service import chart_path_to_url
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


def _build_chart_manifest(charts_raw: Optional[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Convert visualizer.py's chart metadata into the frontend-facing shape.

    Each item in `charts_raw` (from `state["charts"]`, i.e.
    `visualizer.generate_charts`'s return value) already has real
    chart_type/title/description/interpretation -- this function's only job
    is rewriting `path` from an absolute filesystem path to a `/charts/...`
    URL via the shared `chart_path_to_url`. Skips malformed entries (missing
    `path`) rather than emitting a broken card, and tolerates the old bare-
    path-string shape from reports written before visualizer.py returned
    structured metadata.
    """
    if not charts_raw:
        return []
    manifest: list[dict[str, Any]] = []
    for item in charts_raw:
        if isinstance(item, dict):
            path = item.get("path")
            if not path:
                continue
            manifest.append({
                "path": chart_path_to_url(path),
                "chart_type": item.get("chart_type") or "chart",
                "title": item.get("title") or path.rsplit("/", 1)[-1],
                "description": item.get("description"),
                "interpretation": item.get("interpretation"),
            })
        elif isinstance(item, str):
            # Old shape: bare path string, no metadata at all.
            manifest.append({
                "path": chart_path_to_url(item),
                "chart_type": "chart",
                "title": item.rsplit("/", 1)[-1],
                "description": None,
                "interpretation": None,
            })
    return manifest


def build_results_response(file_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Return the enriched sections to merge into the existing `_response_payload`.

    Args:
        file_id: The file identifier (used for constructing download URLs
            and as the PipelineContext's request/file id -- no file I/O
            happens in this function itself).
        data: The report dict already loaded from disk in `get_results`
            (i.e. the same `data` passed to the existing `_response_payload`).

    Returns:
        A dict with keys `overview`, `quality`, `analysis`, `cleaning_summary`,
        `visualizations`, `ml_recommendation`, `downloads`, `metadata`, and
        `before_after` (only when `data["cleaned_profile"]` is present).
        Returns `{}` if there isn't enough data yet (e.g. `profile` missing)
        so the caller's legacy fields still work standalone.
    """
    profile_original = data.get("profile")
    if not profile_original:
        logger.warning("build_results_response: no 'profile' in report for file_id=%s; skipping enrichment", file_id)
        return {}

    profile_after = data.get("cleaned_profile")  # None for reports written before this field existed
    # Overview/insights/quality-dashboard describe the dataset as it stands
    # for modeling, so prefer the cleaned profile when available; fall back
    # to the original profile for reports that predate `cleaned_profile`.
    current_profile = profile_after or profile_original

    rec: dict[str, Any] = data.get("recommendations") or {}
    applied_plan: dict[str, Any] = data.get("cleaning_plan") or {}
    report_raw = data.get("report")  # dict (structured) or str (fallback) -- see graph.py's _run_analysis_llm
    charts_raw: list[dict[str, Any]] = data.get("charts") or []

    target_column = rec.get("target_column")
    problem_type = rec.get("problem_type")
    identifier_columns = rec.get("excluded_columns") or []

    ctx = PipelineContext(
        request_id=file_id,
        file_id=file_id,
        original_file_path="",  # not needed post-hoc; nothing here re-reads the CSV
        profile=current_profile,
        row_count=int(current_profile.get("shape", {}).get("rows", 0)),
        column_count=int(current_profile.get("shape", {}).get("columns", 0)),
        target_column=target_column,
        problem_type=problem_type,
        target_reasoning=rec.get("detection_reasoning") or "",
        possible_targets=rec.get("possible_targets") or [],
        identifier_columns=identifier_columns,
    )
    ctx.cleaned_profile = current_profile

    # --- quality: reuse the already-computed score rather than recompute,
    # so this can never drift from what the graph actually produced. Only
    # fall back to computing it here if it's missing from the stored report.
    quality_result: dict[str, Any] = data.get("quality_score") or compute_quality_score(
        profile=current_profile,
        target_column=target_column,
        problem_type=problem_type,
        identifier_columns=identifier_columns,
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
    executive_summary = format_executive_summary(report_raw or "")

    cleaning_timeline = build_cleaning_timeline(applied_plan)
    ai_decisions = build_ai_decisions(cleaning_timeline)

    chart_manifest = _build_chart_manifest(charts_raw)

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
            "charts": chart_manifest,
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
            # charts_zip is now real -- see routes.py's download_charts_zip.
            "charts_zip": f"/download/charts/{file_id}" if chart_manifest else None,
            # These two still don't have generator functions -- left null so
            # the frontend's download-center cards render as "Unavailable"
            # instead of a broken link.
            "analysis_report": None,
            "json_results": f"/results/{file_id}",
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

    if profile_after is not None:
        # Real before/after is possible now -- build it from the TRUE
        # original/cleaned pair, using a separate context so this doesn't
        # depend on (or get confused with) `current_profile` above, which
        # may already equal `profile_after`.
        before_ctx = PipelineContext(
            request_id=file_id,
            file_id=file_id,
            original_file_path="",
            profile=profile_original,
            row_count=int(profile_original.get("shape", {}).get("rows", 0)),
            column_count=int(profile_original.get("shape", {}).get("columns", 0)),
            target_column=target_column,
            problem_type=problem_type,
            identifier_columns=identifier_columns,
        )
        before_ctx.cleaned_profile = profile_after
        try:
            before_after = compute_before_after(before_ctx, applied_plan)
            result["before_after"] = before_after
            result["cleaning_summary"] = {
                **build_cleaning_summary(applied_plan, before_after, execution_time_seconds=0.0),
                "timeline": cleaning_timeline,
                "ai_decisions": ai_decisions,
            }
        except Exception:  # noqa: BLE001 -- enrichment must never break /results
            logger.exception("Failed to compute before/after for file_id=%s despite cleaned_profile present", file_id)
            result["cleaning_summary"] = {"timeline": cleaning_timeline, "ai_decisions": ai_decisions}
    else:
        result["cleaning_summary"] = {
            "timeline": cleaning_timeline,
            "ai_decisions": ai_decisions,
            "note": (
                "rows_affected/columns_affected/before_after are unavailable "
                "for this report -- it was generated before agents/graph.py "
                "started persisting 'cleaned_profile'. Re-run /analyze on "
                "this file to get the full comparison."
            ),
        }

    return result