"""
Filesystem utilities for uploaded datasets and generated analysis artifacts.
"""

from __future__ import annotations

import re
import time
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)

_UPLOAD_CHUNK_BYTES = 1024 * 1024  # 1 MiB

# A file_id is always a `uuid.uuid4().hex` string minted by `save_upload`
# (32 lowercase hex chars). This allowlist pattern accepts that and any other
# filename-safe token, while rejecting EVERYTHING that could escape an artifact
# folder: "/", "\", ".", "..", and any other path separator or metacharacter.
_VALID_FILE_ID = re.compile(r"^[A-Za-z0-9_-]+$")

# Used to sanitize an arbitrary (untrusted) uploaded filename into a safe base
# name for both the sidecar record and any artifact filename derived from it.
# Anything outside this set -- including "/", "\\", "..", whitespace -- is
# collapsed to "_", which also neutralizes path traversal.
_UNSAFE_NAME_CHARS = re.compile(r"[^A-Za-z0-9_-]+")


class FileServiceError(Exception):
    """Raised when a file operation fails."""


class UploadTooLargeError(FileServiceError):
    """Raised when the uploaded file exceeds MAX_UPLOAD_BYTES."""


class InvalidFileIdError(FileServiceError):
    """Raised when a file_id contains unsafe characters or path separators.

    Security: file_id arrives untrusted from URL path params and is
    interpolated into on-disk artifact paths. Without this guard,
    `../../../../etc/passwd` (or the Windows `..\\..\\` form) escapes the
    intended folder -- an arbitrary-read/write path-traversal vulnerability.
    """


def validate_file_id(file_id: str) -> str:
    """Return `file_id` unchanged if it is safe; otherwise raise.

    A safe file_id contains only letters, digits, underscore, and hyphen.
    Any "/", "\\", ".", "..", whitespace, or other path separator is rejected.
    """
    if not file_id or not _VALID_FILE_ID.fullmatch(file_id):
        raise InvalidFileIdError(
            "Invalid file_id: only letters, numbers, '_' and '-' are allowed "
            "(no path separators or '.')."
        )
    return file_id


def _sanitize_base_name(filename: str) -> str:
    """Strip any extension and collapse an untrusted filename to a safe base name.

    Whitespace and any character that isn't a letter/digit/underscore/hyphen
    (including "/", "\\", "." and "..") is replaced with "_", which both makes
    the result filesystem-safe and neutralizes path traversal. Falls back to
    "upload" if nothing safe survives (e.g. a filename that was pure emoji).
    """
    stem = Path(filename).stem.strip()
    sanitized = _UNSAFE_NAME_CHARS.sub("_", stem).strip("_")
    return sanitized or "upload"


def save_original_filename(file_id: str, filename: str) -> None:
    """Persist the sanitized original upload name in a small sidecar file.

    file_id remains the internal routing/lookup key everywhere; this sidecar
    only exists so downloadable artifacts can later be named after what the
    user actually uploaded instead of the internal uuid.
    """
    validate_file_id(file_id)
    Config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    sidecar = Config.UPLOAD_FOLDER / f"{file_id}.name.txt"
    sidecar.write_text(_sanitize_base_name(filename), encoding="utf-8")


def resolve_original_filename(file_id: str) -> str:
    """Read back the sanitized original upload name saved by `save_original_filename`.

    Falls back to `file_id` itself if the sidecar is missing -- e.g. an
    upload saved before this sidecar existed, or the file_id having no
    sidecar for some other benign reason. Never raises.
    """
    validate_file_id(file_id)
    sidecar = Config.UPLOAD_FOLDER / f"{file_id}.name.txt"
    try:
        name = sidecar.read_text(encoding="utf-8").strip()
    except OSError:
        return file_id
    return name or file_id


def build_artifact_filename(original_filename: str, suffix: str, extension: str, folder: Path, file_id: str) -> str:
    """Build a human-visible artifact filename from the original upload name.

    Returns `{sanitized_base}_{suffix}.{extension}`, e.g.
    `build_artifact_filename("large-dataset.csv", "cleaned", "csv", ...)` ->
    `"large-dataset_cleaned.csv"`. If a file with that exact name already
    exists in `folder` (a different run whose original upload sanitized to the
    same base name), a short disambiguator -- the first 6 chars of `file_id`
    -- is appended before the extension instead of silently overwriting:
    `"large-dataset_cleaned_a1b2c3.csv"`.
    """
    base = _sanitize_base_name(original_filename)
    candidate = f"{base}_{suffix}.{extension}"
    if not (folder / candidate).exists():
        return candidate
    return f"{base}_{suffix}_{file_id[:6]}.{extension}"


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

    save_original_filename(file_id, filename)

    return file_id, destination


def resolve_upload_path(file_id: str) -> Path:
    """
    Resolve an uploaded CSV path from its file_id.
    """
    validate_file_id(file_id)

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
    validate_file_id(file_id)

    return Config.REPORTS_FOLDER / f"{file_id}.json"


def resolve_cleaned_file_path(file_id: str) -> Path:
    """
    Resolve cleaned dataset path.
    """
    validate_file_id(file_id)

    path = Config.CLEANED_FILES_FOLDER / f"{file_id}_cleaned.csv"

    if not path.is_file():
        raise FileServiceError(
            f"No cleaned CSV exists for file_id='{file_id}'. "
            "Run analysis first."
        )

    return path


def chart_path_to_url(path: str) -> str:
    """
    Convert an absolute chart filesystem path (as returned by
    `app.tools.visualizer.generate_charts`, e.g.
    `/srv/app/outputs/charts/abc123_bar_Sex.png`) to its public `/charts/`
    URL (e.g. `/charts/abc123_bar_Sex.png`).

    NEW: single shared implementation. Previously `routes.py`'s
    `_charts_to_urls` and `report_adapter.py`'s chart-manifest builder each
    needed this exact conversion but only one of them actually had it --
    `report_adapter.py` was passing the raw filesystem path straight through
    to the frontend, which `safeResolveAssetUrl()` correctly rejected (it
    doesn't match the `/charts/` prefix allowlist), so chart titles rendered
    but the `<img>` never did. Putting the conversion here, once, and having
    both callers import it, makes that specific class of bug structurally
    impossible to reintroduce.

    Assumes chart files are served from a directory matching
    `Config.CHARTS_FOLDER` mounted at the `/charts` URL path (see main.py --
    verify a `StaticFiles(directory=str(Config.CHARTS_FOLDER))` mount exists
    at `/charts`; this function only builds the URL, it doesn't serve the
    file).
    """
    return f"/charts/{Path(path).name}"


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