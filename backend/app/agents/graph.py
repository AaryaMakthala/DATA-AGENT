"""LangGraph workflow (CLAUDE.md §5, extended per Known Bugs Issues 2 and 6a).

Node sequence: START -> Profiler Node -> Target Detection Node -> Validation
Node -(valid)-> LLM Node (analysis + cleaning plan, run concurrently) ->
Python Cleaning Node -> Visualization Node -> ML Recommendation Node -> END.
If Validation finds the dataset/target unusable, it routes straight to END
instead -- no LLM call, no cleaning, no charts are produced for data that
can't be modeled (see `validation_node` / `_route_after_validation`).

The analysis and cleaning-plan LLM calls used to be two sequential nodes.
They're independent -- each reads only the profile and writes a disjoint state
key -- so they now run concurrently inside a single `llm_nodes` node, making
their combined cost the slower call rather than the sum of both.

Target detection runs on the ORIGINAL uploaded dataframe, before any
cleaning or one-hot encoding, and its result is threaded through `state`
for every downstream node to reuse -- nothing re-derives the target from a
cleaned/encoded dataframe.

The "Upload CSV" step from the spec's node sequence happens before the graph
runs at all -- the FastAPI /upload endpoint saves the file and hands the graph
a file_path to start from, so there's no separate no-op node for it here.

`file_id` handling: `profiler_node` (the first node in the graph) generates
a `file_id` if the caller didn't already put one in the initial state, and
returns it into `state`. Every downstream node that needs a file_id
(`python_cleaning_node`, `visualization_node`) reads `state["file_id"]`
directly instead of generating its own fallback UUID. Previously each of
those two nodes independently did `state.get("file_id") or uuid.uuid4().hex`,
which meant that whenever `file_id` wasn't pre-seeded, they generated *two
different* random IDs -- cleaned files/viz snapshots got tagged with one UUID
and charts with another, silently breaking the file_id contract the frontend
relies on to associate outputs from the same run. Generating it once, in the
first node, and threading it through state like every other derived field,
removes that class of bug entirely.

CHANGED (this revision):
  - `_run_analysis_llm` now parses the analysis LLM's response as JSON
    (structured {overview, key_findings, risks, recommendations} --
    see prompts/analysis_prompt.py), the same way `_run_cleaning_plan_llm`
    already parses the cleaning plan. Falls back to the raw string if the
    model didn't return valid JSON, so `state["report"]` is `dict | str`
    rather than always `str` -- `app/services/executive_summary.py`'s
    `format_executive_summary` already handles both.
  - `ml_recommendation_node` now returns `cleaned_profile` (the profile it
    already computes locally by re-profiling the cleaned file) into state,
    instead of discarding it once the node returns. `state["profile"]`
    remains the ORIGINAL pre-cleaning profile as before -- this adds the
    missing second half of the pair, it doesn't change what `profile` means.
"""

import concurrent.futures
import json
import re
import uuid
from pathlib import Path

from langgraph.graph import END, START, StateGraph

from app.agents.llm_router import LLMRouter, LLMRouterError
from app.agents.state import AnalystState
from app.prompts.analysis_prompt import build_analysis_prompt
from app.prompts.cleaning_prompt import build_cleaning_prompt
from app.tools.cleaner import CleanerError, clean_csv
from app.tools.data_quality import compute_quality_score
from app.tools.ml_recommender import (
    MLRecommenderError,
    detect_identifier_columns,
    detect_target_column,
    recommend_algorithms,
)
from app.tools.profiler import ProfilerError, load_dataframe, profile_csv, profile_dataframe
from app.tools.validator import validate_dataset
from app.tools.visualizer import VisualizerError, generate_charts
from app.utils.logger import get_logger, log_duration

logger = get_logger(__name__)

_router = LLMRouter()

# Non-greedy so a stray extra ```...``` fenced block earlier in the LLM's
# response (e.g. an example shown before the real answer) can't get pulled
# into the match along with the real JSON object.
_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def _extract_json_object(text: str) -> str:
    """Strip a ```json ... ``` code fence if the LLM added one despite instructions."""
    match = _JSON_FENCE_RE.search(text)
    return match.group(1) if match else text


