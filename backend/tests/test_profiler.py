"""Tests for profiler.profile_csv and its CSV-reading edge cases."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.tools.profiler import ProfilerError, profile_csv


def test_profile_shape_and_keys(write_csv, classification_df):
    """A normal CSV yields every documented top-level key and correct shape."""
    path = write_csv(classification_df, "cls")
    profile = profile_csv(path)

    expected_keys = {
        "shape",
        "columns",
        "missing_values",
        "missing_value_percentages",
        "duplicates",
        "numeric_summary",
        "categorical_summary",
        "datetime_columns",
        "outliers",
        "correlations",
    }
    assert expected_keys <= set(profile.keys())
    assert profile["shape"] == {"rows": 120, "columns": 5}


def test_missing_values_counts_and_percentages(write_csv, classification_df):
    """Missing values are counts; percentages are the additive companion key."""
    path = write_csv(classification_df, "miss")
    profile = profile_csv(path)

    # 5 NaNs were injected into salary in the fixture.
    assert profile["missing_values"]["salary"] == 5
    assert isinstance(profile["missing_values"]["salary"], int)
    assert profile["missing_value_percentages"]["salary"] == pytest.approx(5 / 120 * 100, abs=0.01)
    # Columns with no missing data are omitted entirely.
    assert "age" not in profile["missing_values"]


def test_outliers_detected_via_iqr(write_csv, classification_df):
    """The injected 5,000,000 salary is flagged as an IQR outlier."""
    path = write_csv(classification_df, "out")
    profile = profile_csv(path)

    assert "salary" in profile["outliers"]
    assert profile["outliers"]["salary"]["count"] >= 1


def test_duplicates_counted(write_csv):
    """Exact duplicate rows are counted."""
    base = pd.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})
    df = pd.concat([base, base.iloc[[0]]], ignore_index=True)  # one dup of row 0
    path = write_csv(df, "dups")
    profile = profile_csv(path)

    assert profile["duplicates"] == 1


def test_empty_file_raises(tmp_path):
    """A zero-byte file raises a clear ProfilerError, not a bare pandas error."""
    empty = tmp_path / "empty.csv"
    empty.write_text("")
    with pytest.raises(ProfilerError):
        profile_csv(str(empty))


def test_missing_file_raises():
    """A non-existent path raises ProfilerError."""
    with pytest.raises(ProfilerError):
        profile_csv("this_path_does_not_exist_12345.csv")


def test_latin1_encoding_fallback(tmp_path):
    """A latin-1-encoded CSV (non utf-8 bytes) is read via the fallback path."""
    path = tmp_path / "latin1.csv"
    # 0xE9 is 'é' in latin-1 but invalid as standalone utf-8.
    df = pd.DataFrame({"name": ["Café", "Zoé"], "n": [1, 2]})
    df.to_csv(path, index=False, encoding="latin-1")

    profile = profile_csv(str(path))
    assert profile["shape"]["rows"] == 2


def test_constant_column_excluded_from_correlations(write_csv):
    """A zero-variance numeric column must not appear in the correlation matrix."""
    n = 40
    df = pd.DataFrame(
        {
            "const": [7.0] * n,  # zero variance
            "x": np.arange(n, dtype=float),
            "y": np.arange(n, dtype=float) * 2,
        }
    )
    path = write_csv(df, "const")
    profile = profile_csv(path)

    corr = profile["correlations"]
    assert "const" not in corr
    # The varying columns still correlate.
    assert "x" in corr


def test_datetime_column_detected(write_csv):
    """An object column that parses as dates is summarized as a datetime column."""
    n = 30
    dates = pd.date_range("2020-01-01", periods=n, freq="D").astype(str)
    df = pd.DataFrame({"event_date": dates, "value": np.arange(n, dtype=float)})
    path = write_csv(df, "dates")
    profile = profile_csv(path)

    assert "event_date" in profile["datetime_columns"]
    # And it is NOT double-counted as a categorical.
    assert "event_date" not in profile["categorical_summary"]
