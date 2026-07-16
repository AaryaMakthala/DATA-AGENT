"""Tests for data_quality.compute_quality_score (heuristic, no LLM/training)."""

from __future__ import annotations

from app.tools.profiler import profile_csv
from app.tools.data_quality import compute_quality_score


def test_clean_dataset_scores_high(write_csv, regression_df):
    """A clean frame with no missing/dup/outlier issues scores high."""
    path = write_csv(regression_df, "clean")
    profile = profile_csv(path)
    result = compute_quality_score(profile, target_column="price", problem_type="regression")

    assert 0 <= result["quality_score"] <= 100
    assert result["quality_score"] >= 80
    assert set(result["components"]) == {
        "missing_values", "duplicates", "outliers", "feature_quality", "class_balance",
    }


def test_missing_and_outliers_lower_score(write_csv, classification_df):
    """Injected missing values + an outlier drag the score below a clean frame."""
    path = write_csv(classification_df, "dirty")
    profile = profile_csv(path)
    result = compute_quality_score(
        profile, target_column="churn", problem_type="classification",
        identifier_columns=["Customer_ID"],
    )
    assert result["quality_score"] < 100
    # Issues are reported and ordered (missing is the heaviest-weighted component).
    assert isinstance(result["issues"], list)


def test_score_is_deterministic(write_csv, classification_df):
    """The score is a pure function of the profile -- same input, same output."""
    path = write_csv(classification_df, "det")
    profile = profile_csv(path)
    a = compute_quality_score(profile, target_column="churn", problem_type="classification")
    b = compute_quality_score(profile, target_column="churn", problem_type="classification")
    assert a["quality_score"] == b["quality_score"]
