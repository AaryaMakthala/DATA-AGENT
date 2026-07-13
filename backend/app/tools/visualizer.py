"""Generates charts from the cleaned dataset (CLAUDE.md §8).

Rules, applied purely in Python/matplotlib/seaborn -- the LLM has no part in
chart generation:
- Categorical column -> bar chart of its value frequencies
- Numerical column -> histogram
- Two numerical columns -> scatter plot (for the most correlated pairs)
- Correlation matrix -> heatmap
"""

import matplotlib

matplotlib.use("Agg")  # noqa: E402 -- must run before importing pyplot; no display server available server-side

import itertools
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from app.tools.profiler import ProfilerError, load_dataframe
from app.utils.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Guardrails so a very wide dataset can't generate hundreds of chart files.
_MAX_BAR_CHARTS = 10
_MAX_HISTOGRAMS = 15
_MAX_SCATTER_PAIRS = 5
_MAX_BAR_CATEGORIES = 20  # categories shown per bar chart; beyond this the chart is unreadable and skipped


class VisualizerError(Exception):
    """Raised when charts cannot be generated for a dataset."""


def _bar_chart(df: pd.DataFrame, column: str, out_dir: Path, file_id: str) -> str | None:
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

    path = out_dir / f"{file_id}_bar_{_safe_name(column)}.png"
    fig.savefig(path)
    plt.close(fig)
    return str(path)


def _histogram(df: pd.DataFrame, column: str, out_dir: Path, file_id: str) -> str | None:
    """Histogram of a numerical column's distribution."""
    series = df[column].dropna()
    if series.empty:
        return None

    fig, ax = plt.subplots(figsize=(8, 5))
    sns.histplot(series, kde=True, ax=ax, color="steelblue")
    ax.set_title(f"Distribution of '{column}'")
    ax.set_xlabel(column)
    ax.set_ylabel("frequency")
    fig.tight_layout()

    path = out_dir / f"{file_id}_hist_{_safe_name(column)}.png"
    fig.savefig(path)
    plt.close(fig)
    return str(path)


def _scatter_plot(df: pd.DataFrame, col_x: str, col_y: str, out_dir: Path, file_id: str) -> str | None:
    """Scatter plot between two numerical columns."""
    pair_df = df[[col_x, col_y]].dropna()
    if pair_df.empty:
        return None

    fig, ax = plt.subplots(figsize=(8, 5))
    sns.scatterplot(data=pair_df, x=col_x, y=col_y, ax=ax, color="steelblue", alpha=0.7)
    ax.set_title(f"'{col_x}' vs '{col_y}'")
    fig.tight_layout()

    path = out_dir / f"{file_id}_scatter_{_safe_name(col_x)}_{_safe_name(col_y)}.png"
    fig.savefig(path)
    plt.close(fig)
    return str(path)


def _correlation_heatmap(df: pd.DataFrame, numeric_cols: list[str], out_dir: Path, file_id: str) -> str | None:
    """Heatmap of the pairwise correlation matrix for numeric columns."""
    if len(numeric_cols) < 2:
        return None

    corr = df[numeric_cols].corr()
    fig, ax = plt.subplots(figsize=(max(6, len(numeric_cols)), max(5, len(numeric_cols) * 0.8)))
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", center=0, ax=ax)
    ax.set_title("Correlation matrix")
    fig.tight_layout()

    path = out_dir / f"{file_id}_correlation_heatmap.png"
    fig.savefig(path)
    plt.close(fig)
    return str(path)


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


def generate_charts(file_path: str, file_id: str) -> list[str]:
    """Generate all charts for a (cleaned) dataset and save them to outputs/charts/.

    Args:
        file_path: Path to the CSV to visualize (the cleaned CSV, per the
            LangGraph node sequence in CLAUDE.md §5).
        file_id: Identifier used to name and namespace output chart files.

    Returns:
        A list of absolute paths (as strings) to the generated PNG chart files.

    Raises:
        VisualizerError: if the CSV cannot be loaded.
    """
    try:
        df = load_dataframe(file_path)
    except ProfilerError as exc:
        raise VisualizerError(f"Cannot visualize unreadable CSV: {exc}") from exc

    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    categorical_cols = df.select_dtypes(exclude="number").columns.tolist()

    out_dir = Config.CHARTS_FOLDER
    chart_paths: list[str] = []

    for column in categorical_cols[:_MAX_BAR_CHARTS]:
        path = _bar_chart(df, column, out_dir, file_id)
        if path:
            chart_paths.append(path)

    for column in numeric_cols[:_MAX_HISTOGRAMS]:
        path = _histogram(df, column, out_dir, file_id)
        if path:
            chart_paths.append(path)

    for col_x, col_y in _top_correlated_pairs(df, numeric_cols, _MAX_SCATTER_PAIRS):
        path = _scatter_plot(df, col_x, col_y, out_dir, file_id)
        if path:
            chart_paths.append(path)

    heatmap_path = _correlation_heatmap(df, numeric_cols, out_dir, file_id)
    if heatmap_path:
        chart_paths.append(heatmap_path)

    logger.info("Visualizer: generated %d chart(s) for file_id=%s", len(chart_paths), file_id)
    return chart_paths
