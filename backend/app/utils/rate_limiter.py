"""In-process, per-IP sliding-window rate limiter (standard library only).

CLAUDE.md §2 forbids adding tooling beyond the listed stack, so this avoids a
third-party limiter (slowapi/redis) and implements a minimal sliding window with
`collections.deque` and a `threading.Lock`. That is the right scope for this
app's deployment shape: a single Uvicorn process backed by local disk, not a
horizontally-scaled fleet that would need a shared store.

Scope and limitations (documented deliberately, not hidden):
  * State is per-process and in-memory. Behind multiple worker processes each
    worker keeps its own counters, so the effective limit is `max * workers`.
    For this single-process deployment that's a non-issue; if it's ever scaled
    out, move the window store to Redis. This is called out in the README/env
    notes rather than silently under-enforced.
  * The client key is the best available caller IP: the left-most entry of
    `X-Forwarded-For` when present (so it works behind a reverse proxy/CDN that
    sets it), otherwise the socket peer address. `X-Forwarded-For` is
    client-spoofable when the app is exposed directly, so in production this
    should sit behind a proxy you trust to set that header.
"""

import threading
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import Request

from app.utils.logger import get_logger

logger = get_logger(__name__)


class RateLimitExceeded(Exception):
    """Raised when a client exceeds its allowed request rate for an endpoint.

    Carries `retry_after` (whole seconds until the oldest in-window request
    ages out) so the caller can surface it as a `Retry-After` HTTP header.
    """

    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded; retry after {retry_after}s")


def client_ip(request: Request) -> str:
    """Return the best-effort client IP for rate-limit bucketing.

    Prefers the first hop in `X-Forwarded-For` (set by a trusted proxy in
    production) and falls back to the direct socket peer. Never raises -- an
    unresolvable client collapses to the literal "unknown" bucket so a weird
    request is still limited rather than slipping through unbucketed.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


class SlidingWindowRateLimiter:
    """Fixed-cap sliding-window limiter keyed by (bucket, client) pair.

    One instance can serve several endpoints: pass a distinct `bucket` per
    endpoint so /upload and /analyze counts never share a window. Thread-safe --
    Uvicorn runs request handlers across a thread pool, so the deque mutations
    are guarded by a single lock (contention is negligible at these rates).
    """

    def __init__(self, window_seconds: float) -> None:
        self._window = window_seconds
        self._lock = threading.Lock()
        # (bucket, client_key) -> deque of monotonic request timestamps, oldest
        # first. Only timestamps inside the current window are retained.
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def check(self, bucket: str, client_key: str, max_requests: int) -> None:
        """Record one request and raise if it exceeds `max_requests` in the window.

        Args:
            bucket: Endpoint identifier (e.g. "upload", "analyze").
            client_key: Per-client key, typically the caller IP.
            max_requests: Max requests allowed for this bucket within the window.

        Raises:
            RateLimitExceeded: if this request would exceed the cap. The request
                is NOT recorded when rejected, so a client hammering the
                endpoint can't keep pushing the window forward and lock itself
                out indefinitely -- it simply waits for the oldest hit to expire.
        """
        if max_requests <= 0:
            # A non-positive cap means "closed"; reject everything with a
            # full-window retry hint rather than dividing by zero below.
            raise RateLimitExceeded(retry_after=max(1, int(self._window)))

        now = time.monotonic()
        cutoff = now - self._window
        key = (bucket, client_key)

        with self._lock:
            timestamps = self._hits[key]
            # Evict everything that has aged out of the window.
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()

            if len(timestamps) >= max_requests:
                # Oldest in-window hit dictates when a slot frees up.
                retry_after = max(1, int(self._window - (now - timestamps[0])) + 1)
                logger.warning(
                    "Rate limit hit: bucket=%s client=%s (%d/%d in %.0fs window); retry_after=%ds",
                    bucket, client_key, len(timestamps), max_requests, self._window, retry_after,
                )
                raise RateLimitExceeded(retry_after=retry_after)

            timestamps.append(now)

    def prune(self, before: Optional[float] = None) -> int:
        """Drop empty/expired buckets so memory doesn't grow with unique IPs.

        Without this, every distinct client key keeps an (eventually empty)
        deque forever. Call periodically. Returns the number of keys removed.
        """
        cutoff = (before if before is not None else time.monotonic()) - self._window
        removed = 0
        with self._lock:
            for key in list(self._hits.keys()):
                timestamps = self._hits[key]
                while timestamps and timestamps[0] <= cutoff:
                    timestamps.popleft()
                if not timestamps:
                    del self._hits[key]
                    removed += 1
        return removed
