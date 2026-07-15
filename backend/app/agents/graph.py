"""LangGraph workflow (CLAUDE.md §5, extended per Known Bugs Issues 2 and 6a).

Node sequence: START -> Profiler Node -> Target Detection Node -> Validation
Node -(valid)-> LLM Analysis Node -> Cleaning Plan Node -> Python Cleaning
Node -> Visualization Node -> ML Recommendation Node -> END. If Validation
finds the dataset/target unusable, it routes straight to END instead --
no LLM call, no cleaning, no charts are produced for data that can't be
modeled (see `validation_node` / `_route_after_validation`).

Target detection runs on the ORIGINAL uploaded dataframe, before any
cleaning or one-hot encoding, and its result is threaded through `state`
for every downstream node to reuse -- nothing re-derives the target from a
cleaned/encoded dataframe.

The "Upload CSV" step from the spec's node sequence happens before the graph
runs at all -- the FastAPI /upload endpoint saves the file and hands the graph
a file_path to start from, so there's no separate no-op node for it here.
"""

import json
import re
import uuid

from langgraph.graph import END, START, StateGraph

from app.agents.llm_router import LLMRouter, LLMRouterError
from app.agents.state import AnalystState
from app.prompts.analysis_prompt import build_analysis_prompt
from app.prompts.cleaning_prompt import build_cleaning_prompt
from app.tools.cleaner import CleanerError, clean_csv
from app.tools.ml_recommender import (
    MLRecommenderError,
    detect_identifier_columns,
    detect_target_column,
    recommend_algorithms,
)
from app.tools.profiler import ProfilerError, load_dataframe, profile_csv
from app.tools.validator import validate_dataset
from app.tools.visualizer import VisualizerError, generate_charts
from app.utils.logger import get_logger

logger = get_logger(__name__)

_router = LLMRouter()

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.DOTALL)


def _extract_json_object(text: str) -> str:
    """Strip a ```json ... ``` code fence if the LLM added one despite instructions."""
    match = _JSON_FENCE_RE.search(text)
    return match.group(1) if match else text


def profiler_node(state: AnalystState) -> dict:
    """Run the Python profiler on the uploaded CSV. No LLM involved."""
    logger.info("Graph: running profiler node for %s", state["file_path"])
    try:
        profile = profile_csv(state["file_path"])
    except ProfilerError as exc:
        logger.error("Graph: profiler node failed: %s", exc)
        raise
    return {"profile": profile}


def target_detection_node(state: AnalystState) -> dict:
    """Detect the likely target column on the ORIGINAL uploaded dataframe.

    Must run before any cleaning/encoding step touches the data -- running
    this on a cleaned/encoded frame is exactly the Issue 2 bug (an encoded
    dummy column like 'Department_Marketing' getting picked as the target).
    """
    logger.info("Graph: running target detection node for %s", state["file_path"])
    try:
        df = load_dataframe(state["file_path"])
    except ProfilerError as exc:
        logger.error("Graph: target detection node failed to load CSV: %s", exc)
        raise
    target_column, target_reasoning, possible_targets = detect_target_column(df)
    identifier_columns = detect_identifier_columns(df, target_column)
    logger.info("Graph: detected target_column=%s -- %s", target_column, target_reasoning)
    if identifier_columns:
        logger.info("Graph: detected identifier columns (excluded from charts/features): %s", identifier_columns)
    return {
        "target_column": target_column,
        "target_reasoning": target_reasoning,
        "possible_targets": possible_targets,
        "identifier_columns": identifier_columns,
    }


def validation_node(state: AnalystState) -> dict:
    """Gate: decide whether this dataset (and its detected target) can be modeled at all.

    Runs on the original dataframe, using the target detected by
    `target_detection_node`. If this fails, downstream nodes (LLM analysis,
    cleaning, visualization, ML recommendation) never run.
    """
    logger.info("Graph: running validation node")
    try:
        df = load_dataframe(state["file_path"])
    except ProfilerError as exc:
        logger.error("Graph: validation node failed to load CSV: %s", exc)
        raise
    data_validity = validate_dataset(df, state.get("target_column"))
    return {"data_validity": data_validity}


def _route_after_validation(state: AnalystState) -> str:
    """Skip straight to END when the dataset failed validation."""
    data_validity = state.get("data_validity") or {}
    if not data_validity.get("valid", True):
        logger.info("Graph: dataset failed validation (%s); skipping LLM/cleaning/visualization/ML nodes", data_validity.get("errors"))
        return "invalid"
    return "valid"


def llm_analysis_node(state: AnalystState) -> dict:
    """Ask the LLM to explain the profile in plain text (report + insights)."""
    logger.info("Graph: running LLM analysis node")
    prompt = build_analysis_prompt(state["profile"])
    try:
        report = _router.generate(prompt)
    except LLMRouterError as exc:
        logger.error("Graph: LLM analysis node failed: %s", exc)
        raise
    return {"report": report}


