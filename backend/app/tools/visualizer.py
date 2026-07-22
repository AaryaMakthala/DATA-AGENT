"""Generates charts from the cleaned dataset (CLAUDE.md §8).

Rules, applied purely in Python/matplotlib/seaborn -- the LLM has no part in
chart generation:
- Categorical column -> bar chart of its value frequencies
- Numerical column -> histogram
- Two numerical columns -> scatter plot (for the most correlated pairs)
- Correlation matrix -> heatmap

CHANGED: every chart-producing helper now returns a metadata dict
(`{path, chart_type, title, description, interpretation}`) instead of a bare
path string, so the frontend can render a real title/description/
interpretation per chart (redesign brief §13) instead of the app guessing
titles from filenames after the fact. `path` remains the absolute filesystem
path exactly as before -- callers (routes.py, report_adapter.py) are
responsible for converting it to a `/charts/<filename>` URL, same as they
always were; this file still knows nothing about HTTP routing.
"""

import matplotlib

matplotlib.use("Agg")  # noqa: E402 -- must run before importing pyplot; no display server available server-side

import itertools
from pathlib import Path
from typing import Any, Optional

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from app.services import file_service
from app.tools.profiler import ProfilerError, load_dataframe
from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Guardrails so a very wide dataset can't generate hundreds of chart files.
_MAX_BAR_CHARTS = 10
_MAX_HISTOGRAMS = 15
_MAX_SCATTER_PAIRS = 5
_MAX_BAR_CATEGORIES = 20  # categories shown per bar chart; beyond this the chart is unreadable and skipped
_CARDINALITY_THRESHOLD = 15  # numeric columns with fewer unique values are treated as categorical
_SKEW_THRESHOLD = 0.5  # |mean - median| / std; above this, histogram uses log scale
_ID_UNIQUENESS_THRESHOLD = 0.95  # columns with uniqueness ratio above this are excluded from correlation


class VisualizerError(Exception):
    """Raised when charts cannot be generated for a dataset."""


def _bar_chart(df: pd.DataFrame, column: str, out_dir: Path, file_id: str, original_filename: str) -> Optional[dict[str, Any]]:
    """Bar chart of value frequencies for a categorical column."""
    counts = df[column].value_counts(dropna=True)
    if counts.empty:
        return None
    if counts.shape[0] > _MAX_BAR_CATEGORIES:
        logger.info(
            "Visualizer: skipping bar chart for '%s' (%d categories exceeds the %d-category readability cap)",
            column, counts.shape[0], _MAX_BAR_CATEGORIES,
        )
        return None

    fig, ax = plt.subplots(figsize=(8, 5))
    sns.barplot(x=counts.index.astype(str), y=counts.values, ax=ax, color="steelblue")
    ax.set_title(f"Frequency of '{column}'")
    ax.set_xlabel(column)
    ax.set_ylabel("count")
    plt.xticks(rotation=45, ha="right")
    fig.tight_layout()

    path = out_dir / file_service.build_artifact_filename(
        original_filename, f"bar_chart_{_safe_name(column)}", "png", out_dir, file_id
    )
    fig.savefig(path)
    plt.close(fig)

    top_value = str(counts.index[0])
    top_count = int(counts.iloc[0])
    top_share = top_count / int(counts.sum()) * 100 if counts.sum() else 0.0

    return {
        "path": str(path),
        "chart_type": "bar",
        "title": f"Frequency of '{column}'",
        "description": f"Count of each category in '{column}' ({int(counts.shape[0])} categories shown).",
        "interpretation": f"'{top_value}' is the most common value, appearing {top_count} times ({top_share:.1f}% of rows).",
    }


