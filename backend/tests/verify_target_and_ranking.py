"""Standalone verification for the target-detection + algorithm-recommendation redesign.

Not a pytest suite (pytest isn't installed in this env) -- run directly:

    venv/Scripts/python.exe -m tests.verify_target_and_ranking

Covers the four brief test cases plus the identifier-filtering fixes. Exits
non-zero if any assertion fails so it can gate a commit.
"""

import sys
from pathlib import Path

import pandas as pd

# Allow running as `python tests/verify_target_and_ranking.py` too.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.tools.ml_recommender import (  # noqa: E402
    detect_identifier_columns,
    detect_target_column,
    recommend_algorithms,
)
from app.tools.profiler import profile_csv  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[1] / "test_fixtures"

_failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}" + (f" -- {detail}" if detail else ""))
    if not condition:
        _failures.append(label)


def _recommend(path: Path) -> dict:
    df = pd.read_csv(path)
    target, reasoning, possible = detect_target_column(df)
    identifiers = detect_identifier_columns(df, target)
    profile = profile_csv(str(path))
    return recommend_algorithms(str(path), profile, target, reasoning, identifiers, possible)


def test_1_employee() -> None:
    print("\nTest 1: Employee dataset -> target Salary, regression")
    path = FIXTURES / "employee_dataset.csv"
    df = pd.read_csv(path)
    target, reasoning, possible = detect_target_column(df)
    print(f"    detected target = {target!r}")
    print(f"    reasoning = {reasoning}")
    print(f"    possible_targets = {[(c['column'], c['confidence']) for c in possible]}")
    check("target is Salary", target == "Salary", f"got {target!r}")

    rec = _recommend(path)
    check("problem_type is regression", rec["problem_type"] == "regression", rec["problem_type"])
    check("City is NOT the target", rec["target_column"] != "City")
    check("EmployeeID excluded", "EmployeeID" in rec["excluded_columns"], str(rec["excluded_columns"]))
    check("Name excluded", "Name" in rec["excluded_columns"], str(rec["excluded_columns"]))
    top = rec["top_recommendation"]
    print(f"    top_recommendation = {top}")
    print(f"    ranked = {[(m['name'], m['confidence']) for m in rec['ranked_models']]}")
    check(
        "top regressor is Gradient Boosting (brief: small/medium favors it)",
        top == "Gradient Boosting Regressor",
        top,
    )
    check("reasoning never says 'last column'", "last column" not in rec["detection_reasoning"].lower())


def test_2_churn() -> None:
    print("\nTest 2: Customer churn dataset -> target Churn, classification")
    path = FIXTURES / "churn_dataset.csv"
    df = pd.read_csv(path)
    target, reasoning, _ = detect_target_column(df)
    print(f"    detected target = {target!r}")
    check("target is Churn", target == "Churn", f"got {target!r}")

    rec = _recommend(path)
    check("problem_type is classification", rec["problem_type"] == "classification", rec["problem_type"])
    check("CustomerID excluded", "CustomerID" in rec["excluded_columns"], str(rec["excluded_columns"]))
    print(f"    top_recommendation = {rec['top_recommendation']}")
    print(f"    ranked = {[(m['name'], m['confidence']) for m in rec['ranked_models']]}")


def test_3_house() -> None:
    print("\nTest 3: House price dataset -> target Price, regression")
    path = FIXTURES / "regression_dataset.csv"  # SquareFeet,Bedrooms,Age,Location,Price
    df = pd.read_csv(path)
    target, reasoning, _ = detect_target_column(df)
    print(f"    detected target = {target!r}")
    check("target is Price", target == "Price", f"got {target!r}")

    rec = _recommend(path)
    check("problem_type is regression", rec["problem_type"] == "regression", rec["problem_type"])
    print(f"    top_recommendation = {rec['top_recommendation']}")
    print(f"    ranked = {[(m['name'], m['confidence']) for m in rec['ranked_models']]}")
    check(
        "top regressor is Gradient Boosting (brief: small/medium favors it)",
        rec["top_recommendation"] == "Gradient Boosting Regressor",
        rec["top_recommendation"],
    )


