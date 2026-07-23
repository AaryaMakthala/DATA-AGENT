"""FastAPI routes: /upload, /analyze/{file_id}, /results/{file_id}, /download/{file_id}, /download/charts/{file_id}."""

import io
import json
import zipfile
from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from app.agents.graph import build_graph
from app.agents.llm_router import LLMRouterError
from app.api.errors import APIError
from app.api.schemas import AnalyzeResponse, ResultsResponse, UploadResponse
from app.services.before_after import compute_before_after
from app.services.cleaning_report import build_cleaning_log_text
from app.services.csv_service import CSVServiceError, validate_and_preview
from app.services.executive_summary import build_analysis_report_text
from app.services.file_service import (
    FileServiceError,
    InvalidFileIdError,
    UploadTooLargeError,
    chart_path_to_url,
    resolve_cleaned_file_path,
    resolve_report_path,
    resolve_upload_path,
    save_upload,
    validate_file_id,
)
from app.services.pipeline_context import PipelineContext
from app.services.report_adapter import build_results_response
from app.tools.cleaner import CleanerError
from app.tools.ml_recommender import MLRecommenderError
from app.tools.profiler import ProfilerError
from app.tools.visualizer import VisualizerError
from app.utils.config import Config
from app.utils.logger import get_logger
from app.utils.rate_limiter import (
    RateLimitExceeded,
    SlidingWindowRateLimiter,
    client_ip,
)

logger = get_logger(__name__)
router = APIRouter()

_graph = build_graph()

_rate_limiter = SlidingWindowRateLimiter(
    Config.RATE_LIMIT_WINDOW_SECONDS
)


def _require_valid_file_id(file_id: str) -> None:
    """Reject path-traversal / unsafe file_id at the route boundary (HTTP 400).

    The resolvers in file_service also validate defensively, but doing it here
    means /download/charts (which globs the charts folder directly and never
    calls a resolver) is covered too, and every rejection is a clean 400 rather
    than a resolver error mapped to 404/500.
    """
    try:
        validate_file_id(file_id)
    except InvalidFileIdError as exc:
        raise APIError(400, "INVALID_FILE_ID", str(exc)) from exc


def _enforce_rate_limit(request: Request, bucket: str, max_requests: int) -> None:
    if not Config.RATE_LIMIT_ENABLED:
        return

    key = client_ip(request)

    try:
        _rate_limiter.check(bucket, key, max_requests)
    except RateLimitExceeded as exc:
        _rate_limiter.prune()
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please wait a moment and try again.",
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc


def _charts_to_urls(charts: list[dict[str, Any]] | list[str] | None) -> list[str] | None:
    """Extract just the URLs from the stored chart metadata, for the legacy
    `charts: list[str]` field on AnalyzeResponse/ResultsResponse.

    Accepts either the current shape (list of metadata dicts with a `path`
    key, from visualizer.generate_charts) or the old bare-path-string shape,
    so a report JSON written before this change still loads without error.
    """
    if charts is None:
        return None
    urls: list[str] = []
    for item in charts:
        if isinstance(item, dict):
            path = item.get("path")
            if path:
                urls.append(chart_path_to_url(path))
        elif isinstance(item, str):
            urls.append(chart_path_to_url(item))
    return urls


def _report_as_text(report: Any) -> str | None:
    """Coerce the analysis report to plain text for the legacy `report` field.

    `report` is now `dict | str | None` in the stored state (see graph.py's
    `_run_analysis_llm` -- it parses structured JSON when the LLM returns
    it, falling back to a plain string). The legacy `report: str | None`
    field on AnalyzeResponse/ResultsResponse must stay a string for backward
    compatibility, so a structured dict gets flattened into one paragraph
    here. The FULL structured version is still available to callers via
    `report_adapter.build_results_response`'s `analysis.executive_summary`
    section -- this flattening only affects the legacy field.
    """
    if report is None:
        return None
    if isinstance(report, str):
        return report
    if isinstance(report, dict):
        parts: list[str] = []
        overview = report.get("overview")
        if overview:
            parts.append(str(overview))
        for key in ("key_findings", "risks", "recommendations"):
            values = report.get(key)
            if isinstance(values, list):
                parts.extend(str(v) for v in values)
        return " ".join(parts) if parts else None
    return str(report)