def profiler_node(state: AnalystState) -> dict:
    """Run the Python profiler on the uploaded CSV. No LLM involved.

    Also the single source of truth for `file_id`: if the caller (the
    FastAPI /upload endpoint) already put one in the initial state, it's
    reused; otherwise one is generated here, once, and threaded through
    state for every downstream node that needs to name an output file.

    Loads and repairs the CSV once here and stores the DataFrame in
    `state["dataframe"]` so target_detection / validation / cleaning reuse
    it instead of each re-reading the file from disk.
    """
    logger.info("Graph: running profiler node for %s", state["file_path"])
    file_id = state.get("file_id") or uuid.uuid4().hex
    # Prefer the real upload name the FastAPI route seeded into the initial
    # state (via file_service.resolve_original_filename); fall back to the
    # file_path's stem for graph invocations that didn't go through /upload
    # (e.g. direct tests) -- see AnalystState.original_filename.
    original_filename = state.get("original_filename") or Path(state["file_path"]).stem
    metrics: dict[str, float] = {}
    try:
        with log_duration(logger, "profiler_node", metrics, "profiling"):
            with log_duration(logger, "profiler_node.load_csv"):
                df = load_dataframe(state["file_path"])
            label = Path(state["file_path"]).name
            profile = profile_dataframe(df, label)
    except ProfilerError as exc:
        logger.error("Graph: profiler node failed: %s", exc)
        raise
    return {
        "profile": profile,
        "dataframe": df,
        "file_id": file_id,
        "original_filename": original_filename,
        "processing_metrics": metrics,
    }


def target_detection_node(state: AnalystState) -> dict:
    """Detect the likely target column on the ORIGINAL uploaded dataframe.

    Must run before any cleaning/encoding step touches the data -- running
    this on a cleaned/encoded frame is exactly the Issue 2 bug (an encoded
    dummy column like 'Department_Marketing' getting picked as the target).
    """
    logger.info("Graph: running target detection node for %s", state["file_path"])
    metrics: dict[str, float] = {}
    with log_duration(logger, "target_detection_node", metrics, "target_detection"):
        df = state.get("dataframe")
        if df is None:
            # Fallback for callers that invoke this node without going through
            # profiler_node (e.g. isolated unit tests).
            try:
                with log_duration(logger, "target_detection_node.load_csv"):
                    df = load_dataframe(state["file_path"])
            except ProfilerError as exc:
                logger.error("Graph: target detection node failed to load CSV: %s", exc)
                raise
        with log_duration(logger, "target_detection_node.detect"):
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
        "processing_metrics": metrics,
    }


def validation_node(state: AnalystState) -> dict:
    """Gate: decide whether this dataset (and its detected target) can be modeled at all.

    Runs on the original dataframe, using the target detected by
    `target_detection_node`. If this fails, downstream nodes (LLM analysis,
    cleaning, visualization, ML recommendation) never run.
    """
    logger.info("Graph: running validation node")
    metrics: dict[str, float] = {}
    with log_duration(logger, "validation_node", metrics, "validation"):
        df = state.get("dataframe")
        if df is None:
            try:
                df = load_dataframe(state["file_path"])
            except ProfilerError as exc:
                logger.error("Graph: validation node failed to load CSV: %s", exc)
                raise
        data_validity = validate_dataset(
            df,
            state.get("target_column"),
            state.get("identifier_columns"),
        )
    return {"data_validity": data_validity, "processing_metrics": metrics}


def _route_after_validation(state: AnalystState) -> str:
    """Skip straight to END when the dataset failed validation."""
    data_validity = state.get("data_validity") or {}
    if not data_validity.get("valid", True):
        logger.info("Graph: dataset failed validation (%s); skipping LLM/cleaning/visualization/ML nodes", data_validity.get("errors"))
        return "invalid"
    return "valid"


def _run_analysis_llm(profile: dict) -> dict | str:
    """Worker: get the structured analysis from the LLM. Runs in a thread.

    Parses the response as JSON (the {overview, key_findings, risks,
    recommendations} shape from prompts/analysis_prompt.py) the same way
    `_run_cleaning_plan_llm` parses the cleaning plan below. Falls back to
    the raw string -- not a `{"raw_plan": ...}` wrapper -- if the model
    didn't return valid JSON, since `format_executive_summary` treats a
    plain string as its own valid (if less structured) input.
    """
    prompt = build_analysis_prompt(profile)
    with log_duration(logger, "llm_analysis.generate (LLM call)"):
        raw = _router.generate(prompt)
    try:
        return json.loads(_extract_json_object(raw))
    except json.JSONDecodeError:
        logger.warning("Graph: analysis response was not valid JSON; storing raw text instead")
        return raw


