"""Upload-time CSV validation, separate from the deep statistical profiling."""

from pathlib import Path

from app.tools.profiler import ProfilerError, load_dataframe
from app.utils.logger import get_logger

logger = get_logger(__name__)


class CSVServiceError(Exception):
    """Raised when an uploaded CSV fails a basic parseability check."""


def validate_and_preview(file_path: Path) -> dict[str, int]:
    """Confirm a CSV is parseable and return a quick row/column preview.

    Args:
        file_path: Path to the CSV on disk.

    Returns:
        {"rows": int, "columns": int}

    Raises:
        CSVServiceError: if the CSV cannot be parsed (empty, corrupted, encoding issues).
    """
    try:
        df = load_dataframe(str(file_path))
    except ProfilerError as exc:
        raise CSVServiceError(str(exc)) from exc

    return {"rows": int(df.shape[0]), "columns": int(df.shape[1])}
