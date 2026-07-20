"""Presentation-layer regression tests for the results-UI polish pass.

These cover pure formatter helpers (no pipeline, no LLM, no disk):

1. before_after: the outlier row is labeled "Outliers Detected" and flagged
   `informational` so the UI renders it as a neutral re-measurement, not a
   red "cleaning made it worse" regression. The raw numbers are unchanged.
2. ml_presentation: regression model cards (names suffixed " Regressor")
   receive their OWN family profile/pros/cons, not empty data -- and never
   inherit Linear Regression's "Excellent interpretability".
3. cleaning_report: a column dropped by the high-missingness safeguard does
   NOT also emit a "dropped rows with missing values" timeline entry, and the
   drop is labeled generically ("Dropped column"), not "identifier column".
"""

from __future__ import annotations

from app.services.before_after import compute_before_after
from app.services.cleaning_report import build_cleaning_timeline
from app.services.ml_presentation import build_model_cards
from app.services.pipeline_context import PipelineContext


# --------------------------------------------------------------------------
# Fix 1: Before/After outlier presentation
# --------------------------------------------------------------------------

def _profile(rows: int, outliers: dict[str, int]) -> dict:
    return {
        "shape": {"rows": rows, "columns": 3},
        "columns": {"a": {}, "b": {}, "Target": {}},
        "duplicates": 0,
        "missing_values": {},
        "outliers": {col: {"count": n} for col, n in outliers.items()},
    }


def _ctx(before_profile: dict, after_profile: dict) -> PipelineContext:
    return PipelineContext(
        request_id="test-req",
        file_id="test-file",
        original_file_path="orig.csv",
        profile=before_profile,
        row_count=before_profile["shape"]["rows"],
        column_count=before_profile["shape"]["columns"],
        cleaned_profile=after_profile,
    )


def test_outlier_row_is_labeled_detected_and_informational():
    """Even when 'after' > 'before', the row is neutral, not a regression."""
    ctx = _ctx(_profile(100, {"a": 0}), _profile(90, {"a": 100}))
    result = compute_before_after(ctx, applied_plan={})
    outlier_rows = [r for r in result["table"] if r["metric"] == "Outliers Detected"]

    assert len(outlier_rows) == 1, "outlier row must be renamed 'Outliers Detected'"
    row = outlier_rows[0]
    assert row["informational"] is True, "outlier row must carry the informational flag"
    # Real numbers preserved -- no fake improvement invented.
    assert row["before"] == 0
    assert row["after"] == 100
    assert row["difference"] == "+100"
    # The old bare label must be gone.
    assert not any(r["metric"] == "Outliers" for r in result["table"])


def test_outlier_numbers_are_not_faked():
    """Titanic-like case: 386 -> 637 is preserved verbatim, still informational."""
    ctx = _ctx(_profile(891, {"Fare": 386}), _profile(712, {"Fare": 637}))
    row = next(r for r in compute_before_after(ctx, {})["table"] if r["metric"] == "Outliers Detected")
    assert row["before"] == 386
    assert row["after"] == 637
    assert row["difference"] == "+251"
    assert row["informational"] is True


# --------------------------------------------------------------------------
# Fix 2: ML model card metadata must match the model, not Linear Regression
# --------------------------------------------------------------------------

def test_regression_cards_get_their_own_profile_not_linear_regression():
    ranked = [
        {"name": "Gradient Boosting Regressor", "confidence": "High", "reason": "r1"},
        {"name": "XGBoost Regressor", "confidence": "Medium", "reason": "r2"},
        {"name": "Linear Regression", "confidence": "Low", "reason": "r3"},
    ]
    cards = {c["model_name"]: c for c in build_model_cards(ranked)}

    # Suffixed regression models must resolve to their family profile.
    gb = cards["Gradient Boosting Regressor"]
    assert gb["interpretability"] == "Medium"
    assert gb["advantages"], "Gradient Boosting Regressor must have its own advantages"
    assert "Highly interpretable coefficients" not in gb["advantages"], (
        "regression booster must NOT inherit Linear Regression's pros"
    )

    xgb = cards["XGBoost Regressor"]
    assert xgb["handles_missing"] == "Yes (native)"
    assert xgb["scalability"] == "Excellent"
    assert xgb["advantages"], "XGBoost Regressor must have its own advantages"

    # Linear Regression itself is unchanged (control).
    lr = cards["Linear Regression"]
    assert lr["interpretability"] == "Excellent"
    assert "Highly interpretable coefficients" in lr["advantages"]


