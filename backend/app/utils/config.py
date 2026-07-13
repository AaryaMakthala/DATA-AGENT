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
