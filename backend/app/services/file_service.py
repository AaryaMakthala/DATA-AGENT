"""
Filesystem utilities for uploaded datasets and generated analysis artifacts.
"""

from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)

_UPLOAD_CHUNK_BYTES = 1024 * 1024  # 1 MiB


class FileServiceError(Exception):
    """Raised when a file operation fails."""


class UploadTooLargeError(FileServiceError):
    """Raised when the uploaded file exceeds MAX_UPLOAD_BYTES."""


def save_upload(file: UploadFile) -> tuple[str, Path]:
    """
    Save an uploaded CSV to disk.

    Parameters
    ----------
    file:
        FastAPI UploadFile.

    Returns
    -------
    tuple[str, Path]
        Generated file_id and saved file path.

    Raises
    ------
    FileServiceError
    UploadTooLargeError
    """

    filename = file.filename or ""

    if not filename:
        raise FileServiceError("Uploaded file has no filename.")

    if Path(filename).suffix.lower() != ".csv":
        raise FileServiceError(
            f"Unsupported file '{filename}'. Only CSV files are accepted."
        )

    Config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

    file_id = uuid.uuid4().hex
    destination = Config.UPLOAD_FOLDER / f"{file_id}.csv"

    total_bytes = 0

    try:
        with destination.open("wb") as output:

            while True:
                chunk = file.file.read(_UPLOAD_CHUNK_BYTES)

                if not chunk:
                    break

                total_bytes += len(chunk)

                if total_bytes > Config.MAX_UPLOAD_BYTES:
                    raise UploadTooLargeError(
                        f"'{filename}' exceeds the maximum upload size "
                        f"({Config.MAX_UPLOAD_BYTES // (1024 * 1024)} MB)."
                    )

                output.write(chunk)

    except BaseException:
        destination.unlink(missing_ok=True)
        raise

    if total_bytes == 0:
        destination.unlink(missing_ok=True)
        raise FileServiceError(f"'{filename}' is empty.")

    logger.info(
        "Upload saved | file=%s id=%s size=%d bytes",
        filename,
        file_id,
        total_bytes,
    )

    return file_id, destination


def resolve_upload_path(file_id: str) -> Path:
    """
    Resolve an uploaded CSV path from its file_id.
    """
    path = Config.UPLOAD_FOLDER / f"{file_id}.csv"

    if not path.is_file():
        raise FileServiceError(
            f"No uploaded CSV exists for file_id='{file_id}'."
        )

    return path


def resolve_report_path(file_id: str) -> Path:
    """
    Return report JSON path.
    """
    return Config.REPORTS_FOLDER / f"{file_id}.json"


def resolve_cleaned_file_path(file_id: str) -> Path:
    """
    Resolve cleaned dataset path.
    """
    path = Config.CLEANED_FILES_FOLDER / f"{file_id}_cleaned.csv"

    if not path.is_file():
        raise FileServiceError(
            f"No cleaned CSV exists for file_id='{file_id}'. "
            "Run analysis first."
        )

    return path


def purge_expired_artifacts() -> int:
    """
    Delete expired artifacts.

    Files older than Config.ARTIFACT_RETENTION_HOURS are removed from
    uploads, reports, cleaned datasets, and chart folders.

    Returns
    -------
    int
        Number of deleted files.
    """

    retention = Config.ARTIFACT_RETENTION_HOURS

    if retention <= 0:
        logger.info("Artifact cleanup disabled.")
        return 0

    cutoff = time.time() - retention * 3600

    folders = (
        Config.UPLOAD_FOLDER,
        Config.CLEANED_FILES_FOLDER,
        Config.CHARTS_FOLDER,
        Config.REPORTS_FOLDER,
    )

    deleted = 0

    for folder in folders:

        if not folder.exists():
            continue

        for file in folder.iterdir():

            if not file.is_file():
                continue

            if file.name.startswith("."):
                continue

            try:
                if file.stat().st_mtime < cutoff:
                    file.unlink()
                    deleted += 1

            except OSError as exc:
                logger.warning(
                    "Failed deleting artifact '%s': %s",
                    file,
                    exc,
                )

    logger.info(
        "Artifact cleanup complete. Deleted %d expired files.",
        deleted,
    )

    return deleted