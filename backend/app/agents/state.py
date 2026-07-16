"""Shared state object threaded through the LangGraph workflow."""

from typing import Any, Optional, TypedDict


class AnalystState(TypedDict, total=False):
    """State carried between nodes of the analysis graph (CLAUDE.md §5).

    Every field is optional at the type level (`total=False`) because the
    graph fills them in progressively -- only `file_path` is guaranteed to
    be present when the graph starts. `file_id` is generated once by
    `profiler_node` (the first node) if the caller didn't already seed it,
    and every downstream node that needs a file_id reads it from state
    rather than generating its own -- see workflow.py for why that matters.
    """

    file_path: str
    file_id: str
    profile: dict[str, Any]
    target_column: Optional[str]
    target_reasoning: Optional[str]
    possible_targets: Optional[list[dict[str, Any]]]
    identifier_columns: Optional[list[str]]
    data_validity: Optional[dict[str, Any]]
    cleaning_plan: Any
    cleaned_file: Optional[str]
    viz_file: Optional[str]
    charts: Optional[list[str]]
    report: Optional[str]
    recommendations: Optional[Any]
    quality_score: Optional[dict[str, Any]]