def _response_payload(file_id: str, data: dict) -> dict:
    """Legacy flat payload -- shape unchanged, still used as-is by /analyze.

    /results additionally merges `report_adapter.build_results_response`
    on top of this (see `get_results` below) rather than changing this
    function's shape, so /analyze's response contract doesn't shift.
    """
    return dict(
        file_id=file_id,
        profile=data.get("profile"),
        cleaned_profile=data.get("cleaned_profile"),
        data_validity=data.get("data_validity"),
        report=_report_as_text(data.get("report")),
        cleaning_plan=data.get("cleaning_plan"),
        cleaned_file=f"/download/{file_id}"
        if data.get("cleaned_file")
        else None,
        charts=_charts_to_urls(data.get("charts")),
        recommendations=data.get("recommendations"),
        quality_score=data.get("quality_score"),
    )


@router.post(
    "/upload",
    response_model=UploadResponse,
    responses={
        400: {"description": "Invalid CSV"},
        413: {"description": "Upload too large"},
        429: {"description": "Rate limit exceeded"},
    },
)
async def upload_csv(
    request: Request,
    file: UploadFile = File(...),
) -> UploadResponse:
    _enforce_rate_limit(
        request,
        "upload",
        Config.RATE_LIMIT_UPLOAD_MAX,
    )

    try:
        file_id, path = save_upload(file)
    except UploadTooLargeError as exc:
        raise APIError(413, "UPLOAD_TOO_LARGE", str(exc)) from exc
    except FileServiceError as exc:
        raise APIError(400, "CSV_ERROR", str(exc)) from exc

    try:
        preview = validate_and_preview(path)
    except CSVServiceError as exc:
        path.unlink(missing_ok=True)
        raise APIError(400, "CSV_ERROR", str(exc)) from exc

    return UploadResponse(
        file_id=file_id,
        filename=file.filename,
        rows=preview["rows"],
        columns=preview["columns"],
    )


