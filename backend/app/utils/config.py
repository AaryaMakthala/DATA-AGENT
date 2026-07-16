"""Application configuration loaded from environment variables (.env)."""

import os
from pathlib import Path

from dotenv import load_dotenv

# backend/ is the parent of app/, so .env lives at backend/.env
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=BACKEND_DIR / ".env")


class Config:
    """Central, read-only access point for environment-derived settings."""

    # LLM provider keys (fallback chain order: Gemini -> Groq -> OpenRouter)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")

    # Browser origins allowed to call the API (CORS). Comma-separated; in
    # production this MUST be your real frontend origin(s), never "*" -- a
    # wildcard combined with allow_credentials is both insecure and rejected by
    # browsers. Defaults to the local Next.js dev origin so nothing breaks in
    # development. Example prod value: "https://app.example.com".
    CORS_ALLOW_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ]

    # Per-client (per-IP) rate limiting for the two endpoints that trigger real
    # work and real LLM spend: /upload and /analyze. Implemented in-process with
    # the standard library (no extra dependency, per CLAUDE.md §2) as a sliding
    # window -- fine for the single-process, disk-backed deployment this app
    # targets. Set RATE_LIMIT_ENABLED=false to disable (e.g. behind a gateway
    # that already rate-limits).
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() not in ("false", "0", "no")
    # Window length in seconds and the max requests allowed per IP within it,
    # configured separately for each endpoint since /analyze is far more
    # expensive (an LLM round trip) than /upload.
    RATE_LIMIT_WINDOW_SECONDS: float = float(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
    RATE_LIMIT_UPLOAD_MAX: int = int(os.getenv("RATE_LIMIT_UPLOAD_MAX", "20"))
    RATE_LIMIT_ANALYZE_MAX: int = int(os.getenv("RATE_LIMIT_ANALYZE_MAX", "5"))

    # Largest upload accepted, in bytes. Enforced while streaming the body to
    # disk so an oversized (or unbounded) upload can't exhaust memory before it
    # is rejected. Default 100 MB; override with MAX_UPLOAD_MB.
    MAX_UPLOAD_BYTES: int = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024

    # How long generated artifacts (uploads, cleaned CSVs, chart PNGs, reports)
    # are kept before a startup sweep deletes them. Without this the folders
    # grow without bound -- every analysis leaves an upload, a cleaned file, a
    # viz snapshot, several PNGs, and a report on disk forever. 0 disables the
    # sweep. Default 24 hours; override with ARTIFACT_RETENTION_HOURS.
    ARTIFACT_RETENTION_HOURS: float = float(os.getenv("ARTIFACT_RETENTION_HOURS", "24"))

    # Folder configuration (relative to backend/ unless an absolute path is given)
    UPLOAD_FOLDER: Path = BACKEND_DIR / os.getenv("UPLOAD_FOLDER", "uploads")
    OUTPUT_FOLDER: Path = BACKEND_DIR / os.getenv("OUTPUT_FOLDER", "outputs")
    CLEANED_FILES_FOLDER: Path = OUTPUT_FOLDER / "cleaned_files"
    CHARTS_FOLDER: Path = OUTPUT_FOLDER / "charts"
    REPORTS_FOLDER: Path = OUTPUT_FOLDER / "reports"

    @classmethod
    def ensure_folders_exist(cls) -> None:
        """Create upload/output folders if they don't already exist."""
        for folder in (
            cls.UPLOAD_FOLDER,
            cls.OUTPUT_FOLDER,
            cls.CLEANED_FILES_FOLDER,
            cls.CHARTS_FOLDER,
            cls.REPORTS_FOLDER,
        ):
            folder.mkdir(parents=True, exist_ok=True)


Config.ensure_folders_exist()
