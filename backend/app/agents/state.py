"""Shared state object threaded through the LangGraph workflow."""

from typing import Any, Optional, TypedDict


class AnalystState(TypedDict, total=False):
    """State carried between nodes of the analysis graph (CLAUDE.md §5).

    Every field is optional at the type level (`total=False`) because the
    graph fills them in progressively -- only `file_path` is guaranteed to
    be present when the graph starts.
    """

    file_path: str
    file_id: str
    profile: dict[str, Any]
    target_column: Optional[str]
    target_reasoning: Optional[str]
    identifier_columns: Optional[list[str]]
    data_validity: Optional[dict[str, Any]]
    cleaning_plan: Any
    cleaned_file: Optional[str]
    viz_file: Optional[str]
    charts: Optional[list[str]]
    report: Optional[str]
    recommendations: Optional[Any]