@router.post(
    "/analyze/{file_id}",
    response_model=AnalyzeResponse,
    responses={
        404: {"description": "File not found"},
        429: {"description": "Rate limit exceeded"},
        502: {"description": "LLM provider unavailable"},
        500: {"description": "Internal processing error"},
    },
)
async def analyze_csv(
    request: Request,
    file_id: str,
) -> AnalyzeResponse:
    _enforce_rate_limit(
        request,
        "analyze",
        Config.RATE_LIMIT_ANALYZE_MAX,
    )

    _require_valid_file_id(file_id)

    try:
        path = resolve_upload_path(file_id)
    except FileServiceError as exc:
        raise APIError(404, "NOT_FOUND", str(exc)) from exc

    try:
        result_state = _graph.invoke(
            {
                "file_path": str(path),
                "file_id": file_id,
            }
        )

    except ProfilerError as exc:
        raise APIError(400, "CSV_ERROR", f"Profiling failed: {exc}") from exc

    except LLMRouterError as exc:
        logger.error(
            "Analysis failed for file_id=%s: %s",
            file_id,
            exc,
        )
        raise APIError(
            502,
            "LLM_ERROR",
            "The analysis service is temporarily unavailable. Please try again shortly.",
        ) from exc

    except CleanerError as exc:
        logger.exception("Cleaning failed for file_id=%s", file_id)
        raise APIError(500, "CLEANING_ERROR", "Cleaning the dataset failed.") from exc

    except VisualizerError as exc:
        logger.exception("Visualization failed for file_id=%s", file_id)
        raise APIError(500, "VISUALIZATION_ERROR", "Generating charts failed.") from exc

    except MLRecommenderError as exc:
        logger.exception("Recommendation failed for file_id=%s", file_id)
        raise APIError(500, "MODEL_ERROR", "Generating model recommendations failed.") from exc

    except Exception as exc:
        logger.exception(
            "Unexpected analysis error for %s",
            file_id,
        )
        raise APIError(
            500,
            "INTERNAL_ERROR",
            "An unexpected error occurred during analysis.",
        ) from exc

    try:
        resolve_report_path(file_id).write_text(
            json.dumps(
                result_state,
                indent=2,
                default=str,
            ),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.exception(
            "Failed writing report for %s",
            file_id,
        )
        raise APIError(
            500,
            "INTERNAL_ERROR",
            "Failed to save analysis results.",
        ) from exc

    payload = _response_payload(
        file_id,
        result_state,
    )
    payload["status"] = "completed"

    return AnalyzeResponse(**payload)


@router.get("/results/{file_id}", response_model=ResultsResponse)
async def get_results(file_id: str) -> ResultsResponse:
    _require_valid_file_id(file_id)

    report_path = resolve_report_path(file_id)

    if not report_path.exists():
        raise APIError(
            404,
            "NOT_FOUND",
            f"No results found for file_id='{file_id}'. Run /analyze first.",
        )

    try:
        data = json.loads(
            report_path.read_text(encoding="utf-8")
        )
    except (json.JSONDecodeError, OSError) as exc:
        logger.exception(
            "Corrupted report for %s",
            file_id,
        )
        raise APIError(
            500,
            "INTERNAL_ERROR",
            "Stored analysis results are corrupted.",
        ) from exc

    payload = _response_payload(file_id, data)

    # Merge the enriched dashboard sections on top of the legacy payload.
    # `build_results_response` never raises for missing/partial data (it
    # returns `{}` if there's not enough to work with) -- wrapped in
    # try/except anyway so a bug in the NEW enrichment code can never take
    # down the EXISTING /results endpoint the frontend already depends on.
    try:
        payload.update(build_results_response(file_id, data))
    except Exception:
        logger.exception("Failed to build enriched results sections for file_id=%s", file_id)

    return ResultsResponse(**payload)


@router.get("/download/{file_id}")
async def download_cleaned_csv(file_id: str) -> FileResponse:
    _require_valid_file_id(file_id)

    try:
        path = resolve_cleaned_file_path(file_id)
    except FileServiceError as exc:
        raise APIError(404, "NOT_FOUND", str(exc)) from exc

    return FileResponse(
        path,
        media_type="text/csv",
        filename="cleaned.csv",
    )


@router.get("/download/json/{file_id}")
async def download_json_results(file_id: str) -> FileResponse:
    """Serve the stored report JSON as a real file download (Issue 5 fix).

    `report_adapter.py`'s `downloads.json_results` used to point at
    `/results/{file_id}` -- a real, working endpoint, but not under the
    frontend's `/charts/`+`/download/` asset URL allowlist, so the
    Download Center card always showed "Unavailable" despite the backend
    having a real value. This serves the exact same on-disk report file
    `/results/{file_id}` reads, just as a downloadable attachment under a
    `/download/` path instead of an inline API response.
    """
    _require_valid_file_id(file_id)

    report_path = resolve_report_path(file_id)
    if not report_path.exists():
        raise APIError(
            404,
            "NOT_FOUND",
            f"No results found for file_id='{file_id}'. Run /analyze first.",
        )
    return FileResponse(
        report_path,
        media_type="application/json",
        filename="results.json",
    )


@router.get("/download/cleaning-log/{file_id}")
async def download_cleaning_log(file_id: str) -> StreamingResponse:
    """Serve a plain-text cleaning log built from the REAL applied plan.

    Previously the Download Center's "Cleaning Log" card was always
    "Unavailable" because no generator existed (CLAUDE.md §7.1). This builds
    the log on demand from the same stored `cleaning_plan` (the executed plan)
    and `cleaned_profile`/`profile` the results page already renders -- so it
    reflects exactly what the cleaner did, with nothing fabricated. Returns 404
    when the report doesn't exist or predates cleaning-plan persistence.
    """
    _require_valid_file_id(file_id)

    report_path = resolve_report_path(file_id)
    if not report_path.exists():
        raise APIError(
            404,
            "NOT_FOUND",
            f"No results found for file_id='{file_id}'. Run /analyze first.",
        )
    try:
        data = json.loads(report_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise APIError(500, "INTERNAL_ERROR", "Stored analysis results are corrupted.") from exc

    applied_plan = data.get("cleaning_plan")
    if not isinstance(applied_plan, dict):
        raise APIError(
            404,
            "NOT_FOUND",
            f"No cleaning log available for file_id='{file_id}' (dataset was not cleaned).",
        )

    # Rebuild before/after the same way report_adapter does, when both profiles
    # are present -- purely for the log's summary header. Never fatal: the log
    # renders fine from the applied_plan alone if this can't be computed.
    before_after = None
    profile_original = data.get("profile")
    profile_after = data.get("cleaned_profile")
    if profile_original and profile_after:
        try:
            ctx = PipelineContext(
                request_id=file_id,
                file_id=file_id,
                original_file_path="",
                profile=profile_original,
                row_count=int(profile_original.get("shape", {}).get("rows", 0)),
                column_count=int(profile_original.get("shape", {}).get("columns", 0)),
            )
            ctx.cleaned_profile = profile_after
            before_after = compute_before_after(ctx, applied_plan)
        except Exception:  # noqa: BLE001 -- summary is optional; log still renders
            logger.warning("download_cleaning_log: could not compute before/after for %s", file_id)

    log_text = build_cleaning_log_text(file_id, applied_plan, before_after)
    buffer = io.BytesIO(log_text.encode("utf-8"))
    return StreamingResponse(
        buffer,
        media_type="text/plain",
        headers={"Content-Disposition": 'attachment; filename="cleaning_log.txt"'},
    )


@router.get("/download/report/{file_id}")
async def download_analysis_report(file_id: str) -> StreamingResponse:
    """Serve a plain-text analysis report built from the REAL stored analysis.

    Previously the Download Center's "Analysis Report" card was always
    "Unavailable" because no generator existed (CLAUDE.md §7.1). This builds
    the report on demand from the same stored `report` (the LLM's structured
    analysis), `recommendations` (the heuristic ML recommendation), `profile`,
    and `quality_score` the results page already renders -- so it reflects
    exactly what the pipeline produced, with nothing fabricated. Returns 404
    when the report doesn't exist or has no analysis to render.
    """
    _require_valid_file_id(file_id)

    report_path = resolve_report_path(file_id)
    if not report_path.exists():
        raise APIError(
            404,
            "NOT_FOUND",
            f"No results found for file_id='{file_id}'. Run /analyze first.",
        )
    try:
        data = json.loads(report_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise APIError(500, "INTERNAL_ERROR", "Stored analysis results are corrupted.") from exc

    report_raw = data.get("report")
    if not report_raw:
        raise APIError(
            404,
            "NOT_FOUND",
            f"No analysis report available for file_id='{file_id}'.",
        )

    report_text = build_analysis_report_text(
        file_id,
        report_raw,
        recommendations=data.get("recommendations"),
        profile=data.get("profile"),
        quality_score=data.get("quality_score"),
    )
    buffer = io.BytesIO(report_text.encode("utf-8"))
    return StreamingResponse(
        buffer,
        media_type="text/plain",
        headers={"Content-Disposition": 'attachment; filename="analysis_report.txt"'},
    )


@router.get("/download/charts/{file_id}")
async def download_charts_zip(file_id: str) -> StreamingResponse:
    """Zip every generated chart for this file_id and return it as a download.

    Charts live in `Config.CHARTS_FOLDER`, named `{file_id}_<kind>_<...>.png`
    by visualizer.py (e.g. `{file_id}_bar_Sex.png`,
    `{file_id}_correlation_heatmap.png`) -- globbing on that prefix is the
    same convention `_chart_path_to_url` above already relies on the
    filename (not the full path) for, so this stays consistent with how
    chart files are located everywhere else in the app.
    """
    _require_valid_file_id(file_id)

    chart_paths = sorted(Config.CHARTS_FOLDER.glob(f"{file_id}_*.png"))
    if not chart_paths:
        raise APIError(
            404,
            "NOT_FOUND",
            f"No charts found for file_id='{file_id}'. Run /analyze first.",
        )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in chart_paths:
            # Strip the "{file_id}_" prefix so the user sees clean names inside
            # the archive (e.g. "bar_chart_Country.png") while the on-disk file
            # retains the full collision-safe name (e.g.
            # "2099407f_bar_chart_Country.png") -- arcname only affects what the
            # ZIP entry is called, not which file is read from disk.
            arcname = path.name.removeprefix(f"{file_id}_")
            archive.write(path, arcname=arcname)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="charts.zip"'},
    )

