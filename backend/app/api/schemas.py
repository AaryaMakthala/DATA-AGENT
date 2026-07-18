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

    # --- NEW: enriched dashboard sections (redesign brief §1-§20) ---
    # Typed loosely as `dict[str, Any] | None` rather than fully-nested
    # Pydantic submodels on purpose: the shape of each section is already
    # defined once, precisely, in app/services/response_builder.py and
    # app/services/report_adapter.py (which is the single source of truth
    # for what these dicts contain) and again in the frontend's Zod schema
    # (frontend/app/results/page.tsx). Duplicating that shape a third time
    # here as strict Pydantic models would just be one more place to keep in
    # sync -- `dict[str, Any]` lets those two ends stay authoritative while
    # FastAPI still serializes whatever report_adapter.build_results_response
    # returns instead of silently stripping it.
    overview: dict[str, Any] | None = None
    quality: dict[str, Any] | None = None
    analysis: dict[str, Any] | None = None
    cleaning_summary: dict[str, Any] | None = None
    before_after: dict[str, Any] | None = None
    visualizations: dict[str, Any] | None = None
    ml_recommendation: dict[str, Any] | None = None
    downloads: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None