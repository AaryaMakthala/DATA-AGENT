"""LLM provider fallback chain: Gemini -> Groq -> OpenRouter, one call at a time.

The router never calls providers in parallel. It tries Gemini first; if that
raises anything, it logs a specific reason and tries Groq; if that also fails,
it tries OpenRouter; if all three fail, it raises a single clear LLMRouterError
with every provider's failure reason attached.
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)

GEMINI_MODEL = "gemini-flash-latest"
GROQ_MODEL = "llama-3.3-70b-versatile"
OPENROUTER_MODEL = "openai/gpt-4o-mini"

_REQUEST_TIMEOUT_SECONDS = 30


class LLMRouterError(Exception):
    """Raised when every provider in the fallback chain fails."""


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
    """Tries Gemini, then Groq, then OpenRouter, returning the first success."""

    def __init__(self) -> None:
        self._providers = [
            ("Gemini", self._call_gemini),
            ("Groq", self._call_groq),
            ("OpenRouter", self._call_openrouter),
        ]

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

    def generate(self, prompt: str) -> str:
        """Generate a completion, falling back through providers in order.

        Raises:
            LLMRouterError: if Gemini, Groq, and OpenRouter all fail. The
                message includes every provider's failure reason.
        """
        failures: list[str] = []
        for name, call in self._providers:
            logger.info("LLM router: trying provider %s", name)
            try:
                result = call(prompt)
                logger.info("LLM router: %s succeeded", name)
                return result
            except Exception as exc:  # noqa: BLE001 -- any provider SDK exception must fall through
                reason = _classify_error(exc)
                next_provider = self._next_provider_name(name)
                if next_provider:
                    logger.warning("LLM router: %s failed: %s -> trying %s", name, reason, next_provider)
                else:
                    logger.warning("LLM router: %s failed: %s -> no providers left", name, reason)
                failures.append(f"{name}: {reason}")

        raise LLMRouterError(
            "All LLM providers failed. " + "; ".join(failures)
        )

    def _next_provider_name(self, current: str) -> str | None:
        names = [name for name, _ in self._providers]
        idx = names.index(current)
        return names[idx + 1] if idx + 1 < len(names) else None