def _histogram(df: pd.DataFrame, column: str, out_dir: Path, file_id: str, original_filename: str) -> Optional[dict[str, Any]]:
    """Histogram of a numerical column's distribution."""
    series = df[column].dropna()
    if series.empty:
        return None

    # Detect skew: |mean - median| / std
    use_log = False
    skew_measure = None
    if series.std() > 0:
        skew_measure = abs(series.mean() - series.median()) / series.std()
        if skew_measure > _SKEW_THRESHOLD:
            use_log = True
            logger.info(
                "Visualizer: applying log scale to histogram for '%s' (skew measure %.2f > %.2f)",
                column, skew_measure, _SKEW_THRESHOLD,
            )

    fig, ax = plt.subplots(figsize=(8, 5))
    sns.histplot(series, kde=True, ax=ax, color="steelblue", log_scale=use_log)
    ax.set_title(f"Distribution of '{column}'")
    ax.set_xlabel(column)
    ax.set_ylabel("frequency")
    fig.tight_layout()

    path = out_dir / file_service.build_artifact_filename(
        original_filename, f"histogram_{_safe_name(column)}", "png", out_dir, file_id
    )
    fig.savefig(path)
    plt.close(fig)

    if use_log:
        interpretation = f"'{column}' is right-skewed (skew measure {skew_measure:.2f}), so this is shown on a log scale."
    elif skew_measure is not None:
        interpretation = f"'{column}' is roughly symmetric (skew measure {skew_measure:.2f})."
    else:
        interpretation = f"'{column}' has zero variance in the non-null values shown."

    return {
        "path": str(path),
        "chart_type": "histogram",
        "title": f"Distribution of '{column}'",
        "description": f"Distribution of '{column}' across all rows with a non-null value.",
        "interpretation": interpretation,
    }


def _scatter_plot(df: pd.DataFrame, col_x: str, col_y: str, out_dir: Path, file_id: str, original_filename: str) -> Optional[dict[str, Any]]:
    """Scatter plot between two numerical columns."""
    pair_df = df[[col_x, col_y]].dropna()
    if pair_df.empty:
        return None

    fig, ax = plt.subplots(figsize=(8, 5))
    sns.scatterplot(data=pair_df, x=col_x, y=col_y, ax=ax, color="steelblue", alpha=0.7)
    ax.set_title(f"'{col_x}' vs '{col_y}'")
    fig.tight_layout()

    path = out_dir / file_service.build_artifact_filename(
        original_filename, f"scatter_{_safe_name(col_x)}_vs_{_safe_name(col_y)}", "png", out_dir, file_id
    )
    fig.savefig(path)
    plt.close(fig)

    corr = pair_df[col_x].corr(pair_df[col_y])
    if pd.isna(corr):
        interpretation = f"Correlation between '{col_x}' and '{col_y}' could not be computed."
    else:
        strength = "strong" if abs(corr) > 0.5 else "moderate" if abs(corr) > 0.25 else "weak"
        direction = "positive" if corr > 0 else "negative"
        interpretation = f"A {strength} {direction} relationship (correlation {corr:.2f})."

    return {
        "path": str(path),
        "chart_type": "scatter",
        "title": f"'{col_x}' vs '{col_y}'",
        "description": f"Relationship between '{col_x}' and '{col_y}', the numeric pair with one of the strongest correlations in this dataset.",
        "interpretation": interpretation,
    }


def _correlation_heatmap(df: pd.DataFrame, numeric_cols: list[str], out_dir: Path, file_id: str, original_filename: str) -> Optional[dict[str, Any]]:
    """Heatmap of the pairwise correlation matrix for numeric columns."""
    if len(numeric_cols) < 2:
        return None

    # Filter out ID-like columns: near-unique values or sequential integers
    filtered_cols = []
    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            continue
        uniqueness_ratio = series.nunique() / len(series)
        if uniqueness_ratio > _ID_UNIQUENESS_THRESHOLD:
            logger.info(
                "Visualizer: excluding '%s' from correlation heatmap (uniqueness %.2f > %.2f, likely an ID)",
                col, uniqueness_ratio, _ID_UNIQUENESS_THRESHOLD,
            )
            continue
        filtered_cols.append(col)

    if len(filtered_cols) < 2:
        return None

    corr = df[filtered_cols].corr()
    fig, ax = plt.subplots(figsize=(max(6, len(filtered_cols)), max(5, len(filtered_cols) * 0.8)))
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", center=0, ax=ax)
    ax.set_title("Correlation matrix")
    fig.tight_layout()

    path = out_dir / file_service.build_artifact_filename(
        original_filename, "correlation_heatmap", "png", out_dir, file_id
    )
    fig.savefig(path)
    plt.close(fig)

    # Find the strongest off-diagonal pair for the interpretation string.
    best_pair, best_value = None, 0.0
    for i, a in enumerate(filtered_cols):
        for b in filtered_cols[i + 1:]:
            value = corr.loc[a, b]
            if pd.notna(value) and abs(value) > abs(best_value):
                best_value, best_pair = value, (a, b)

    if best_pair:
        interpretation = f"The strongest relationship is between '{best_pair[0]}' and '{best_pair[1]}' (correlation {best_value:.2f})."
    else:
        interpretation = "No strong pairwise correlations were found among these columns."

    return {
        "path": str(path),
        "chart_type": "heatmap",
        "title": "Correlation Matrix",
        "description": f"Pairwise correlation across {len(filtered_cols)} numeric columns.",
        "interpretation": interpretation,
    }


