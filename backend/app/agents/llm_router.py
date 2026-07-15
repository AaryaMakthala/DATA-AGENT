"""LLM provider fallback chain: Groq -> Gemini -> OpenRouter, one call at a time.

The router never calls providers in parallel. It tries Groq first; if that
raises anything (or exceeds a hard wall-clock timeout), it logs a specific
reason and tries Gemini; if that also fails, it tries OpenRouter; if all three
fail, it raises a single clear LLMRouterError with every provider's failure
reason attached.

Groq is primary (not Gemini as in the original CLAUDE.md spec) because the
Gemini free-tier daily quota is routinely exhausted in this deployment, and a
quota-exhausted Gemini call wastes ~2.5-3s failing over on *every* request
before reaching a working provider. Groq answers in ~1s, so trying it first
removes that fixed tax. Gemini stays in the chain as a fallback for when Groq
is unavailable.

Why the hard timeout matters: the provider SDKs run their *own* internal retry
loops that do not respect our `max_retries`/`timeout` kwargs in every failure
mode. In particular, `langchain_google_genai` honors the `retry_delay` a 429
response carries (e.g. "please retry in 56s") and sleeps/backs off inside
`llm.invoke()`, so a rate-limited Gemini key blocks the whole request for
~30-60s before falling through. To guarantee we fail over fast, every
provider call is run in a worker thread and abandoned with `_CALL_TIMEOUT`
seconds via `future.result(timeout=...)` -- the SDK cannot override that.
"""

import concurrent.futures
import time

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)

GEMINI_MODEL = "gemini-flash-latest"
GROQ_MODEL = "llama-3.3-70b-versatile"
OPENROUTER_MODEL = "openai/gpt-4o-mini"

# Passed to each SDK so it doesn't wait forever on a slow network socket.
_REQUEST_TIMEOUT_SECONDS = 30

# Hard wall-clock ceiling per provider, enforced by us (not the SDK). If a
# provider's .invoke() -- including any internal retry/backoff -- hasn't
# returned within this many seconds, we abandon it and move to the next
# provider. Slightly above _REQUEST_TIMEOUT_SECONDS so a genuinely slow-but-
# working call isn't cut off before the SDK's own socket timeout can fire.
_CALL_TIMEOUT = 40


class LLMRouterError(Exception):
    """Raised when every provider in the fallback chain fails."""


class LLMTimeoutError(Exception):
    """Raised when a single provider call exceeds the hard wall-clock timeout."""


def _classify_error(exc: Exception) -> str:
    """Turn a provider SDK exception into a short, human-readable reason.

    Matches on exception class name and message text rather than importing
    every provider's exception hierarchy, since Gemini (google-api-core),
    Groq, and OpenAI-compatible (OpenRouter) clients each raise different
    exception types for the same logical failure.
    """
    name = type(exc).__name__.lower()
    msg = str(exc).lower()

    key_indicators = (
        "api key not valid", "invalid api key", "api_key_invalid", "invalid_api_key",
        "unauthorized", "401", "permissiondenied", "unauthenticated", "authenticationerror",
    )
    if any(ind in msg for ind in key_indicators) or any(
        ind in name for ind in ("permissiondenied", "unauthenticated", "authenticationerror")
    ):
        return "invalid API key"

    rate_limit_indicators = ("rate limit", "429", "quota", "resourceexhausted")
    if any(ind in msg for ind in rate_limit_indicators) or "ratelimit" in name:
        return "rate limit / quota exceeded"

    timeout_indicators = ("timeout", "timed out", "deadlineexceeded")
    if any(ind in msg for ind in timeout_indicators) or "timeout" in name:
        return "request timed out"
    unavailable_indicators = ("not found", "unavailable", "does not exist")
    if any(ind in msg for ind in unavailable_indicators) or any(
        ind in name for ind in ("notfound", "serviceunavailable")
    ):
        return "model unavailable"

    connection_indicators = ("connection", "network", "dns", "unreachable")
    if any(ind in msg for ind in connection_indicators) or "connectionerror" in name:
        return "network error"

    return f"unexpected error ({type(exc).__name__}): {exc}"