def test_classification_cards_still_work_unsuffixed():
    ranked = [{"name": "XGBoost", "confidence": "High", "reason": "r"}]
    card = build_model_cards(ranked)[0]
    assert card["scalability"] == "Excellent"
    assert card["advantages"]


# --------------------------------------------------------------------------
# Fix 3: cleaning timeline must not contradict itself
# --------------------------------------------------------------------------

def test_dropped_column_does_not_also_show_row_drop():
    """The Titanic Cabin case: dropped as a column must not ALSO say
    'dropped rows with missing values for Cabin'."""
    applied_plan = {
        "dropped_columns": {
            "Cabin": "Column dropped instead of deleting rows: 77% missing.",
        },
        "missing_values": {
            # The LLM's original row-drop proposal survives in the plan even
            # though the safeguard converted it to a column drop.
            "Cabin": {"action": "drop", "reason": "too sparse"},
            "Age": {"action": "median", "reason": "fill with median"},
        },
    }
    timeline = build_cleaning_timeline(applied_plan)
    actions = [t["action"] for t in timeline]

    # Exactly one entry mentions Cabin, and it's the drop.
    cabin_entries = [a for a in actions if "Cabin" in a]
    assert cabin_entries == ["Dropped column 'Cabin'"], cabin_entries
    assert not any("missing values" in a and "Cabin" in a for a in actions)
    # Age still gets its normal imputation entry.
    assert any("Age" in a and "median" in a.lower() for a in actions)


def test_dropped_column_label_is_generic_not_identifier():
    """A missingness-driven column drop must not be mislabeled 'identifier'."""
    applied_plan = {
        "dropped_columns": {"Cabin": "77% missing, dropped to preserve rows."},
    }
    timeline = build_cleaning_timeline(applied_plan)
    assert timeline[0]["action"] == "Dropped column 'Cabin'"
    assert "identifier" not in timeline[0]["action"].lower()


# --------------------------------------------------------------------------
# Fix 4: one-hot-encoded columns are reported as encoded, never as removed
# --------------------------------------------------------------------------

def test_encoded_column_is_encoded_not_removed():
    """The Titanic Sex/Embarked case: a one-hot-encoded column vanishes from the
    cleaned profile (replaced by dummies), but must be reported under
    columns_encoded, NEVER as a removed column. The plan stores the action as a
    dict ({"action": "one_hot", ...}), which a bare == "one_hot" check missed."""
    before = {
        "shape": {"rows": 100, "columns": 2},
        "columns": {"Sex": {}, "Age": {}},
        "duplicates": 0, "missing_values": {}, "outliers": {},
    }
    after = {
        # Sex -> Sex_male/Sex_female; the literal "Sex" is gone.
        "shape": {"rows": 100, "columns": 3},
        "columns": {"Age": {}, "Sex_male": {}, "Sex_female": {}},
        "duplicates": 0, "missing_values": {}, "outliers": {},
    }
    ctx = _ctx(before, after)
    applied_plan = {
        "encoding": {"Sex": {"action": "one_hot", "reason": "2 unique values"}},
    }
    result = compute_before_after(ctx, applied_plan)

    assert result["columns_encoded"] == ["Sex"]
    assert "Sex" not in result["columns_removed"]
    assert result["columns_removed"] == []


def test_skipped_encode_is_not_counted_as_encoded():
    """A column the cleaner declined to one-hot encode (high cardinality) is
    rewritten to a skipped-label string, not "one_hot", so it must stay out of
    columns_encoded. It also never left the cleaned profile, so it isn't
    removed either."""
    before = {
        "shape": {"rows": 100, "columns": 2},
        "columns": {"Ticket": {}, "Age": {}},
        "duplicates": 0, "missing_values": {}, "outliers": {},
    }
    after = {
        "shape": {"rows": 100, "columns": 2},
        "columns": {"Ticket": {}, "Age": {}},
        "duplicates": 0, "missing_values": {}, "outliers": {},
    }
    ctx = _ctx(before, after)
    applied_plan = {
        "encoding": {"Ticket": "skipped - column left un-encoded (high cardinality)"},
    }
    result = compute_before_after(ctx, applied_plan)

    assert result["columns_encoded"] == []
    assert "Ticket" not in result["columns_removed"]


if __name__ == "__main__":
    import sys

    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"PASS: {t.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"FAIL: {t.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failures += 1
            print(f"ERROR: {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
