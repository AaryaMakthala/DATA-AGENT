"""FastAPI routes: /upload, /analyze/{file_id}, /results/{file_id}, /download/{file_id}."""

import json
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.agents.graph import build_graph
from app.agents.llm_router import LLMRouterError
from app.api.errors import APIError
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


def _charts_to_urls(chart_paths: list[str] | None) -> list[str] | None:
    if chart_paths is None:
        return None
    return [f"/charts/{Path(p).name}" for p in chart_paths]


def _response_payload(file_id: str, data: dict):
    return dict(
        file_id=file_id,
        profile=data.get("profile"),
        data_validity=data.get("data_validity"),
        report=data.get("report"),
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

    return ResultsResponse(
        **_response_payload(file_id, data)
    )


@router.get("/download/{file_id}")
async def download_cleaned_csv(file_id: str) -> FileResponse:
    try:
        path = resolve_cleaned_file_path(file_id)
    except FileServiceError as exc:
        raise APIError(404, "NOT_FOUND", str(exc)) from exc

    return FileResponse(
        path,
        media_type="text/csv",
        filename=f"{file_id}_cleaned.csv",
    )