def _run_cleaning_plan_llm(profile: dict) -> dict:
    """Worker: get the structured cleaning plan from the LLM. Runs in a thread.

    Parses the JSON here (inside the worker) so the JSON-decode work happens off
    the main thread too, and falls back to storing the raw text if the model
    didn't return valid JSON -- same behavior as the old sequential node.
    """
    prompt = build_cleaning_prompt(profile)
    with log_duration(logger, "cleaning_plan.generate (LLM call)"):
        raw = _router.generate(prompt)
    try:
        return json.loads(_extract_json_object(raw))
    except json.JSONDecodeError:
        logger.warning("Graph: cleaning plan response was not valid JSON; storing raw text instead")
        return {"raw_plan": raw}


def llm_nodes(state: AnalystState) -> dict:
    """Run the two independent LLM calls (analysis + cleaning plan) concurrently.

    These were two sequential graph nodes, but each reads only `state["profile"]`
    and writes a disjoint key (`report` vs `cleaning_plan`), so there's no data
    dependency between them -- running them back to back just paid for two round
    trips in series. Here they run in parallel on a small ThreadPoolExecutor, so
    the combined wall-clock cost is the slower of the two calls, not their sum.

    Both worker functions delegate to the shared `_router`, whose own provider
    pool is sized to handle these two concurrent calls -- see llm_router.py's
    module docstring for why that pool needs more than 2 workers now that calls
    can be both concurrent (this node) *and* sequential-with-fallback (each
    individual `generate()` call trying up to 3 providers).

    If either call fails (LLMRouterError after the whole provider chain is
    exhausted), the analysis aborts. Both futures are waited on first so that a
    simultaneous failure of *both* calls logs each provider-chain error before
    raising -- concurrent.futures never surfaces an unretrieved future's
    exception on its own, so without this the cleaning-plan failure would be
    invisible (CLAUDE.md §13: no silent failures). The analysis error is raised
    first when both fail, matching the old sequential order.
    """
    logger.info("Graph: running LLM nodes (analysis + cleaning plan) in parallel")
    profile = state["profile"]
    metrics: dict[str, float] = {}
    with log_duration(logger, "llm_nodes parallel block (analysis + cleaning plan)", metrics, "analyzing"):
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=2, thread_name_prefix="llm-node"
        ) as pool:
            analysis_future = pool.submit(_run_analysis_llm, profile)
            cleaning_future = pool.submit(_run_cleaning_plan_llm, profile)

            # Wait for both to finish so we can report *every* failure, not just
            # the first -- otherwise a cleaning-plan error is swallowed when the
            # analysis call also failed.
            concurrent.futures.wait([analysis_future, cleaning_future])
            analysis_exc = analysis_future.exception()
            cleaning_exc = cleaning_future.exception()

            if analysis_exc is not None:
                logger.error("Graph: LLM analysis call failed: %s", analysis_exc)
            if cleaning_exc is not None:
                logger.error("Graph: LLM cleaning-plan call failed: %s", cleaning_exc)
            if analysis_exc is not None:
                raise analysis_exc
            if cleaning_exc is not None:
                raise cleaning_exc

            report = analysis_future.result()
            cleaning_plan = cleaning_future.result()

    return {"report": report, "cleaning_plan": cleaning_plan, "processing_metrics": metrics}


def python_cleaning_node(state: AnalystState) -> dict:
    """Execute the LLM's cleaning plan against the real DataFrame with pandas.

    Overwrites `state["cleaning_plan"]` with the *applied* plan `clean_csv`
    returns (target-column entries rewritten to show they were protected,
    not applied) so downstream consumers -- the API response and the
    frontend's "Cleaning Plan Applied" report -- reflect what actually
    happened to the data, not the LLM's original raw proposal.

    Uses `state["file_id"]` (set once by `profiler_node`) to name output
    files rather than generating its own fallback UUID -- see module
    docstring for why generating separate UUIDs per node was a bug.

    Reuses `state["dataframe"]` (loaded once by `profiler_node`) so cleaning
    does not re-read the original upload from disk.
    """
    logger.info("Graph: running Python cleaning node")
    file_id = state["file_id"]
    metrics: dict[str, float] = {}
    try:
        with log_duration(logger, "python_cleaning_node", metrics, "cleaning"):
            cleaned_file, applied_plan, viz_file = clean_csv(
                state["file_path"],
                state.get("cleaning_plan"),
                file_id,
                state["original_filename"],
                state.get("target_column"),
                state.get("identifier_columns"),
                df=state.get("dataframe"),
            )
    except CleanerError as exc:
        logger.error("Graph: Python cleaning node failed: %s", exc)
        raise
    return {"cleaned_file": cleaned_file, "cleaning_plan": applied_plan, "viz_file": viz_file, "processing_metrics": metrics}