def _safe_name(column: str) -> str:
    """Sanitize a column name for use in a filename."""
    return "".join(c if c.isalnum() else "_" for c in column)[:50]


def _top_correlated_pairs(df: pd.DataFrame, numeric_cols: list[str], limit: int) -> list[tuple[str, str]]:
    """Return the `limit` numeric column pairs with the strongest absolute correlation."""
    if len(numeric_cols) < 2:
        return []
    corr = df[numeric_cols].corr().abs()
    pairs = []
    for col_a, col_b in itertools.combinations(numeric_cols, 2):
        value = corr.loc[col_a, col_b]
        if pd.notna(value):
            pairs.append((col_a, col_b, value))
    pairs.sort(key=lambda p: p[2], reverse=True)
    return [(a, b) for a, b, _ in pairs[:limit]]


def generate_charts(file_path: str, file_id: str, original_filename: str) -> list[dict[str, Any]]:
    """Generate all charts for a (cleaned) dataset and save them to outputs/charts/.

    Args:
        file_path: Path to the CSV to visualize (the cleaned CSV, per the
            LangGraph node sequence in CLAUDE.md §5).
        file_id: Identifier used to namespace output chart files (collision
            disambiguator only -- see file_service.build_artifact_filename).
        original_filename: The user's originally uploaded filename (resolved
            via file_service.resolve_original_filename by the caller), used
            to build human-readable chart filenames, e.g.
            "large-dataset_bar_chart_Country.png".

    Returns:
        A list of chart metadata dicts, each:
        `{"path": str, "chart_type": str, "title": str, "description": str,
        "interpretation": str}`. `path` is an absolute filesystem path (same
        as this function always returned before -- callers convert it to a
        `/charts/<filename>` URL, this function still knows nothing about
        HTTP routing).

    Raises:
        VisualizerError: if the CSV cannot be loaded.
    """
    try:
        df = load_dataframe(file_path)
    except ProfilerError as exc:
        raise VisualizerError(f"Cannot visualize unreadable CSV: {exc}") from exc

    # Classify columns: dtype + cardinality check
    # Numeric columns with low cardinality (≤ threshold) are routed to bar charts, not histograms/scatter/heatmap
    numeric_dtype_cols = df.select_dtypes(include="number").columns.tolist()
    categorical_cols = df.select_dtypes(exclude="number").columns.tolist()

    # Separate truly continuous numeric from low-cardinality numeric
    continuous_numeric_cols = []
    for col in numeric_dtype_cols:
        nunique = df[col].nunique()
        if nunique <= _CARDINALITY_THRESHOLD:
            logger.info(
                "Visualizer: treating numeric column '%s' as categorical (%d unique values ≤ %d)",
                col, nunique, _CARDINALITY_THRESHOLD,
            )
            categorical_cols.append(col)
        else:
            continuous_numeric_cols.append(col)

    out_dir = Config.CHARTS_FOLDER
    charts: list[dict[str, Any]] = []

    for column in categorical_cols[:_MAX_BAR_CHARTS]:
        chart = _bar_chart(df, column, out_dir, file_id, original_filename)
        if chart:
            charts.append(chart)

    for column in continuous_numeric_cols[:_MAX_HISTOGRAMS]:
        chart = _histogram(df, column, out_dir, file_id, original_filename)
        if chart:
            charts.append(chart)

    for col_x, col_y in _top_correlated_pairs(df, continuous_numeric_cols, _MAX_SCATTER_PAIRS):
        chart = _scatter_plot(df, col_x, col_y, out_dir, file_id, original_filename)
        if chart:
            charts.append(chart)

    heatmap = _correlation_heatmap(df, continuous_numeric_cols, out_dir, file_id, original_filename)
    if heatmap:
        charts.append(heatmap)

    logger.info("Visualizer: generated %d chart(s) for file_id=%s", len(charts), file_id)
    return charts