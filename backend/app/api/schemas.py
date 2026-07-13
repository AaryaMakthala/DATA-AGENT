"""Pydantic request/response models for the FastAPI routes."""

from typing import Any, Optional

from pydantic import BaseModel


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    rows: int
    columns: int


class AnalyzeResponse(BaseModel):
    file_id: str
    status: str
    profile: Optional[dict[str, Any]] = None
    report: Optional[str] = None
    cleaning_plan: Optional[Any] = None
    cleaned_file: Optional[str] = None
    charts: Optional[list[str]] = None
    recommendations: Optional[Any] = None


class ResultsResponse(BaseModel):
    file_id: str
    profile: Optional[dict[str, Any]] = None
    report: Optional[str] = None
    cleaning_plan: Optional[Any] = None
    cleaned_file: Optional[str] = None
    charts: Optional[list[str]] = None
    recommendations: Optional[Any] = None
