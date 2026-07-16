"""Tests for cleaner.clean_csv -- target protection, ID drop, encoding caps, etc."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.tools.cleaner import CleanerError, clean_csv


def _flat_plan():
    """A legacy flat-string plan (the pre-enrichment schema)."""
    return {
        "missing_values": {"salary": "median", "city": "mode"},
        "duplicates": "drop",
        "outliers": {"salary": "cap"},
        "encoding": {"city": "one_hot"},
        "notes": "flat form",
    }


def test_target_never_stripped_by_outlier_removal(write_csv):
    """Known Bug 1: the minority class must survive even when it reads as an outlier.

    A binary target with 94 zeros / 6 ones would lose its 6 minority rows to IQR
    outlier removal if the target weren't protected. After cleaning it must still
    have 2 classes.
    """
    n = 100
    df = pd.DataFrame(
        {
            "age": np.arange(n, dtype=float),
            "salary": (40000 + np.arange(n) * 10).astype(float),
            "Target": [0] * 94 + [1] * 6,
        }
    )
    path = write_csv(df, "binary")
    plan = {"outliers": {"Target": "remove"}, "duplicates": "keep"}

    cleaned_path, applied, _viz = clean_csv(path, plan, "t1", target_column="Target")
    res = pd.read_csv(cleaned_path)

    assert res["Target"].nunique() == 2
    assert applied["outliers"]["Target"] == "skipped - target column is preserved"


def test_identifier_columns_dropped(write_csv, classification_df):
    """Identifier columns are removed and recorded in the applied plan."""
    path = write_csv(classification_df, "ids")
    cleaned_path, applied, _viz = clean_csv(
        path, _flat_plan(), "t2", target_column="churn",
        identifier_columns=["Customer_ID"],
    )
    res = pd.read_csv(cleaned_path)

    assert "Customer_ID" not in res.columns
    assert "Customer_ID" in applied["dropped_columns"]


def test_missing_indicator_and_imputation(write_csv, classification_df):
    """Missing numeric cells get a `_missing` indicator and are median-imputed."""
    path = write_csv(classification_df, "impute")
    cleaned_path, _applied, _viz = clean_csv(
        path, _flat_plan(), "t3", target_column="churn",
        identifier_columns=["Customer_ID"],
    )
    res = pd.read_csv(cleaned_path)

    assert "salary_missing" in res.columns
    assert int(res["salary"].isna().sum()) == 0


def test_one_hot_encoding_applied(write_csv, classification_df):
    """A low-cardinality categorical column is one-hot encoded."""
    path = write_csv(classification_df, "onehot")
    cleaned_path, _applied, _viz = clean_csv(
        path, _flat_plan(), "t4", target_column="churn",
        identifier_columns=["Customer_ID"],
    )
    res = pd.read_csv(cleaned_path)

    city_dummies = [c for c in res.columns if c.startswith("city_")]
    assert len(city_dummies) >= 2
    assert "city" not in res.columns


def test_high_cardinality_not_encoded(write_csv):
    """A high-cardinality categorical column is NOT one-hot exploded."""
    n = 200
    df = pd.DataFrame(
        {
            "free_text": [f"unique_value_{i}" for i in range(n)],  # 100% unique
            "y": ([0, 1] * (n // 2)),
        }
    )
    path = write_csv(df, "highcard")
    plan = {"encoding": {"free_text": "one_hot"}, "duplicates": "keep"}

    cleaned_path, _applied, _viz = clean_csv(path, plan, "t5", target_column="y")
    res = pd.read_csv(cleaned_path)

    # No explosion into 200 dummy columns.
    assert res.shape[1] < 10


def test_duplicates_dropped(write_csv):
    """Duplicate rows are dropped when the plan says so."""
    base = pd.DataFrame({"a": [1.0, 2.0, 3.0], "y": [0, 1, 0]})
    df = pd.concat([base, base], ignore_index=True)  # every row duplicated once
    path = write_csv(df, "dups")
    plan = {"duplicates": "drop"}

    cleaned_path, _applied, _viz = clean_csv(path, plan, "t6", target_column="y")
    res = pd.read_csv(cleaned_path)
    assert len(res) == 3


def test_target_leakage_flagged(write_csv):
    """A feature almost perfectly correlated with the target is flagged, not dropped."""
    n = 120
    target = np.arange(n, dtype=float)
    df = pd.DataFrame(
        {
            "leaky": target * 2.0 + 0.0,  # perfectly correlated with target
            "noise": np.tile([1.0, 2.0, 3.0, 4.0], n // 4),
            "price": target,  # continuous target
        }
    )
    path = write_csv(df, "leak")
    plan = {"duplicates": "keep"}

    cleaned_path, applied, _viz = clean_csv(path, plan, "t7", target_column="price")
    res = pd.read_csv(cleaned_path)

    assert "leakage_warnings" in applied
    assert "leaky" in applied["leakage_warnings"]
    # Flagged, not removed.
    assert "leaky" in res.columns


def test_enriched_dict_plan_executes(write_csv, classification_df):
    """The enriched {action, reason, confidence} plan form executes like the flat form."""
    path = write_csv(classification_df, "enriched")
    plan = {
        "dataset_understanding": {"description": "churn data", "key_observations": ["binary target"]},
        "missing_values": {
            "salary": {"action": "median", "reason": "few gaps", "confidence": "high"},
            "city": {"action": "mode", "reason": "cat gap", "confidence": "medium"},
        },
        "duplicates": {"action": "drop", "reason": "no dups", "confidence": "high"},
        "outliers": {"salary": {"action": "cap", "reason": "one extreme", "confidence": "high"}},
        "encoding": {"city": {"action": "one_hot", "reason": "low card", "confidence": "high"}},
        "notes": "enriched",
    }
    cleaned_path, _applied, _viz = clean_csv(
        path, plan, "t8", target_column="churn",
        identifier_columns=["Customer_ID"],
    )
    res = pd.read_csv(cleaned_path)

    assert int(res["salary"].isna().sum()) == 0
    assert any(c.startswith("city_") for c in res.columns)
    assert res["churn"].nunique() == 2


def test_malformed_plan_skips_cleaning(write_csv, classification_df):
    """A raw_plan fallback (LLM returned non-JSON) doesn't crash -- steps are skipped."""
    path = write_csv(classification_df, "raw")
    cleaned_path, _applied, _viz = clean_csv(
        path, {"raw_plan": "the model said something unparseable"}, "t9",
        target_column="churn",
    )
    res = pd.read_csv(cleaned_path)
    # Nothing cleaned, but a valid CSV is still produced.
    assert len(res) == 120
