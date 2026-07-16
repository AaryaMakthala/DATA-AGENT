"""Tests for validator.validate_dataset gating logic."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.tools.validator import validate_dataset


def test_valid_modelable_dataset(classification_df):
    """A normal frame with a good target and features is valid, no errors."""
    result = validate_dataset(
        classification_df, target_column="churn",
        identifier_columns=["Customer_ID"],
    )
    assert result["valid"] is True
    assert result["errors"] == []


def test_single_class_target_is_invalid():
    """Known Bug 2: a single-class target must be rejected outright."""
    df = pd.DataFrame(
        {
            "age": np.arange(50, dtype=float),
            "Target": [1] * 50,  # one class only
        }
    )
    result = validate_dataset(df, target_column="Target")
    assert result["valid"] is False
    assert result["errors"]


def test_no_feature_columns_is_invalid():
    """A frame where every column is target-or-identifier has nothing to model."""
    df = pd.DataFrame(
        {
            "Customer_ID": [f"C{i}" for i in range(20)],
            "y": [0, 1] * 10,
        }
    )
    result = validate_dataset(df, target_column="y", identifier_columns=["Customer_ID"])
    assert result["valid"] is False
    assert result["errors"]


def test_high_duplicate_percentage_warns():
    """A dataset that is mostly duplicate rows raises a (non-blocking) warning."""
    row = pd.DataFrame({"a": [1.0], "b": [2.0], "y": [0]})
    other = pd.DataFrame({"a": [9.0], "b": [8.0], "y": [1]})
    # 30 identical rows + 2 distinct -> heavy duplication, still >=2 unique rows.
    df = pd.concat([row] * 30 + [other, pd.DataFrame({"a": [3.0], "b": [4.0], "y": [1]})],
                   ignore_index=True)
    result = validate_dataset(df, target_column="y")

    assert result["duplicate_percentage"] > 20.0
    assert any("duplicate" in w.lower() for w in result["warnings"])


def test_missing_target_warns_not_errors(no_target_df):
    """No detected target is a warning (exploratory mode), not an error."""
    result = validate_dataset(no_target_df, target_column=None)
    assert result["valid"] is True
    assert any("target" in w.lower() for w in result["warnings"])
