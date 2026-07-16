"""Structured API error type + handler (robustness spec, section 7).

FastAPI's default `HTTPException` serializes to `{"detail": "..."}`. The spec
wants a typed envelope -- `{"success": false, "error": {"type", "message"}}` --
so the frontend can branch on an error *category* (CSV vs cleaning vs model)
rather than string-matching a message.

`APIError` carries a machine-readable `error_type` alongside the HTTP status
and message. `api_error_handler` renders it as:

    {
      "success": false,
      "error": {"type": "CSV_ERROR", "message": "..."},
      "detail": "..."
    }

`detail` is duplicated as a plain string on purpose: the existing frontend
(`lib/api.ts`) reads `response.data.detail`, so keeping it means the richer
envelope is purely additive and breaks nothing.
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class APIError(Exception):
    """An API failure with a typed category, HTTP status, and message."""

    def __init__(self, status_code: int, error_type: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_type = error_type
        self.message = message


async def api_error_handler(_request: Request, exc: APIError) -> JSONResponse:
    """Render an APIError as the structured envelope (with back-compat `detail`)."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {"type": exc.error_type, "message": exc.message},
            "detail": exc.message,
        },
    )
