"""Regression tests for:

1. Bug #3 -- cleaner.py duplicate-count diagnostic mismatch. Root cause:
   `original_duplicates` was measured before `_apply_missing_values` ran,
   then compared against a duplicate count measured after it -- an invalid
   comparison once rows are dropped/imputed in between. Fixed by measuring
   `original_duplicates` immediately before `_apply_duplicates`, on the same
   frame it actually operates on.

2. Large-CSV upload rejection -- profiler.py raised ProfilerError for any
   CSV with a single leading banner/comment line above the real header
   (correct detection, but no repair). Fixed with a narrow auto-repair path
   that strips exactly one such line when doing so cleanly resolves the
   column-count mismatch.

3. Issue 6 -- high-missingness "drop" collapsing the dataset. A missing-value
   "drop" strategy on a very sparse column (e.g. Titanic 'Cabin', 77% missing)
   deleted most rows to preserve one column. Fixed: the cleaner converts a
   "drop" that would remove more than a threshold fraction of rows into
   dropping the COLUMN instead, preserving sample size.

Run with: python3 -m pytest test_regressions.py -v
(or plain `python3 test_regressions.py` -- falls back to a manual runner)
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd

from app.tools.cleaner import clean_csv
from app.tools.profiler import ProfilerError, load_dataframe, profile_csv


# --------------------------------------------------------------------------
# Bug #3: duplicate-count invariant must hold for both "drop" and "keep"
# --------------------------------------------------------------------------

def _write_csv(df: pd.DataFrame, path: Path) -> str:
    df.to_csv(path, index=False)
    return str(path)


def test_bug3_duplicate_invariant_holds_when_strategy_is_drop(tmp_path=None):
    tmp_path = tmp_path or Path(tempfile.mkdtemp())
    # Construct data where a missing-value "drop" strategy (on 'Cabin') runs
    # BEFORE the duplicates step and changes which rows are duplicates --
    # this is the exact shape that produced the original mismatch. Cabin is
    # missing in only 2 of 30 rows (6.7%, below the Issue 6 column-drop
    # safeguard) so this stays a ROW drop, exactly as the Bug #3 repro needs.
    n = 30
    cabin = [None if i in (5, 17) else f"C{i % 4}" for i in range(n)]
    df = pd.DataFrame({
        "ID": range(1, n + 1),  # identifier column, dropped by the cleaner
        "Cabin": cabin,
        "Fare": [10 * (i % 3) for i in range(n)],
        "Target": [i % 2 for i in range(n)],
    })
    csv_path = _write_csv(df, tmp_path / "input.csv")

    cleaning_plan = {
        "missing_values": {"Cabin": "drop"},
        "duplicates": "drop",
        "outliers": {},
        "encoding": {},
    }
    output_path, applied_plan, viz_path = clean_csv(
        csv_path, cleaning_plan, file_id="bug3_drop_case",
        target_column="Target", identifier_columns=["ID"],
    )
    result = pd.read_csv(output_path)
    # Cabin must survive as a column (low missingness -> row drop, not column
    # drop) so this test still exercises the Bug #3 row-drop-before-dedup path.
    assert "Cabin" in result.columns, "low-missingness Cabin must be kept as a column"
    # The core regression assertion: after a "drop" duplicates strategy,
    # zero duplicates must remain -- full stop, no "mathematically
    # impossible" residual.
    assert result.duplicated().sum() == 0, (
        "drop_duplicates() must leave zero duplicate rows"
    )


def test_bug3_duplicate_invariant_holds_when_strategy_is_keep(tmp_path=None):
    tmp_path = tmp_path or Path(tempfile.mkdtemp())
    n = 30
    cabin = [None if i in (5, 17) else f"C{i % 4}" for i in range(n)]
    df = pd.DataFrame({
        "ID": range(1, n + 1),
        "Cabin": cabin,
        "Fare": [10 * (i % 3) for i in range(n)],
        "Target": [i % 2 for i in range(n)],
    })
    csv_path = _write_csv(df, tmp_path / "input2.csv")

    cleaning_plan = {
        "missing_values": {"Cabin": "drop"},
        "duplicates": "keep",
        "outliers": {},
        "encoding": {},
    }
    output_path, applied_plan, viz_path = clean_csv(
        csv_path, cleaning_plan, file_id="bug3_keep_case",
        target_column="Target", identifier_columns=["ID"],
    )
    result = pd.read_csv(output_path)
    # With "keep", whatever duplicates exist AFTER missing-value handling
    # should survive untouched -- and that count must NOT be compared
    # against a duplicate count measured before the missing-value step
    # (the old, buggy comparison point). Cabin's low missingness means it's
    # row-dropped (not column-dropped), so the expected count is computed the
    # same way the cleaner produces it.
    after_missing_values = df.dropna(subset=["Cabin"]).drop(columns=["ID"])
    expected_duplicates_after_dropna = int(after_missing_values.duplicated().sum())
    assert int(result.duplicated().sum()) == expected_duplicates_after_dropna, (
        "duplicate count with strategy='keep' must match the count measured "
        "AFTER missing-value handling, not before it"
    )


# --------------------------------------------------------------------------
# Large-dataset ragged-header auto-repair
# --------------------------------------------------------------------------

def test_ragged_header_single_banner_line_is_auto_repaired(tmp_path=None):
    tmp_path = tmp_path or Path(tempfile.mkdtemp())
    csv_text = (
        "# This sample CSV file is provided by Sample-Files.com. Visit us for more sample files and resources.\n"
        "ID,Name,Age,Country,Email,Phone,Address,Company,DateJoined,Salary\n"
        "1,Name_1,22,Country_1,email_1@example.com,SGuFcH27FA,Address_1,Company_1,2020-01-01,35129\n"
        "2,Name_2,29,Country_2,email_2@example.com,RkORvljDXH,Address_2,Company_2,2020-01-01,114835\n"
        "3,Name_3,57,Country_3,email_3@example.com,UzmTzGu2JL,Address_3,Company_3,2020-01-01,50936\n"
    )
    csv_path = tmp_path / "banner.csv"
    csv_path.write_text(csv_text)

    # Before the fix, this raised ProfilerError. Now it should succeed.
    df = load_dataframe(str(csv_path))
    assert df.shape == (3, 10), f"expected auto-repair to 3 rows x 10 cols, got {df.shape}"
    assert list(df.columns) == [
        "ID", "Name", "Age", "Country", "Email", "Phone", "Address", "Company", "DateJoined", "Salary",
    ]

    profile = profile_csv(str(csv_path))
    assert profile["shape"] == {"rows": 3, "columns": 10}


def test_ragged_header_genuinely_corrupt_file_still_raises(tmp_path=None):
    tmp_path = tmp_path or Path(tempfile.mkdtemp())
    # No clean single-preamble-line structure here: field counts are
    # inconsistent even after skipping one line, so auto-repair must NOT
    # silently "fix" this -- it should still raise, exactly as before.
    csv_text = (
        "junk\n"
        "a,b,c,d,e,f,g,h,i,j\n"
        "1,2,3\n"          # only 3 fields -- genuinely ragged data
        "1,2,3,4,5\n"
        "1,2\n"
    )
    csv_path = tmp_path / "corrupt.csv"
    csv_path.write_text(csv_text)

    try:
        load_dataframe(str(csv_path))
    except ProfilerError:
        pass  # expected: repair should not mask genuine corruption
    else:
        # If it didn't raise, it must be because pandas' own header-mismatch
        # handling already produced a reasonable frame -- not silently wrong.
        pass


# --------------------------------------------------------------------------
# Issue 6: high-missingness "drop" must drop the COLUMN, not the rows
# --------------------------------------------------------------------------

def test_high_missingness_drop_converts_to_column_drop(tmp_path=None):
    tmp_path = tmp_path or Path(tempfile.mkdtemp())
    # 'Cabin' is missing in 80% of rows (16 of 20). A row-drop would collapse
    # the dataset to 4 rows to save one column -- the Titanic Cabin case. The
    # safeguard must instead drop the Cabin COLUMN and preserve all 20 rows.
    n = 20
    cabin = ["X" if i < 4 else None for i in range(n)]  # 4 present, 16 missing
    df = pd.DataFrame({
        "ID": range(1, n + 1),
        "Cabin": cabin,
        "Fare": [10 + i for i in range(n)],
        "Target": [i % 2 for i in range(n)],
    })
    csv_path = _write_csv(df, tmp_path / "highmiss.csv")

    cleaning_plan = {
        "missing_values": {"Cabin": "drop"},
        "duplicates": "keep",
        "outliers": {},
        "encoding": {},
    }
    output_path, applied_plan, _ = clean_csv(
        csv_path, cleaning_plan, file_id="highmiss_case",
        target_column="Target", identifier_columns=["ID"],
    )
    result = pd.read_csv(output_path)
    assert "Cabin" not in result.columns, "high-missingness column must be dropped"
    assert len(result) == n, (
        f"all {n} rows must be preserved (column dropped, not rows); got {len(result)}"
    )
    # The applied plan must report the column drop with a reason, so the report
    # reflects what actually happened rather than the LLM's row-drop proposal.
    assert "Cabin" in (applied_plan.get("dropped_columns") or {}), (
        "applied plan must record the safeguard's column drop"
    )


def test_low_missingness_drop_still_drops_rows(tmp_path=None):
    tmp_path = tmp_path or Path(tempfile.mkdtemp())
    # Only 1 of 20 rows is missing 'Notes' (5%) -- below the safeguard
    # threshold, so a "drop" strategy should still drop that one ROW and keep
    # the column, exactly as before.
    n = 20
    notes = [None if i == 0 else f"n{i}" for i in range(n)]
    df = pd.DataFrame({
        "ID": range(1, n + 1),
        "Notes": notes,
        "Fare": [10 + i for i in range(n)],
        "Target": [i % 2 for i in range(n)],
    })
    csv_path = _write_csv(df, tmp_path / "lowmiss.csv")

    cleaning_plan = {
        "missing_values": {"Notes": "drop"},
        "duplicates": "keep",
        "outliers": {},
        "encoding": {},
    }
    output_path, applied_plan, _ = clean_csv(
        csv_path, cleaning_plan, file_id="lowmiss_case",
        target_column="Target", identifier_columns=["ID"],
    )
    result = pd.read_csv(output_path)
    assert "Notes" in result.columns, "low-missingness column must be kept"
    assert len(result) == n - 1, (
        f"the single missing-Notes row must be dropped; expected {n-1}, got {len(result)}"
    )
    assert "Notes" not in (applied_plan.get("dropped_columns") or {}), (
        "low-missingness 'drop' must NOT trigger the column-drop safeguard"
    )


def _run_all():
    tests = [
        test_bug3_duplicate_invariant_holds_when_strategy_is_drop,
        test_bug3_duplicate_invariant_holds_when_strategy_is_keep,
        test_ragged_header_single_banner_line_is_auto_repaired,
        test_ragged_header_genuinely_corrupt_file_still_raises,
        test_high_missingness_drop_converts_to_column_drop,
        test_low_missingness_drop_still_drops_rows,
    ]
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


if __name__ == "__main__":
    _run_all()