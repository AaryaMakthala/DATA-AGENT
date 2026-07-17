"""Single-source-of-truth pipeline context.

THE BUG THIS FIXES (CLAUDE.md redesign brief, item 29)
--------------------------------------------------------------------------
The Titanic dataset has 891 rows, but the ML recommender reported "small
dataset (204 rows)". None of the six modules you shared (profiler, cleaner,
validator, quality, ml_recommender, visualizer) compute that number wrong --
`ml_recommender.recommend_algorithms()` doesn't re-profile at all, it just
reads `profile["shape"]["rows"]` from whatever `profile` dict it was handed.

That means the bug lives in the orchestrator/graph layer, in one of two
shapes:
  (a) `profiler.profile_csv()` gets called more than once against different
      files (original vs. cleaned vs. a stale temp file from a previous
      request), and the wrong call's result is threaded into the ML node, or
  (b) a `file_id` collision / cache reuse feeds a previous run's profile into
      the current run.

Both are "which profile did we use" bugs, not "how did we compute the
profile" bugs. The fix is architectural, not a numeric patch: profile the
uploaded file EXACTLY ONCE per request, hold it in a single immutable
context object, and have every downstream node (target detection, dataset
validator, LLM analysis, cleaner, quality score, visualizer, ML recommender)
read from that same object instead of accepting a loose `profile: dict`
parameter that could have come from anywhere.

This module is intentionally the ONLY place profile_csv() is called in the
pipeline. If you find a second call site anywhere in agents/graph.py or a
route handler, that second call site is the bug.
"""

from __future__ import annotations

import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Optional

from app.tools.profiler import profile_csv, ProfilerError
from app.utils.logger import get_logger

logger = get_logger(__name__)


class PipelineContextError(Exception):
    """Raised when the context can't be built or is used inconsistently."""


@dataclass
class StageTiming:
    stage: str
    seconds: float


@dataclass
class PipelineContext:
    """Immutable-by-convention carrier for everything downstream nodes need.

    Created once, right after upload validation, by `build_context()` below.
    Every node in the graph should take a `PipelineContext` (or read specific
    fields off it) instead of re-deriving profile/shape/target information on
    its own. In particular:

      * `profile` is the ONE profile dict for the ORIGINAL uploaded file.
        Target detection, the dataset validator, the LLM analysis node, and
        the quality scorer all read this same dict.
      * `cleaned_profile` is populated later (see `attach_cleaned_profile`)
        once the cleaner has run, from the CLEANED file. The ML recommender's
        dataset-signal computation should use `cleaned_profile` (it reasons
        about the data the model will actually train on) but must keep using
        `target_column` / `identifier_columns` as detected on the ORIGINAL
        frame -- that split is already correct in your `ml_recommender.py`
        docstrings and must not change.
      * `row_count` / `column_count` are convenience accessors so no node
        ever writes `df.shape[0]` against a possibly-wrong dataframe again --
        they're pulled from `profile["shape"]` at context-build time and are
        the numbers every "N rows" string in the UI must trace back to.
    """

    request_id: str
    file_id: str
    original_file_path: str
    profile: dict[str, Any]
    row_count: int
    column_count: int

    target_column: Optional[str] = None
    problem_type: Optional[str] = None
    target_reasoning: str = ""
    possible_targets: list[dict[str, Any]] = field(default_factory=list)
    identifier_columns: list[str] = field(default_factory=list)

    cleaned_file_path: Optional[str] = None
    cleaned_profile: Optional[dict[str, Any]] = None
    viz_file_path: Optional[str] = None

    timings: list[StageTiming] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

    def assert_profile_matches(self, expected_rows: int, where: str) -> None:
        """Defensive check: call this at any node boundary that's ever been
        suspected of using a stale profile. Raises loudly instead of quietly
        reporting a wrong row count to the user.
        """
        if self.row_count != expected_rows:
            raise PipelineContextError(
                f"Stale profile detected at '{where}': context.row_count="
                f"{self.row_count} but the dataframe in hand has "
                f"{expected_rows} rows. A node is not using PipelineContext "
                "as the single source of truth."
            )

    @contextmanager
    def timed(self, stage: str):
        """Context manager: `with ctx.timed('profiling'): ...` records duration."""
        start = time.perf_counter()
        try:
            yield
        finally:
            elapsed = time.perf_counter() - start
            self.timings.append(StageTiming(stage=stage, seconds=round(elapsed, 4)))
            logger.info("Pipeline stage '%s' took %.4fs", stage, elapsed)

    def timings_as_dict(self) -> dict[str, float]:
        out = {t.stage: t.seconds for t in self.timings}
        out["total_time"] = round(sum(t.seconds for t in self.timings), 4)
        return out


