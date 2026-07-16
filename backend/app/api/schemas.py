"""Pydantic request/response models for the FastAPI routes."""

from typing import Any

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    rows: int
    columns: int


class DataValidity(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    duplicate_percentage: float = 0.0


class QualityScore(BaseModel):
    quality_score: int
    components: dict[str, int] = Field(default_factory=dict)
    issues: list[str] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    file_id: str
    status: str

    profile: dict[str, Any] | None = None
    data_validity: DataValidity | None = None
    quality_score: QualityScore | None = None
    report: str | None = None
    cleaning_plan: Any | None = None
    cleaned_file: str | None = None
    charts: list[str] | None = None
    recommendations: Any | None = None


class ResultsResponse(BaseModel):
    file_id: str

    profile: dict[str, Any] | None = None
    data_validity: DataValidity | None = None
    quality_score: QualityScore | None = None
    report: str | None = None
    cleaning_plan: Any | None = None
    cleaned_file: str | None = None
    charts: list[str] | None = None
    recommendations: Any | None = None