"""Shared state object threaded through the LangGraph workflow."""

from typing import Annotated, Any, Optional, TypedDict


def merge_processing_metrics(
    left: Optional[dict[str, float]],
    right: Optional[dict[str, float]],
) -> dict[str, float]:
    """Reducer: accumulate per-node timings as each node returns.

    Each node returns `{"processing_metrics": {<stage>: <seconds>}}` for just
    its own stage. Without a reducer, LangGraph would overwrite the whole dict
    on every node return, leaving only the last node's timing. This merges the
    incremental per-node dicts into one accumulated `{stage: seconds}` map.
    """
    merged: dict[str, float] = dict(left) if left else {}
    if right:
        merged.update(right)
    return merged


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
    charts: Optional[list[dict[str, Any]]]
    report: Any
    recommendations: Optional[Any]
    quality_score: Optional[dict[str, Any]]

    # NEW: the post-cleaning profile, re-profiled by `ml_recommendation_node`
    # from the cleaned CSV. `profile` (above) is set once by `profiler_node`
    # and always holds the ORIGINAL pre-cleaning profile -- nothing ever
    # overwrites it. Before this field existed, `ml_recommendation_node`
    # computed a cleaned profile purely as a local variable and never
    # returned it into state, so it was lost the moment the node finished --
    # meaning real before/after cleaning comparisons were impossible from
    # the stored report. This field is what unlocks that.
    cleaned_profile: Optional[dict[str, Any]]

    # Per-node execution timings in seconds, keyed by stage name (e.g.
    # {"profiling": 0.41, "analyzing": 1.63, ...}). Each node returns only its
    # own stage; the `merge_processing_metrics` reducer accumulates them across
    # nodes instead of the default overwrite-on-return behavior. Persisted into
    # the stored report and surfaced as `metadata.processing_metrics` by
    # report_adapter.py (which adds a derived `total_time`).
    processing_metrics: Annotated[dict[str, float], merge_processing_metrics]