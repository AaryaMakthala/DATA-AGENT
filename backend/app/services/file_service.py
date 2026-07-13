"""Filesystem operations for uploaded CSVs and their generated artifacts."""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)


class FileServiceError(Exception):
    """Raised when an uploaded file is invalid or a file_id cannot be resolved."""


def save_upload(file: UploadFile) -> tuple[str, Path]:
    """Persist an uploaded CSV under a generated file_id and return both.

    Args:
        file: The incoming multipart upload.

    Returns:
        (file_id, path) where path is where the file was written on disk.

    Raises:
        FileServiceError: if the file is missing a name, isn't a .csv, or is empty.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise FileServiceError(f"Unsupported file type: '{file.filename}'. Only .csv files are accepted.")

    content = file.file.read()
    if not content:
        raise FileServiceError(f"Uploaded file '{file.filename}' is empty.")

    file_id = uuid.uuid4().hex
    dest = Config.UPLOAD_FOLDER / f"{file_id}.csv"
    dest.write_bytes(content)
    logger.info("Saved upload '%s' as %s", file.filename, dest.name)
    return file_id, dest


def resolve_upload_path(file_id: str) -> Path:
    """Return the on-disk path for a previously uploaded file_id.

    Raises:
        FileServiceError: if no file exists for that file_id.
    """
    path = Config.UPLOAD_FOLDER / f"{file_id}.csv"
    if not path.exists():
        raise FileServiceError(f"No uploaded file found for file_id='{file_id}'.")
    return path


def resolve_report_path(file_id: str) -> Path:
    """Return the path where analysis results for a file_id are/will be stored."""
    return Config.REPORTS_FOLDER / f"{file_id}.json"


def resolve_cleaned_file_path(file_id: str) -> Path:
    """Return the on-disk path for a previously cleaned file_id's output CSV.

    Raises:
        FileServiceError: if no cleaned file exists for that file_id.
    """
    path = Config.CLEANED_FILES_FOLDER / f"{file_id}_cleaned.csv"
    if not path.exists():
        raise FileServiceError(f"No cleaned file found for file_id='{file_id}'. Run /analyze first.")
    return path
