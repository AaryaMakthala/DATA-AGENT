"""Tests for visualizer.generate_charts (real matplotlib rendering to disk)."""

from __future__ import annotations

import os

import numpy as np
import pandas as pd
import pytest

from app.tools.visualizer import VisualizerError, generate_charts


def test_charts_generated_and_exist_on_disk(write_csv, classification_df):
    """A mixed numeric/categorical frame produces chart metadata whose files exist.

    `generate_charts` returns a list of metadata dicts
    ({path, chart_type, title, description, ...}), not bare paths -- assert the
    contract and that each declared `path` is a real, non-empty PNG on disk.
    """
    # Drop the identifier so charts are meaningful (mirrors the cleaned frame).
    df = classification_df.drop(columns=["Customer_ID"]).fillna(0)
    path = write_csv(df, "charts")
    charts = generate_charts(path, "viztest")

    assert len(charts) >= 1
    for meta in charts:
        assert isinstance(meta, dict)
        for key in ("path", "chart_type", "title", "description"):
            assert key in meta, f"chart metadata missing '{key}': {meta!r}"
        p = meta["path"]
        assert os.path.exists(p)
        assert p.endswith(".png")
        assert os.path.getsize(p) > 0


def test_numeric_only_frame_produces_charts(write_csv, regression_df):
    """An all-numeric frame still yields histograms/heatmap without error."""
    path = write_csv(regression_df, "numviz")
    charts = generate_charts(path, "numviztest")
    assert len(charts) >= 1
    for meta in charts:
        assert isinstance(meta, dict)
        assert "path" in meta
        assert os.path.exists(meta["path"])


def test_unreadable_csv_raises(tmp_path):
    """A missing file surfaces as VisualizerError, not a bare crash."""
    with pytest.raises(VisualizerError):
        generate_charts(str(tmp_path / "nope.csv"), "missing")


def test_single_column_frame_does_not_crash(write_csv):
    """A degenerate one-column frame produces charts (or none) without raising."""
    df = pd.DataFrame({"only": np.arange(30, dtype=float)})
    path = write_csv(df, "single")
    paths = generate_charts(path, "singlecol")  # must not raise
    assert isinstance(paths, list)