def cleaning_plan_node(state: AnalystState) -> dict:
    """Ask the LLM for a structured cleaning plan Python will later execute."""
    logger.info("Graph: running cleaning plan node")
    prompt = build_cleaning_prompt(state["profile"])
    try:
        raw = _router.generate(prompt)
    except LLMRouterError as exc:
        logger.error("Graph: cleaning plan node failed: %s", exc)
        raise

    try:
        plan = json.loads(_extract_json_object(raw))
    except json.JSONDecodeError:
        logger.warning("Graph: cleaning plan response was not valid JSON; storing raw text instead")
        plan = {"raw_plan": raw}

    return {"cleaning_plan": plan}


def python_cleaning_node(state: AnalystState) -> dict:
    """Execute the LLM's cleaning plan against the real DataFrame with pandas.

    Overwrites `state["cleaning_plan"]` with the *applied* plan `clean_csv`
    returns (target-column entries rewritten to show they were protected,
    not applied) so downstream consumers -- the API response and the
    frontend's "Cleaning Plan Applied" report -- reflect what actually
    happened to the data, not the LLM's original raw proposal.
    """
    logger.info("Graph: running Python cleaning node")
    file_id = state.get("file_id") or uuid.uuid4().hex
    try:
        cleaned_file, applied_plan, viz_file = clean_csv(
            state["file_path"],
            state.get("cleaning_plan"),
            file_id,
            state.get("target_column"),
            state.get("identifier_columns"),
        )
    except CleanerError as exc:
        logger.error("Graph: Python cleaning node failed: %s", exc)
        raise
    return {"cleaned_file": cleaned_file, "cleaning_plan": applied_plan, "viz_file": viz_file}


def visualization_node(state: AnalystState) -> dict:
    """Generate charts from the cleaned dataset, BEFORE one-hot encoding.

    Uses `state["viz_file"]` -- the snapshot the cleaner saved after
    missing-value/outlier cleaning but before encoding -- so charts are drawn
    from the original categorical columns (a single bar chart of each), not
    meaningless dummy-vs-dummy scatter plots between one-hot columns (Known
    Bugs, Issue 3). Identifier columns were already dropped by the cleaner, so
    no ID histograms/scatters are produced either (Issue 4).
    """
    logger.info("Graph: running visualization node")
    file_id = state.get("file_id") or uuid.uuid4().hex
    viz_source = state.get("viz_file") or state["cleaned_file"]
    try:
        charts = generate_charts(viz_source, file_id)
    except VisualizerError as exc:
        logger.error("Graph: visualization node failed: %s", exc)
        raise
    return {"charts": charts}


def ml_recommendation_node(state: AnalystState) -> dict:
    """Produce heuristic ML algorithm recommendations from the cleaned dataset.

    Re-profiles the cleaned file rather than reusing the pre-cleaning profile:
    cleaning can change missing-value counts, outlier counts, and row counts,
    so the recommender's dataset signals need to reflect the data as it
    actually stands after cleaning, not before.

    Reuses `state["target_column"]`/`state["target_reasoning"]` -- computed
    once by `target_detection_node` on the ORIGINAL dataframe -- instead of
    letting `recommend_algorithms` re-derive the target from the cleaned/
    encoded file. That re-derivation was the Known Bugs Issue 2 bug (an
    encoded dummy column like 'Department_Marketing' getting picked as the
    target).
    """
    logger.info("Graph: running ML recommendation node")
    try:
        cleaned_profile = profile_csv(state["cleaned_file"])
        recommendations = recommend_algorithms(
            state["cleaned_file"],
            cleaned_profile,
            state.get("target_column"),
            state.get("target_reasoning") or "",
            state.get("identifier_columns"),
            state.get("possible_targets"),
        )
    except (ProfilerError, MLRecommenderError) as exc:
        logger.error("Graph: ML recommendation node failed: %s", exc)
        raise
    return {"recommendations": recommendations}


def build_graph():
    """Compile the full analysis graph (CLAUDE.md §5 node sequence)."""
    graph = StateGraph(AnalystState)

    graph.add_node("profiler", profiler_node)
    graph.add_node("target_detection", target_detection_node)
    graph.add_node("validation", validation_node)
    graph.add_node("llm_analysis", llm_analysis_node)
    graph.add_node("generate_cleaning_plan", cleaning_plan_node)
    graph.add_node("python_cleaning", python_cleaning_node)
    graph.add_node("visualization", visualization_node)
    graph.add_node("ml_recommendation", ml_recommendation_node)

    graph.add_edge(START, "profiler")
    graph.add_edge("profiler", "target_detection")
    graph.add_edge("target_detection", "validation")
    graph.add_conditional_edges(
        "validation",
        _route_after_validation,
        {"valid": "llm_analysis", "invalid": END},
    )
    graph.add_edge("llm_analysis", "generate_cleaning_plan")
    graph.add_edge("generate_cleaning_plan", "python_cleaning")
    graph.add_edge("python_cleaning", "visualization")
    graph.add_edge("visualization", "ml_recommendation")
    graph.add_edge("ml_recommendation", END)

    return graph.compile()
