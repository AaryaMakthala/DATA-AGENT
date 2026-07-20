"""Structured logging setup shared across the backend."""

import logging
import sys
import time
from contextlib import contextmanager
from typing import Iterator

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_configured = False


def _configure_root_logger() -> None:
    """Configure the root logger once with a consistent stream handler."""
    global _configured
    if _configured:
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(handler)

    _configured = True


def get_logger(name: str) -> logging.Logger:
    """Return a configured logger for the given module name.

    Args:
        name: Typically `__name__` of the calling module.

    Returns:
        A `logging.Logger` instance writing structured, timestamped lines to stdout.
    """
    _configure_root_logger()
    return logging.getLogger(name)


@contextmanager
def log_duration(
    logger: logging.Logger,
    step: str,
    sink: "dict[str, float] | None" = None,
    key: "str | None" = None,
) -> Iterator[None]:
    """Time a block of work and log how long it took, in seconds.

    Emits `TIMING | <step> took N.NNNs` at INFO on normal exit, so the
    per-step cost of the upload/analysis flow is greppable in the logs
    (`grep TIMING`). If the block raises, it still logs the elapsed time
    with a `(failed)` marker before re-raising, so a slow step that also
    errors isn't invisible.

    Args:
        logger: The logger to emit the timing line on.
        step: Human-readable name of the step being timed.
        sink: Optional dict to record the elapsed seconds into, so callers
            (e.g. graph nodes persisting per-node timings into state) can
            capture the number instead of only logging it. Recorded only on
            successful completion, not when the block raises.
        key: Key to use when writing into `sink` (defaults to `step`).
    """
    start = time.perf_counter()
    try:
        yield
    except Exception:
        elapsed = time.perf_counter() - start
        logger.info("TIMING | %s took %.3fs (failed)", step, elapsed)
        raise
    else:
        elapsed = time.perf_counter() - start
        logger.info("TIMING | %s took %.3fs", step, elapsed)
        if sink is not None:
            sink[key or step] = round(elapsed, 4)
