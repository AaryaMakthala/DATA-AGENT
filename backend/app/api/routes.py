"""FastAPI routes: /upload, /analyze/{file_id}, /results/{file_id}, /download/{file_id}."""

import json
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.agents.graph import build_graph
from app.agents.llm_router import LLMRouterError
from app.api.schemas import AnalyzeResponse, ResultsResponse, UploadResponse
from app.services.csv_service import CSVServiceError, validate_and_preview
from app.services.file_service import (
    FileServiceError,
    UploadTooLargeError,
    resolve_cleaned_file_path,
    resolve_report_path,
    resolve_upload_path,
    save_upload,
)
from app.tools.cleaner import CleanerError
from app.tools.ml_recommender import MLRecommenderError
from app.tools.profiler import ProfilerError
from app.tools.visualizer import VisualizerError
from app.utils.config import Config
from app.utils.logger import get_logger
from app.utils.rate_limiter import RateLimitExceeded, SlidingWindowRateLimiter, client_ip

logger = get_logger(__name__)
router = APIRouter()

_graph = build_graph()

# Shared per-IP limiter for the two endpoints that trigger real work/LLM spend.
# One window length, distinct per-endpoint caps (see Config). Requests are
# bucketed by endpoint name so /upload and /analyze counts never mix.
_rate_limiter = SlidingWindowRateLimiter(Config.RATE_LIMIT_WINDOW_SECONDS)


def _enforce_rate_limit(request: Request, bucket: str, max_requests: int) -> None:
    """Apply the per-IP rate limit for `bucket`, or raise HTTP 429 if exceeded.

    No-op when RATE_LIMIT_ENABLED is false (e.g. when a fronting gateway already
    rate-limits). On rejection, returns a 429 with a `Retry-After` header so a
    well-behaved client backs off for the right amount of time.
    """
    if not Config.RATE_LIMIT_ENABLED:
        return
    key = client_ip(request)
    try:
        _rate_limiter.check(bucket, key, max_requests)
    except RateLimitExceeded as exc:
        # Opportunistically prune expired buckets so long-lived processes don't
        # accumulate one deque per unique IP forever.
        _rate_limiter.prune()
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please wait a moment and try again.",
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc


def _charts_to_urls(chart_paths: list[str] | None) -> list[str] | None:
    """Convert absolute chart filesystem paths to the /charts/<filename> URLs main.py serves."""
    if chart_paths is None:
        return None
    return [f"/charts/{Path(p).name}" for p in chart_paths]


@router.post("/upload", response_model=UploadResponse)
async def upload_csv(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    """Accept a CSV upload, validate it, and return a file_id for later analysis."""
    _enforce_rate_limit(request, "upload", Config.RATE_LIMIT_UPLOAD_MAX)
    try:
        file_id, path = save_upload(file)
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except FileServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        preview = validate_and_preview(path)
    except CSVServiceError as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return UploadResponse(file_id=file_id, filename=file.filename, rows=preview["rows"], columns=preview["columns"])


@router.post("/analyze/{file_id}", response_model=AnalyzeResponse)
async def analyze_csv(request: Request, file_id: str) -> AnalyzeResponse:
    """Run the LangGraph analysis workflow on a previously uploaded file."""
    _enforce_rate_limit(request, "analyze", Config.RATE_LIMIT_ANALYZE_MAX)
    try:
        path = resolve_upload_path(file_id)
    except FileServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        result_state = _graph.invoke({"file_path": str(path), "file_id": file_id})
    except ProfilerError as exc:
        # A profiling failure is caused by the uploaded file, so the reason
        # (bad encoding, no columns, etc.) is safe and useful to return -- it
        # only ever names the uuid filename, never a server path.
        raise HTTPException(status_code=400, detail=f"Profiling failed: {exc}") from exc
    except LLMRouterError as exc:
        # The full provider-chain failure detail is logged, but the client only
        # needs to know the upstream analysis service was unavailable -- the
        # internal provider/quota specifics aren't theirs to see.
        logger.error("Analysis failed for file_id=%s: LLM router error: %s", file_id, exc)
        raise HTTPException(
            status_code=502,
            detail="The analysis service is temporarily unavailable. Please try again shortly.",
        ) from exc
    except (CleanerError, VisualizerError, MLRecommenderError) as exc:
        # These carry internal filesystem paths in their messages; log fully,
        # return a generic 500 so no server path or exception text leaks.
        logger.exception("Analysis pipeline failed for file_id=%s", file_id)
        raise HTTPException(
            status_code=500, detail="Analysis failed while processing the dataset."
        ) from exc
    except Exception as exc:  # noqa: BLE001 -- last resort so the API never leaks a raw traceback
        logger.exception("Unexpected error during analysis of file_id=%s", file_id)
        raise HTTPException(
            status_code=500, detail="An unexpected error occurred during analysis."
        ) from exc

    resolve_report_path(file_id).write_text(json.dumps(result_state, indent=2, default=str), encoding="utf-8")

    return AnalyzeResponse(
        file_id=file_id,
        status="completed",
        profile=result_state.get("profile"),
        data_validity=result_state.get("data_validity"),
        report=result_state.get("report"),
        cleaning_plan=result_state.get("cleaning_plan"),
        cleaned_file=f"/download/{file_id}" if result_state.get("cleaned_file") else None,
        charts=_charts_to_urls(result_state.get("charts")),
        recommendations=result_state.get("recommendations"),
    )


@router.get("/results/{file_id}", response_model=ResultsResponse)
async def get_results(file_id: str) -> ResultsResponse:
    """Return the stored results of a previous /analyze call."""
    report_path = resolve_report_path(file_id)
    if not report_path.exists():
        raise HTTPException(
            status_code=404, detail=f"No results found for file_id='{file_id}'. Run /analyze first."
        )

    data = json.loads(report_path.read_text(encoding="utf-8"))
    return ResultsResponse(
        file_id=file_id,
        profile=data.get("profile"),
        data_validity=data.get("data_validity"),
        report=data.get("report"),
        cleaning_plan=data.get("cleaning_plan"),
        cleaned_file=f"/download/{file_id}" if data.get("cleaned_file") else None,
        charts=_charts_to_urls(data.get("charts")),
        recommendations=data.get("recommendations"),
    )


@router.get("/download/{file_id}")
async def download_cleaned_csv(file_id: str) -> FileResponse:
    """Stream the cleaned CSV for a previously analyzed file_id."""
    try:
        path = resolve_cleaned_file_path(file_id)
    except FileServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return FileResponse(path, media_type="text/csv", filename=f"{file_id}_cleaned.csv")