def visualization_node(state: AnalystState) -> dict:
    """Generate charts from the cleaned dataset, BEFORE one-hot encoding.

    Uses `state["viz_file"]` -- the snapshot the cleaner saved after
    missing-value/outlier cleaning but before encoding -- so charts are drawn
    from the original categorical columns (a single bar chart of each), not
    meaningless dummy-vs-dummy scatter plots between one-hot columns (Known
    Bugs, Issue 3). Identifier columns were already dropped by the cleaner, so
    no ID histograms/scatters are produced either (Issue 4).

    Uses `state["file_id"]` (set once by `profiler_node`) so chart filenames
    share the same ID as the cleaned/viz files from `python_cleaning_node`
    instead of a separately-generated fallback UUID.

    `generate_charts` now returns a list of metadata dicts (path/chart_type/
    title/description/interpretation) instead of bare path strings -- this
    node's contract doesn't change, it still just forwards whatever
    `generate_charts` returns into `state["charts"]`.
    """
    logger.info("Graph: running visualization node")
    file_id = state["file_id"]
    viz_source = state.get("viz_file") or state["cleaned_file"]
    metrics: dict[str, float] = {}
    try:
        with log_duration(logger, "visualization_node (chart generation)", metrics, "generating_charts"):
            charts = generate_charts(viz_source, file_id, state["original_filename"])
    except VisualizerError as exc:
        logger.error("Graph: visualization node failed: %s", exc)
        raise
    return {"charts": charts, "processing_metrics": metrics}


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

    Now also returns `cleaned_profile` into state (previously this was a
    local variable, discarded once the node returned) -- this is what lets
    `report_adapter.py` compute real before/after cleaning comparisons
    instead of omitting that section entirely.
    """
    logger.info("Graph: running ML recommendation node")
    metrics: dict[str, float] = {}
    try:
        with log_duration(logger, "ml_recommendation_node.reprofile", metrics, "cleaning_profile"):
            cleaned_profile = profile_csv(state["cleaned_file"])
        with log_duration(logger, "ml_recommendation_node (recommend + quality)", metrics, "recommending_models"):
            with log_duration(logger, "ml_recommendation_node.recommend"):
                recommendations = recommend_algorithms(
                    state["cleaned_file"],
                    cleaned_profile,
                    state.get("target_column"),
                    state.get("target_reasoning") or "",
                    state.get("identifier_columns"),
                    state.get("possible_targets"),
                )
            # Data quality score is computed from the cleaned profile plus the
            # detected target/problem type -- deterministic Python, no LLM (see
            # data_quality.py). Timed inside the recommending_models block so
            # its cost is reflected in that stage's persisted metric.
            with log_duration(logger, "ml_recommendation_node.quality_score"):
                quality = compute_quality_score(
                    cleaned_profile,
                    state.get("target_column"),
                    recommendations.get("problem_type"),
                    state.get("identifier_columns"),
                )
    except (ProfilerError, MLRecommenderError) as exc:
        logger.error("Graph: ML recommendation node failed: %s", exc)
        raise

    return {
        "recommendations": recommendations,
        "quality_score": quality,
        "cleaned_profile": cleaned_profile,
        "processing_metrics": metrics,
    }


def build_graph():
    """Compile the full analysis graph (CLAUDE.md §5 node sequence)."""
    graph = StateGraph(AnalystState)

    graph.add_node("profiler", profiler_node)
    graph.add_node("target_detection", target_detection_node)
    graph.add_node("validation", validation_node)
    graph.add_node("llm_nodes", llm_nodes)
    graph.add_node("python_cleaning", python_cleaning_node)
    graph.add_node("visualization", visualization_node)
    graph.add_node("ml_recommendation", ml_recommendation_node)

    graph.add_edge(START, "profiler")
    graph.add_edge("profiler", "target_detection")
    graph.add_edge("target_detection", "validation")
    graph.add_conditional_edges(
        "validation",
        _route_after_validation,
        {"valid": "llm_nodes", "invalid": END},
    )
    graph.add_edge("llm_nodes", "python_cleaning")
    graph.add_edge("python_cleaning", "visualization")
    graph.add_edge("visualization", "ml_recommendation")
    graph.add_edge("ml_recommendation", END)

    return graph.compile()