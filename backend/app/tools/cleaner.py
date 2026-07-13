"""Executes the LLM-produced cleaning plan against the real dataset (CLAUDE.md §7).

The LLM never touches the data -- `cleaning_prompt.py` only asks it for a JSON
plan (which columns to impute, drop duplicates, cap/remove outliers, one-hot
encode). This module is what actually applies that plan to the DataFrame with
pandas and writes the cleaned CSV to disk.
"""

from pathlib import Path
from typing import Any

import pandas as pd

from app.tools.profiler import ProfilerError, load_dataframe
from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)

_VALID_MISSING_STRATEGIES = {"median", "mode", "drop"}
_VALID_OUTLIER_STRATEGIES = {"cap", "remove", "keep"}
_VALID_ENCODING_STRATEGIES = {"one_hot", "none"}


class CleanerError(Exception):
    """Raised when the cleaning plan cannot be applied to the dataset."""


def _apply_missing_values(df: pd.DataFrame, plan: dict[str, Any]) -> pd.DataFrame:
    """Impute or drop missing values per-column, following the LLM's plan."""
    for column, strategy in plan.items():
        if column not in df.columns:
            logger.warning("Cleaner: missing_values plan references unknown column '%s'; skipping", column)
            continue
        if strategy not in _VALID_MISSING_STRATEGIES:
            logger.warning(
                "Cleaner: unrecognized missing_values strategy '%s' for column '%s'; skipping", strategy, column
            )
            continue

        if strategy == "drop":
            before = len(df)
            df = df.dropna(subset=[column])
            logger.info("Cleaner: dropped %d rows with missing '%s'", before - len(df), column)
        elif strategy == "median":
            if pd.api.types.is_numeric_dtype(df[column]):
                df[column] = df[column].fillna(df[column].median())
            else:
                logger.warning(
                    "Cleaner: 'median' requested for non-numeric column '%s'; falling back to mode", column
                )
                mode = df[column].mode(dropna=True)
                if not mode.empty:
                    df[column] = df[column].fillna(mode.iloc[0])
        elif strategy == "mode":
            mode = df[column].mode(dropna=True)
            if not mode.empty:
                df[column] = df[column].fillna(mode.iloc[0])
    return df


def _apply_duplicates(df: pd.DataFrame, strategy: Any) -> pd.DataFrame:
    """Drop exact duplicate rows if the plan calls for it."""
    if not isinstance(strategy, str):
        return df
    if strategy == "drop":
        before = len(df)
        df = df.drop_duplicates()
        logger.info("Cleaner: dropped %d duplicate rows", before - len(df))
    elif strategy != "keep":
        logger.warning("Cleaner: unrecognized duplicates strategy '%s'; keeping duplicates", strategy)
    return df


def _apply_outliers(df: pd.DataFrame, plan: dict[str, Any]) -> pd.DataFrame:
    """Cap or remove IQR outliers per-column, following the LLM's plan."""
    for column, strategy in plan.items():
        if column not in df.columns:
            logger.warning("Cleaner: outliers plan references unknown column '%s'; skipping", column)
            continue
        if not pd.api.types.is_numeric_dtype(df[column]):
            logger.warning("Cleaner: outlier strategy requested for non-numeric column '%s'; skipping", column)
            continue
        if strategy not in _VALID_OUTLIER_STRATEGIES or strategy == "keep":
            continue

        series = df[column].dropna()
        if series.empty:
            continue
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr

        if strategy == "cap":
            df[column] = df[column].clip(lower=lower, upper=upper)
            logger.info("Cleaner: capped outliers in '%s' to [%.4f, %.4f]", column, lower, upper)
        elif strategy == "remove":
            before = len(df)
            df = df[df[column].isna() | df[column].between(lower, upper)]
            logger.info("Cleaner: removed %d outlier rows from '%s'", before - len(df), column)
    return df


def _apply_encoding(df: pd.DataFrame, plan: dict[str, Any]) -> pd.DataFrame:
    """One-hot encode the columns the plan flags for it."""
    columns_to_encode = []
    for column, strategy in plan.items():
        if column not in df.columns:
            logger.warning("Cleaner: encoding plan references unknown column '%s'; skipping", column)
            continue
        if strategy not in _VALID_ENCODING_STRATEGIES:
            logger.warning("Cleaner: unrecognized encoding strategy '%s' for column '%s'; skipping", strategy, column)
            continue
        if strategy == "one_hot":
            columns_to_encode.append(column)

    if columns_to_encode:
        df = pd.get_dummies(df, columns=columns_to_encode, dtype=int)
        logger.info("Cleaner: one-hot encoded columns: %s", columns_to_encode)
    return df


def clean_csv(file_path: str, cleaning_plan: Any, file_id: str) -> str:
    """Apply an LLM-produced cleaning plan to a CSV and save the cleaned result.

    Steps run in the order specified by CLAUDE.md §7: missing values, then
    duplicates, then outliers, then categorical encoding.

    Args:
        file_path: Path to the original uploaded CSV.
        cleaning_plan: Parsed JSON plan from the Cleaning Plan Node (see
            prompts/cleaning_prompt.py for the expected shape). May be
            malformed (e.g. a `{"raw_plan": ...}` fallback if the LLM didn't
            return valid JSON) -- handled gracefully by skipping steps that
            can't be understood rather than failing the whole pipeline.
        file_id: Identifier used to name the output file.

    Returns:
        Path (as a string) to the cleaned CSV under outputs/cleaned_files/.

    Raises:
        CleanerError: if the original CSV can't be loaded.
    """
    try:
        df = load_dataframe(file_path)
    except ProfilerError as exc:
        raise CleanerError(f"Cannot clean unreadable CSV: {exc}") from exc

    if not isinstance(cleaning_plan, dict) or "raw_plan" in cleaning_plan:
        logger.warning("Cleaner: cleaning plan is missing or malformed; no cleaning steps will be applied")
        cleaning_plan = {}

    missing_plan = cleaning_plan.get("missing_values")
    if isinstance(missing_plan, dict):
        df = _apply_missing_values(df, missing_plan)

    df = _apply_duplicates(df, cleaning_plan.get("duplicates", "keep"))

    outliers_plan = cleaning_plan.get("outliers")
    if isinstance(outliers_plan, dict):
        df = _apply_outliers(df, outliers_plan)

    encoding_plan = cleaning_plan.get("encoding")
    if isinstance(encoding_plan, dict):
        df = _apply_encoding(df, encoding_plan)

    output_path = Config.CLEANED_FILES_FOLDER / f"{file_id}_cleaned.csv"
    try:
        df.to_csv(output_path, index=False)
    except OSError as exc:
        raise CleanerError(f"Failed to write cleaned CSV to {output_path}: {exc}") from exc

    logger.info(
        "Cleaner: saved cleaned CSV to %s (%d rows, %d columns)", output_path.name, df.shape[0], df.shape[1]
    )
    return str(output_path)
