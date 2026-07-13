"""FastAPI routes: /upload, /analyze/{file_id}, /results/{file_id}."""

import json

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.agents.graph import build_graph
from app.agents.llm_router import LLMRouterError
from app.api.schemas import AnalyzeResponse, ResultsResponse, UploadResponse
from app.services.csv_service import CSVServiceError, validate_and_preview
from app.services.file_service import FileServiceError, resolve_report_path, resolve_upload_path, save_upload
from app.tools.cleaner import CleanerError
from app.tools.ml_recommender import MLRecommenderError
from app.tools.profiler import ProfilerError
from app.tools.visualizer import VisualizerError
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

_graph = build_graph()


@router.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...)) -> UploadResponse:
    """Accept a CSV upload, validate it, and return a file_id for later analysis."""
    try:
        file_id, path = save_upload(file)
    except FileServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        preview = validate_and_preview(path)
    except CSVServiceError as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return UploadResponse(file_id=file_id, filename=file.filename, rows=preview["rows"], columns=preview["columns"])


@router.post("/analyze/{file_id}", response_model=AnalyzeResponse)
async def analyze_csv(file_id: str) -> AnalyzeResponse:
    """Run the LangGraph analysis workflow on a previously uploaded file."""
    try:
        path = resolve_upload_path(file_id)
    except FileServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        result_state = _graph.invoke({"file_path": str(path), "file_id": file_id})
    except ProfilerError as exc:
        raise HTTPException(status_code=400, detail=f"Profiling failed: {exc}") from exc
    except LLMRouterError as exc:
        raise HTTPException(status_code=502, detail=f"LLM analysis failed: {exc}") from exc
    except CleanerError as exc:
        raise HTTPException(status_code=500, detail=f"Cleaning failed: {exc}") from exc
    except VisualizerError as exc:
        raise HTTPException(status_code=500, detail=f"Chart generation failed: {exc}") from exc
    except MLRecommenderError as exc:
        raise HTTPException(status_code=500, detail=f"Algorithm recommendation failed: {exc}") from exc
    except Exception as exc:  # noqa: BLE001 -- last resort so the API never leaks a raw traceback
        logger.exception("Unexpected error during analysis of file_id=%s", file_id)
        raise HTTPException(status_code=500, detail=f"Unexpected error during analysis: {exc}") from exc

    resolve_report_path(file_id).write_text(json.dumps(result_state, indent=2, default=str), encoding="utf-8")

    return AnalyzeResponse(
        file_id=file_id,
        status="completed",
        profile=result_state.get("profile"),
        report=result_state.get("report"),
        cleaning_plan=result_state.get("cleaning_plan"),
        cleaned_file=result_state.get("cleaned_file"),
        charts=result_state.get("charts"),
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
        report=data.get("report"),
        cleaning_plan=data.get("cleaning_plan"),
        cleaned_file=data.get("cleaned_file"),
        charts=data.get("charts"),
        recommendations=data.get("recommendations"),
    )
