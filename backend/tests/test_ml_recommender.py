"""Tests for ml_recommender: target detection + heuristic ranking (NO training)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.tools.profiler import profile_csv
from app.tools.ml_recommender import (
    detect_identifier_columns,
    detect_target_column,
    recommend_algorithms,
)


def test_detects_classification_target(classification_df):
    """A low-cardinality categorical/binary target is detected as classification."""
    target, reasoning, _possible = detect_target_column(classification_df)
    assert target == "churn"
    assert isinstance(reasoning, str) and reasoning


def test_detects_regression_target(regression_df):
    """A continuous high-cardinality numeric target is detected for regression."""
    target, _reasoning, _possible = detect_target_column(regression_df)
    assert target == "price"


def test_identifier_column_detected(classification_df):
    """The unique-string Customer_ID column is flagged as an identifier."""
    ids = detect_identifier_columns(classification_df, target_column="churn")
    assert "Customer_ID" in ids


def test_recommend_classification_ranking(write_csv, classification_df):
    """recommend_algorithms ranks classification models with plain-English reasons.

    Crucially -- no performance metrics (nothing is trained, CLAUDE.md §9).
    """
    path = write_csv(classification_df, "rec_cls")
    profile = profile_csv(path)
    target, reasoning, possible = detect_target_column(classification_df)
    ids = detect_identifier_columns(classification_df, target_column=target)

    rec = recommend_algorithms(
        path, profile, target, reasoning,
        identifier_columns=ids, possible_targets=possible,
    )

    assert rec["problem_type"] == "classification"
    assert rec["target_column"] == "churn"
    assert len(rec["ranked_models"]) >= 2
    for model in rec["ranked_models"]:
        assert "name" in model and "reason" in model
        # No accuracy/score/metric keys -- this is a heuristic recommender.
        assert not any(k in model for k in ("accuracy", "score", "f1", "auc"))
    assert rec["top_recommendation"] == rec["ranked_models"][0]["name"]
    assert "Customer_ID" in rec["excluded_columns"]


def test_recommend_regression_ranking(write_csv, regression_df):
    """A continuous target yields regression candidates."""
    path = write_csv(regression_df, "rec_reg")
    profile = profile_csv(path)
    target, reasoning, possible = detect_target_column(regression_df)

    rec = recommend_algorithms(path, profile, target, reasoning, possible_targets=possible)
    assert rec["problem_type"] == "regression"
    assert len(rec["ranked_models"]) >= 2


def test_no_target_recommends_clustering(write_csv, no_target_df):
    """A frame with no target-like column falls back to clustering suggestions."""
    path = write_csv(no_target_df, "rec_clu")
    profile = profile_csv(path)
    target, reasoning, possible = detect_target_column(no_target_df)

    rec = recommend_algorithms(path, profile, target, reasoning, possible_targets=possible)
    # No supervised target -> clustering/unknown branch, KMeans/DBSCAN candidates.
    assert rec["problem_type"] in ("clustering", "unknown")
    names = {m["name"] for m in rec["ranked_models"]}
    assert names & {"KMeans", "DBSCAN"}


def test_single_class_target_is_invalid(write_csv):
    """Known Bug 2 backstop: a single-class named target yields problem_type=invalid."""
    df = pd.DataFrame(
        {
            "age": np.arange(60, dtype=float),
            "income": (np.arange(60) * 100.0),
            "Target": [1] * 60,  # one class
        }
    )
    path = write_csv(df, "rec_inv")
    profile = profile_csv(path)
    target, reasoning, possible = detect_target_column(df)

    rec = recommend_algorithms(path, profile, target, reasoning, possible_targets=possible)
    assert rec["problem_type"] == "invalid"
    assert rec["ranked_models"] == []
    assert rec["top_recommendation"] is None