class LLMRouter:
    """Tries Groq, then Gemini, then OpenRouter, returning the first success."""

    def __init__(self) -> None:
        self._providers = [
            ("Groq", self._call_groq),
            ("Gemini", self._call_gemini),
            ("OpenRouter", self._call_openrouter),
        ]
        # One shared pool for the blocking .invoke() calls. Daemon threads so a
        # provider call abandoned on timeout can't keep the process alive at
        # shutdown (Python can't forcibly kill the thread, but we stop waiting
        # on it and move to the next provider immediately).
        self._executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=2, thread_name_prefix="llm-provider"
        )

    def _call_gemini(self, prompt: str) -> str:
        if not Config.GEMINI_API_KEY:
            raise LLMRouterError("GEMINI_API_KEY is not set")
        llm = ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            google_api_key=Config.GEMINI_API_KEY,
            timeout=_REQUEST_TIMEOUT_SECONDS,
            max_retries=0,
        )
        return llm.invoke(prompt).content

    def _call_groq(self, prompt: str) -> str:
        if not Config.GROQ_API_KEY:
            raise LLMRouterError("GROQ_API_KEY is not set")
        llm = ChatGroq(
            model=GROQ_MODEL,
            api_key=Config.GROQ_API_KEY,
            timeout=_REQUEST_TIMEOUT_SECONDS,
            max_retries=0,
        )
        return llm.invoke(prompt).content

    def _call_openrouter(self, prompt: str) -> str:
        if not Config.OPENROUTER_API_KEY:
            raise LLMRouterError("OPENROUTER_API_KEY is not set")
        llm = ChatOpenAI(
            model=OPENROUTER_MODEL,
            api_key=Config.OPENROUTER_API_KEY,
            base_url="https://openrouter.ai/api/v1",
            timeout=_REQUEST_TIMEOUT_SECONDS,
            max_retries=0,
        )
        return llm.invoke(prompt).content

    def _call_with_hard_timeout(self, name: str, call, prompt: str) -> str:
        """Run a provider call in a worker thread, abandoning it after _CALL_TIMEOUT.

        The SDKs' internal retry/backoff loops can ignore their own timeout
        kwargs (a rate-limited Gemini call sleeps on the 429's retry_delay),
        so this is the only reliable ceiling on how long one provider can block
        the request. On timeout we raise LLMTimeoutError; the abandoned thread
        finishes in the background and its result is discarded.
        """
        future = self._executor.submit(call, prompt)
        try:
            return future.result(timeout=_CALL_TIMEOUT)
        except concurrent.futures.TimeoutError as exc:
            future.cancel()
            raise LLMTimeoutError(
                f"{name} did not respond within {_CALL_TIMEOUT}s (hard timeout)"
            ) from exc

    def generate(self, prompt: str) -> str:
        """Generate a completion, falling back through providers in order.

        Each provider gets at most _CALL_TIMEOUT seconds of wall-clock time
        before the router abandons it and tries the next one, so a slow or
        rate-limited provider can't hang the request.

        Raises:
            LLMRouterError: if Gemini, Groq, and OpenRouter all fail or time
                out. The message includes every provider's failure reason.
        """
        failures: list[str] = []
        for name, call in self._providers:
            logger.info("LLM router: attempting provider %s (hard timeout %ss)", name, _CALL_TIMEOUT)
            started = time.monotonic()
            try:
                result = self._call_with_hard_timeout(name, call, prompt)
                elapsed = time.monotonic() - started
                logger.info("LLM router: %s succeeded in %.1fs", name, elapsed)
                return result
            except Exception as exc:  # noqa: BLE001 -- any provider SDK exception must fall through
                elapsed = time.monotonic() - started
                reason = _classify_error(exc)
                next_provider = self._next_provider_name(name)
                if next_provider:
                    logger.warning(
                        "LLM router: %s failed after %.1fs: %s -> trying %s",
                        name, elapsed, reason, next_provider,
                    )
                else:
                    logger.warning(
                        "LLM router: %s failed after %.1fs: %s -> no providers left",
                        name, elapsed, reason,
                    )
                failures.append(f"{name}: {reason}")

        logger.error("LLM router: all providers failed: %s", "; ".join(failures))
        raise LLMRouterError(
            "All LLM providers failed. " + "; ".join(failures)
        )

    def _next_provider_name(self, current: str) -> str | None:
        names = [name for name, _ in self._providers]
        idx = names.index(current)
        return names[idx + 1] if idx + 1 < len(names) else None

