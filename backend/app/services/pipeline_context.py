"""Presentation-layer carrier object for the results dashboard.

WHAT THIS ACTUALLY IS (read this before assuming it's wired into the graph)
--------------------------------------------------------------------------
`PipelineContext` is a plain dataclass that bundles the fields the results
formatters (`overview.py`, `insights.py`, `before_after.py`) need to read off
a single object instead of juggling loose dicts. It is constructed AD HOC,
post-hoc, inside `app/services/report_adapter.py` -- once from the ORIGINAL
profile (for overview/insights) and once as a `before_ctx` pairing the
original and cleaned profiles (for before/after). See `report_adapter.py`.

WHAT IT IS NOT
--------------------------------------------------------------------------
It is NOT threaded through `agents/graph.py`. The graph runs on the plain
`AnalystState` TypedDict (`agents/state.py`) and each node calls
`profiler.profile_csv()` where it needs to (`profiler_node` for the original,
`ml_recommendation_node` for the cleaned profile it stores as
`cleaned_profile`). An earlier design profiled the file exactly once and
threaded a shared context through every node via `build_context()` /
`attach_cleaned_profile()`; that integration was never wired in and those
functions have been removed as dead code. If you want the single-profile
architecture, wire `PipelineContext` into `graph.py` deliberately -- don't
assume the helpers below already do it.

The `timed()` / `timings_as_dict()` helpers exist for per-stage timing but
are currently only exercised by `overview.py` reading `total_time` off a
freshly-built context (which has no recorded stages, so it reads 0.0).
Persisting real per-node timings is an open item (see CLAUDE.md).
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Optional

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
    """Carrier for the fields the results formatters read off one object.

    Built ad hoc inside `report_adapter.build_results_response` -- NOT threaded
    through the graph (see the module docstring). In practice:

      * `profile` is the ORIGINAL uploaded file's profile dict. `overview.py`
        and `insights.py` read this; `report_adapter` deliberately builds the
        overview context from the ORIGINAL profile so the "Upload Successful"
        banner and Dataset Overview show pre-cleaning row/column counts
        (Bug #1 fix -- do not switch this to the cleaned profile).
      * `cleaned_profile` is the CLEANED file's profile. `before_after.py`
        reads it to compute the real before/after comparison. `report_adapter`
        sets it on the `before_ctx` instance for that purpose.
      * `row_count` / `column_count` come from `profile["shape"]` at build
        time and are the numbers every "N rows" string in the UI traces to.
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