def build_context(file_path: str, file_id: Optional[str] = None) -> PipelineContext:
    """Profile the uploaded file exactly once and return the shared context.

    Call this immediately after CSV validation succeeds, before target
    detection. Every subsequent node receives this same `PipelineContext`
    instance (or is passed the specific fields it needs, e.g.
    `ctx.profile`, `ctx.target_column`) -- never a freshly recomputed
    profile dict.

    Raises:
        PipelineContextError: if the file can't be profiled.
    """
    request_id = str(uuid.uuid4())
    resolved_file_id = file_id or request_id

    start = time.perf_counter()
    try:
        profile = profile_csv(file_path)
    except ProfilerError as exc:
        raise PipelineContextError(f"Could not build pipeline context: {exc}") from exc
    elapsed = round(time.perf_counter() - start, 4)

    row_count = int(profile["shape"]["rows"])
    column_count = int(profile["shape"]["columns"])

    ctx = PipelineContext(
        request_id=request_id,
        file_id=resolved_file_id,
        original_file_path=file_path,
        profile=profile,
        row_count=row_count,
        column_count=column_count,
    )
    ctx.timings.append(StageTiming(stage="profiling", seconds=elapsed))
    logger.info(
        "PipelineContext built: request_id=%s file_id=%s rows=%d columns=%d (%.4fs)",
        request_id, resolved_file_id, row_count, column_count, elapsed,
    )
    return ctx


def attach_target_detection(
    ctx: PipelineContext,
    target_column: Optional[str],
    problem_type: Optional[str],
    reasoning: str,
    possible_targets: list[dict[str, Any]],
    identifier_columns: list[str],
) -> None:
    """Record target-detection results onto the shared context (mutates in place).

    Target detection in `ml_recommender.detect_target_column` must be called
    exactly once, against `ctx.profile`'s underlying dataframe (the ORIGINAL
    upload) -- this matches the existing docstring contract in
    `ml_recommender.py` ("target detection has exactly one call site"). This
    function is that one call site's landing spot; nothing downstream should
    call `detect_target_column` again.
    """
    ctx.target_column = target_column
    ctx.problem_type = problem_type
    ctx.target_reasoning = reasoning
    ctx.possible_targets = possible_targets
    ctx.identifier_columns = identifier_columns


def attach_cleaned_profile(
    ctx: PipelineContext,
    cleaned_file_path: str,
    viz_file_path: str,
) -> None:
    """Profile the CLEANED file once, after the cleaner runs, and attach it.

    This is the ONLY other place `profile_csv` is called in the pipeline.
    `ctx.cleaned_profile` is what the quality scorer, before/after comparison,
    and the ML recommender's dataset-signal computation should read for
    post-cleaning numbers -- never a third ad-hoc `profile_csv()` call.
    """
    start = time.perf_counter()
    try:
        cleaned_profile = profile_csv(cleaned_file_path)
    except ProfilerError as exc:
        raise PipelineContextError(f"Could not profile cleaned file: {exc}") from exc
    elapsed = round(time.perf_counter() - start, 4)

    ctx.cleaned_file_path = cleaned_file_path
    ctx.viz_file_path = viz_file_path
    ctx.cleaned_profile = cleaned_profile
    ctx.timings.append(StageTiming(stage="cleaning_profile", seconds=elapsed))
    logger.info(
        "Cleaned profile attached: rows=%d columns=%d (%.4fs)",
        cleaned_profile["shape"]["rows"], cleaned_profile["shape"]["columns"], elapsed,
    )