def test_4_no_target() -> None:
    print("\nTest 4: No obvious target -> ranked candidates, no blind pick")
    path = FIXTURES / "no_target_with_department.csv"  # Name,Age,Department,RecordID
    df = pd.read_csv(path)
    target, reasoning, possible = detect_target_column(df)
    print(f"    detected target = {target!r}")
    print(f"    reasoning = {reasoning}")
    print(f"    possible_targets = {[(c['column'], c['type'], c['confidence']) for c in possible]}")

    rec = _recommend(path)
    # Either unsupervised (target None) OR a genuinely low-confidence pick, but
    # NEVER the identifier column and NEVER 'by convention'.
    check("RecordID is never chosen as target", rec["target_column"] != "RecordID", str(rec["target_column"]))
    check("RecordID excluded as identifier", "RecordID" in rec["excluded_columns"], str(rec["excluded_columns"]))
    check("candidate list is returned", isinstance(rec["possible_targets"], list))
    check("reasoning never says 'last column'", "last column" not in rec["detection_reasoning"].lower())


def test_ranking_varies_by_size() -> None:
    print("\nTest 5: Ranking is data-dependent (small favors simpler; RF not hard-wired to win)")
    small = _recommend(FIXTURES / "classification_dataset.csv")  # 100 rows
    small_top = small["top_recommendation"]
    print(f"    small (100 rows) top = {small_top}")
    print(f"    small ranked = {[(m['name'], m['confidence']) for m in small['ranked_models']]}")
    # Brief: small/medium tabular -> Gradient Boosting favored, and crucially
    # Random Forest is NOT hard-wired to win.
    check(
        "small set is NOT auto-won by Random Forest",
        small_top != "Random Forest",
        small_top,
    )
    check(
        "small/medium set favors Gradient Boosting (per brief)",
        small_top == "Gradient Boosting",
        small_top,
    )

    # Synthetic large categorical-heavy classification set: expect boosting on top.
    import numpy as np

    rng = np.random.RandomState(0)
    n = 60_000
    big = pd.DataFrame({
        "cat_a": rng.choice(list("ABCDE"), n),
        "cat_b": rng.choice(list("PQRST"), n),
        "cat_c": rng.choice(list("XYZ"), n),
        "cat_d": rng.choice(["red", "green", "blue"], n),
        "cat_e": rng.choice(["lo", "mid", "hi"], n),
        "num_1": rng.randn(n),
        "Target": rng.choice([0, 1], n),
    })
    big_path = FIXTURES / "_tmp_big_categorical.csv"
    big.to_csv(big_path, index=False)
    try:
        rec = _recommend(big_path)
        print(f"    large categorical (60k rows) top = {rec['top_recommendation']}")
        print(f"    large ranked = {[(m['name'], m['confidence']) for m in rec['ranked_models']]}")
        check(
            "large categorical-heavy set does NOT default to Random Forest",
            rec["top_recommendation"] != "Random Forest",
            rec["top_recommendation"],
        )
        check(
            "large categorical-heavy set favors a boosting model",
            rec["top_recommendation"] in {"CatBoost", "XGBoost", "LightGBM", "Gradient Boosting"},
            rec["top_recommendation"],
        )
    finally:
        big_path.unlink(missing_ok=True)


def main() -> int:
    print("=" * 70)
    print("Target detection + algorithm ranking verification")
    print("=" * 70)
    test_1_employee()
    test_2_churn()
    test_3_house()
    test_4_no_target()
    test_ranking_varies_by_size()

    print("\n" + "=" * 70)
    if _failures:
        print(f"RESULT: {len(_failures)} FAILURE(S): {_failures}")
        return 1
    print("RESULT: ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
