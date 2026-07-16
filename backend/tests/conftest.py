"""Shared pytest fixtures and helpers for the backend tool tests.

These tests exercise the real pandas/numpy/sklearn logic against small, purpose
-built CSVs written to a temp dir -- no LLM calls, no network, no fixtures baked
into the repo. Each helper writes a DataFrame to a unique CSV path under pytest's
`tmp_path` so tests never collide on disk.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest


@pytest.fixture
def write_csv(tmp_path):
    """Return a helper that writes a DataFrame to a uniquely-named CSV.

    Usage: ``path = write_csv(df, "name")`` -> absolute path string.
    """

    def _write(df: pd.DataFrame, name: str = "data") -> str:
        path = tmp_path / f"{name}.csv"
        df.to_csv(path, index=False)
        return str(path)

    return _write


@pytest.fixture
def classification_df() -> pd.DataFrame:
    """A small, clean-ish binary classification frame with an ID and a category.

    120 rows, imbalanced-but-modelable target (100/20), one identifier column,
    one categorical feature, two numeric features, a handful of missing salary
    cells, and one extreme salary outlier.
    """
    n = 120
    rng = np.arange(n)
    df = pd.DataFrame(
        {
            "Customer_ID": [f"C{i:05d}" for i in rng],
            "age": (30 + (rng % 25)).astype(float),
            "salary": (40000 + (rng % 30) * 1000).astype(float),
            "city": (["NY", "LA", "SF", "CHI"] * (n // 4)),
            "churn": [0] * 100 + [1] * 20,
        }
    )
    df.loc[0:4, "salary"] = np.nan
    df.loc[5, "salary"] = 5_000_000.0  # extreme outlier
    return df


@pytest.fixture
def regression_df() -> pd.DataFrame:
    """A continuous-target regression frame (high-cardinality numeric target)."""
    n = 150
    rng = np.arange(n)
    return pd.DataFrame(
        {
            "sqft": (500 + rng * 10).astype(float),
            "bedrooms": (1 + (rng % 5)).astype(float),
            "price": (100000 + rng * 1234.5).astype(float),  # continuous target
        }
    )


@pytest.fixture
def no_target_df() -> pd.DataFrame:
    """An unsupervised frame -- purely descriptive geo/time features, no target.

    Every column is a low-cardinality descriptive attribute (city/region/month)
    that the detector penalizes as a feature rather than a learnable target, so
    no column clears the target-confidence floor and the recommender falls back
    to clustering.
    """
    n = 100
    rng = np.arange(n)
    return pd.DataFrame(
        {
            "city": (["NY", "LA", "SF", "CHI", "BOS"] * (n // 5)),
            "region": (["north", "south", "east", "west"] * (n // 4)),
            "month": ((rng % 12) + 1).astype(float),
        }
    )
