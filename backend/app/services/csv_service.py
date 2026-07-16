"""
CSV validation service.

Provides lightweight validation of uploaded CSV files before running the
full statistical profiler.
"""

from pathlib import Path

from app.tools.profiler import ProfilerError, load_dataframe
from app.utils.logger import get_logger

logger = get_logger(__name__)


class CSVServiceError(Exception):
    """Raised when CSV validation fails."""


def validate_and_preview(file_path: Path) -> dict[str, int]:
    """
    Validate that a CSV can be parsed and return a quick preview.

    Parameters
    ----------
    file_path:
        Path to the uploaded CSV.

    Returns
    -------
    dict
        {
            "rows": int,
            "columns": int
        }

    Raises
    ------
    CSVServiceError
        If parsing fails.
    """
    try:
        df = load_dataframe(str(file_path))

    except ProfilerError as exc:
        logger.warning("CSV validation failed: %s", exc)
        raise CSVServiceError(str(exc)) from exc

    except Exception as exc:
        logger.exception("Unexpected CSV validation error")
        raise CSVServiceError(
            "Unexpected error while reading CSV."
        ) from exc

    preview = {
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
    }

    logger.info(
        "CSV validated successfully (%d rows, %d columns)",
        preview["rows"],
        preview["columns"],
    )

    return preview