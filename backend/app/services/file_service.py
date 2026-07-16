"""Filesystem operations for uploaded CSVs and their generated artifacts."""

import time
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)


class FileServiceError(Exception):
    """Raised when an uploaded file is invalid or a file_id cannot be resolved."""


class UploadTooLargeError(FileServiceError):
    """Raised when an upload exceeds Config.MAX_UPLOAD_BYTES."""


# Size of each chunk read while streaming an upload to disk (1 MiB).
_UPLOAD_CHUNK_BYTES = 1024 * 1024


def save_upload(file: UploadFile) -> tuple[str, Path]:
    """Persist an uploaded CSV under a generated file_id and return both.

    The body is streamed to disk in fixed-size chunks with a running byte
    count, so an oversized upload is rejected as soon as it crosses
    `Config.MAX_UPLOAD_BYTES` instead of being buffered whole in memory first
    (a 500 MB upload would otherwise cost 500 MB of RAM before any size check).
    A rejected or empty upload leaves no partial file on disk.

    Args:
        file: The incoming multipart upload.

    Returns:
        (file_id, path) where path is where the file was written on disk.

    Raises:
        UploadTooLargeError: if the upload exceeds the configured size limit.
        FileServiceError: if the file is missing a name, isn't a .csv, or is empty.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise FileServiceError(f"Unsupported file type: '{file.filename}'. Only .csv files are accepted.")

    file_id = uuid.uuid4().hex
    dest = Config.UPLOAD_FOLDER / f"{file_id}.csv"

    total = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = file.file.read(_UPLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                total += len(chunk)
                if total > Config.MAX_UPLOAD_BYTES:
                    raise UploadTooLargeError(
                        f"Uploaded file '{file.filename}' exceeds the maximum allowed size of "
                        f"{Config.MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
                    )
                out.write(chunk)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise

    if total == 0:
        dest.unlink(missing_ok=True)
        raise FileServiceError(f"Uploaded file '{file.filename}' is empty.")

    logger.info("Saved upload '%s' as %s (%d bytes)", file.filename, dest.name, total)
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


def purge_expired_artifacts() -> int:
    """Delete artifacts older than `Config.ARTIFACT_RETENTION_HOURS`.

    Sweeps the uploads, cleaned-files, charts, and reports folders and removes
    any file whose modification time is older than the retention window. Every
    analysis leaves several files behind (an upload, a cleaned CSV, a viz
    snapshot, several chart PNGs, a report), so without a sweep these folders
    grow without bound. Run at startup; a retention of 0 disables it.

    Deletion failures are logged and skipped, never raised -- a locked or
    already-removed file must not stop the app from starting.

    Returns:
        The number of files deleted.
    """
    retention_hours = Config.ARTIFACT_RETENTION_HOURS
    if retention_hours <= 0:
        logger.info("Artifact retention disabled (ARTIFACT_RETENTION_HOURS=%s); skipping sweep", retention_hours)
        return 0

    cutoff = time.time() - retention_hours * 3600
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
        for entry in folder.iterdir():
            if not entry.is_file():
                continue
            # Never touch dotfiles like .gitkeep -- they keep the (otherwise
            # empty) output folders tracked in git and carry no analysis data.
            if entry.name.startswith("."):
                continue
            try:
                if entry.stat().st_mtime < cutoff:
                    entry.unlink()
                    deleted += 1
            except OSError as exc:
                logger.warning("Artifact sweep: could not remove %s: %s", entry, exc)

    logger.info(
        "Artifact sweep: removed %d file(s) older than %.1fh across %d folder(s)",
        deleted, retention_hours, len(folders),
    )
    return deleted
