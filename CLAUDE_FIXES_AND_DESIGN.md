# AI Data Analyst — Fix List + Frontend Design Instructions for Claude Code

Paste this whole file to Claude Code as one prompt (or save it in the repo and say
"read CLAUDE_FIXES_AND_DESIGN.md and work through it top to bottom"). It merges every
bug found during Phase 5 testing into one prioritized list, plus the frontend design
requirements (grid layout + infinite slider). Ground rules are at the top because the
previous session made claims ("verified end-to-end", "everything working") that later
testing proved wrong — don't repeat that pattern.

---

## Ground rules for this session (read first)

1. **Fix one issue, verify it with a real command or real browser output, then move to
   the next.** Do not batch five fixes and then verify once at the end.
2. **"It compiles" is not "it works."** For every backend fix, re-run `/analyze` on a
   real CSV and paste the actual JSON response (or the relevant slice of it) before
   claiming the issue is closed.
3. **Do not say "verified end-to-end" unless you actually opened the rendered output**
   (chart images, dashboard JSON, cleaned CSV) and checked the specific field that was
   broken. A 200 status code is not verification of correctness.
4. **No placeholder logic.** If a fix depends on reordering the pipeline (see Issue 3),
   do the reorder — don't patch around it with a filter that hides the symptom.
5. **If a fix touches `ml_recommender.py`, `cleaner.py`, or `visualizer.py`, run the
   standalone Python check (`python -c "..."`) shown in each issue below before
   restarting the server.** Uvicorn on this Windows setup does not hot-reload — restart
   it after every backend change, or you'll test stale code (this already happened once
   in the last session).
6. Work in the priority order below. Don't jump to Medium/Low items before High items
   are confirmed fixed.

---

## HIGH PRIORITY — data correctness bugs

### Issue 1 — Single-class target is accepted as a valid classification target

**Symptom (seen in real output):**
```
Target: Target
Target 'Target' is numeric but has only 1 unique values, which reads as encoded
class labels regardless of dataset size...
Top pick: Random Forest
```
A target with 1 unique value cannot be predicted. The recommender should refuse.

**Fix in `backend/app/tools/ml_recommender.py`:**
Add this check *before* the existing `_ALWAYS_LOW_CARDINALITY_MAX_UNIQUE` branch:
```python
if nunique <= 1:
    return "invalid", (
        f"Target '{target_column}' contains only {nunique} unique value(s). "
        "A predictive model cannot learn from a single-class target."
    )
```
Propagate `"invalid"` as a real problem_type through the API response and the
frontend — `AlgorithmRecommendation.tsx` must render a distinct "cannot recommend
models" state for it (see Issue 1a), not silently fall back to showing Random Forest.

**Verify:**
```bash
venv/Scripts/python.exe -c "
import pandas as pd
from app.tools.ml_recommender import detect_problem_type  # adjust import to actual function name
df = pd.DataFrame({'Target':[0]*20})
print(detect_problem_type(df, 'Target'))
"
```
Expect `("invalid", "...only 1 unique value(s)...")`, not `("classification", ...)`.

#### Issue 1a — Frontend must handle the `invalid` problem_type
In `AlgorithmRecommendation.tsx`, add a branch: if `problem_type === "invalid"`, render
a message card ("Cannot recommend models — target has only one class") instead of the
ranked model list. Do not let it fall through to the default renderer.

---

### Issue 2 — One-hot encoded columns get selected as the ML target

**Symptom:** after `Department` is one-hot encoded into `Department_Engineering`,
`Department_Finance`, `Department_Marketing`, the recommender picks
`Department_Marketing` as the target column.

**Root cause:** target detection is running on the *cleaned/encoded* dataframe instead
of the *original* dataframe, or after encoding has already happened in the graph.

**Fix — reorder the LangGraph pipeline** in `backend/app/agents/graph.py`. Target
detection (and problem-type detection) must run on the profiler's original dataframe,
before one-hot encoding:

```
Profiler Node
   → Target Detection (on ORIGINAL df)
   → LLM Analysis Node
   → Cleaning Plan Node
   → Python Cleaning Node (missing values, outliers, encoding)
   → Visualization Node (see Issue 3 — must also run before encoding)
   → ML Recommendation Node (uses target detected earlier + cleaned df's other columns)
   → END
```
Store `target_column` and `problem_type` in the graph `state` once, computed from the
original dataframe, and pass that forward — never re-derive the target from column
names after encoding.

**Target-name detection priority to implement in `ml_recommender.py`:**
```python
_TARGET_NAME_CANDIDATES = ["target", "label", "class", "outcome", "result", "y", "response"]
```
Check exact/case-insensitive match against these before falling back to "last column."
If nothing matches and there's no reasonable target, return:
```python
{"problem_type": "unknown", "target_column": None,
 "reason": "No explicit target column detected. Dataset can be used for exploratory "
           "analysis, clustering, anomaly detection, or visualization."}
```
Do **not** randomly pick a column (including an encoded one) as a fallback target.

**Verify:** run `/analyze` on a CSV with a `Department` categorical column and no real
target column. Confirm the response has `"problem_type": "unknown"` and
`"target_column": null` — not a `Department_*` column.

---

### Issue 3 — Visualization runs after one-hot encoding, producing useless charts

**Symptom:** charts like `scatter Education_Bachelor vs Education_Master` — binary
0/1 dummy columns plotted against each other, meaningless.

**Fix:** move the Visualization Node to run on the dataframe *before* encoding (after
missing-value/outlier cleaning is fine, but before one-hot). Pipeline order should be:
```
Cleaning (missing values, outliers) → Visualization → Encoding → ML Recommendation
```
If reordering the whole graph is too invasive right now, at minimum filter chart
generation to skip encoded dummy columns using a naming convention check:
```python
_ENCODED_COLUMN_SUFFIXES = None  # don't guess suffixes — instead...
```
Better: track which columns were created by encoding (the cleaner already knows this —
have `cleaner.py` return the list of newly-created dummy column names) and pass that
list into `visualizer.py` to exclude them explicitly, rather than pattern-matching
names.

**Verify:** re-run `/analyze` on a dataset with a categorical column that gets one-hot
encoded. Confirm the chart list contains one bar chart of the *original* categorical
column's value counts, not N scatter plots between its dummy columns.

---

### Issue 4 — Identifier columns (ID, Name, Customer_ID, etc.) are treated as features

**Symptom:** `hist ID`, `scatter ID vs Education_Bachelor` — ID is an arbitrary integer
with no predictive meaning, and it's being charted and (implicitly) fed to the ML
recommender as a normal numeric column.

**Fix — add identifier detection to `ml_recommender.py` (or a new small function
`profiler.py` can call), run right after profiling:**
```python
_ID_NAME_PATTERNS = ["id", "uuid", "email", "phone", "name", "number", "code",
                      "customer", "user", "transaction"]

def is_identifier_column(col_name: str, series: pd.Series, total_rows: int) -> bool:
    name_match = any(p in col_name.lower() for p in _ID_NAME_PATTERNS)
    uniqueness_ratio = series.nunique() / total_rows if total_rows else 0
    high_uniqueness = uniqueness_ratio > 0.8
    return name_match or high_uniqueness
```
Exclude identifier columns from:
- ML recommendation feature reasoning (don't count them toward "high-dimensional" etc.)
- Visualization (don't generate histograms/scatters for them)
- Suggest dropping them in the cleaning plan, with a clear reason (see Issue 5).

Be careful: `high_uniqueness` alone will also flag genuinely continuous numeric
columns in small datasets (e.g. a 12-row dataset where every `Income` value is
unique). Only apply the uniqueness rule to **non-numeric-looking** columns, or require
both the uniqueness ratio *and* dtype being object/string, to avoid false positives on
real numeric features in small datasets.

**Verify:** on a dataset with an `ID` or `Customer_ID` int column, confirm it's absent
from the returned chart list and flagged in `recommendations.excluded_columns` (add
this field to the response if it doesn't exist).

---

### Issue 5 — Cleaning plan never suggests dropping identifier columns

**Fix:** once Issue 4's detection exists, have the cleaning-plan step (LLM prompt or
the Python cleaning plan builder — whichever currently owns "keep/drop" decisions)
mark identifier columns as `"action": "drop"` with reason:
`"Unique identifier column that does not contribute meaningful information for
machine learning."` Show this in `CleaningReport.tsx` as a distinct row, not silently.

---

### Issue 6 — Target column is modified during outlier cleaning

**Symptom:** cleaning plan showed `Target: remove` under outlier handling — for a
classification target, 0/1 values are not outliers and must never be touched.

**Fix in `cleaner.py`:** exclude the detected `target_column` (from Issue 2's fix)
from outlier detection/capping/removal entirely, regardless of problem type. Add an
explicit early-return/skip in whatever function iterates numeric columns for IQR
outlier handling.

**Verify:** confirm the cleaning plan response shows something like
`"Target": {"outlier_handling": "skipped — target column is preserved"}` and that row
counts before/after cleaning only change due to genuine duplicate/outlier rows in
*non-target* columns.

---

### Issue 6a — Dataset-level validity gate (new requirement, not just the target check)

**Requirement:** the system must clearly tell the user when a dataset (or the
detected target) can't be used for modeling — never silently show a misleading
recommendation, and never silently drop the problem under the rug either.

This is broader than Issue 1's single-class-target check. Add a dedicated validation
step that runs **right after profiling, before the LLM analysis node**, so invalid
data is caught early and the LLM/cleaner/visualizer don't waste work on it.

**Add `backend/app/tools/validator.py`** with a function like:
```python
def validate_dataset(df: pd.DataFrame, target_column: str | None) -> dict:
    errors = []
    warnings = []

    if df.shape[0] == 0:
        errors.append("The uploaded file has no data rows.")
    if df.shape[1] == 0:
        errors.append("The uploaded file has no columns.")
    if df.shape[0] > 0 and df.drop_duplicates().shape[0] < 2:
        errors.append("After removing duplicate rows, fewer than 2 unique rows "
                       "remain — not enough data to analyze.")

    if target_column is not None and target_column in df.columns:
        target_non_null = df[target_column].dropna()
        if target_non_null.empty:
            errors.append(f"Target column '{target_column}' is entirely missing/null.")
        elif target_non_null.nunique() <= 1:
            errors.append(f"Target column '{target_column}' has only "
                           f"{target_non_null.nunique()} unique value(s) — a model "
                           "cannot learn from a single-class target.")

    if 0 < df.shape[0] < 5:
        warnings.append(f"Only {df.shape[0]} rows — too little data for a "
                         "reliable model recommendation; treat results as illustrative only.")

    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}
```

**Wire into the graph:** call this right after the Profiler Node and after target
detection (Issue 2's fix). Store the result in `state["data_validity"]`.

**If `valid == False`:**
- Skip the LLM analysis, cleaning, visualization, and ML recommendation nodes
  entirely — don't run an LLM call or generate charts for data that can't be used.
- Still return the raw profile (rows, columns, missing values, dtypes) — that part
  is still useful diagnostic info even for invalid data.
- The `/analyze` and `/results` response must include:
```json
{
  "data_validity": {
    "valid": false,
    "errors": ["Target column 'Target' has only 1 unique value(s) — a model cannot learn from a single-class target."],
    "warnings": []
  },
  "profile": { ... },
  "cleaned_file": null,
  "charts": [],
  "report": null,
  "recommendations": null
}
```
Do not return a 500 error for this case — it's not a server error, it's a legitimate
"this data can't be modeled" result. Use a normal 200 response with `data_validity.valid
= false`, so the frontend can render it as a clear informational state rather than a
crash.

**Frontend (`dashboard/page.tsx`):** if `data_validity.valid === false`, render a
prominent red/amber banner above the dataset summary:
```tsx
{!data_validity.valid && (
  <div className="lg:col-span-12 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
    <p className="font-semibold text-red-400">This dataset can't be used for modeling</p>
    <ul className="mt-2 list-disc pl-5 text-sm text-red-300">
      {data_validity.errors.map((e, i) => <li key={i}>{e}</li>)}
    </ul>
  </div>
)}
```
When this banner is showing, hide the Charts grid and Algorithm Recommendation panel
entirely (don't render empty/broken cards) — show only the dataset summary (still
useful) and the banner. If there are `warnings` but `valid` is still `true`, show a
smaller yellow/amber note instead of blocking anything (e.g. the "only 4 rows"
warning case — still attempt analysis, just flag it).

**Verify:** upload a CSV with a single-class target (or an empty CSV) and confirm:
- The API response has `data_validity.valid: false` with a specific, correct reason.
- The frontend shows the red banner with that exact reason — not a spinner, not a
  generic 500 error page, not a silently-empty charts section.
- No LLM call was made (check the backend logs — this should NOT show a Gemini/Groq
  request for an invalid dataset, since that would waste an API call on unusable data).

---

## MEDIUM PRIORITY

### Issue 7 — No-target datasets forced into classification/regression
Covered by Issue 2's fix (the "unknown" problem_type branch). After Issue 2 is done,
explicitly test a dataset with no plausible target (e.g. just `Name, Age, Score,
Department`) and confirm the frontend shows an "exploratory dataset — no target
detected" state instead of a classification recommendation. Add this branch to
`AlgorithmRecommendation.tsx` alongside the `invalid` branch from Issue 1a.

### Issue 8 — Imputation must never touch non-missing values
Add a validation check in `cleaner.py` right after imputation: compare the non-null
values before and after imputation per column; if any non-null value changed, raise
and log a warning (this indicates a bug in the imputation logic, not user error).

### Issue 9 — Outlier capping too aggressive on small datasets
On datasets under ~30 rows, IQR bounds get unreliable and can cap legitimate extreme
values. Add a size guard in `cleaner.py`:
```python
if len(df) < 30:
    # report outliers in the profile/report, but skip capping/removal
    ...
```

### Issue 10 — Class imbalance warning missing
When `problem_type == "classification"`, compute class distribution in
`ml_recommender.py` and add a `"warnings"` list to the response if any class makes up
less than ~10% of rows, e.g. `"Target classes are highly imbalanced (minority class:
6%). Consider class weights, oversampling, or stratified splitting."` Surface this in
`AlgorithmRecommendation.tsx`.

---

## LOWER PRIORITY / FUTURE (do not start until High + Medium are done and verified)

- Date column detection → extract year/month/day/weekday/quarter as features.
- Free-text column detection → recommend TF-IDF/embeddings/sentiment instead of
  treating as categorical.
- "Download complete report" as a zip (`cleaned_dataset.csv`, `analysis_report.json`,
  `recommendations.json`, `charts/`).
- A dedicated `data_understanding_agent` node if the above fixes make the graph feel
  overloaded — not required, only worth it if Issues 1–6 keep colliding with each
  other structurally.

---

## FRONTEND: Grid layout requirement

The dashboard (`frontend/app/dashboard/page.tsx`) must use a **CSS grid layout**, not
stacked full-width blocks. Apply this structure with Tailwind:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
  {/* Dataset summary — full width on mobile, spans left column on desktop */}
  <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
    {/* stat cards: rows, columns, duplicates, outliers */}
  </div>

  {/* Algorithm recommendation — right rail */}
  <div className="lg:col-span-4">
    <AlgorithmRecommendation ... />
  </div>

  {/* Cleaning report */}
  <div className="lg:col-span-12">
    <CleaningReport ... />
  </div>

  {/* Charts — actual grid, not a vertical stack */}
  <div className="lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
    {charts.map(chart => <ChartViewer key={chart.id} chart={chart} />)}
  </div>

  {/* Downloads */}
  <div className="lg:col-span-12">
    <DownloadButtons ... />
  </div>
</div>
```

Rules for Claude Code:
- Stat cards (rows/columns/duplicates/outliers) go in a small multi-column grid, not
  a vertical list.
- Charts go in a responsive image grid (1 col mobile → 2 col tablet → 3 col desktop),
  each chart in a card with a title and consistent aspect ratio (`aspect-[4/3]` or
  similar) so the grid doesn't jump around as images load at different sizes.
- Use `gap-4`/`gap-6`, not manual margins, to keep grid spacing consistent.
- Don't nest more than 2 levels of grid without a reason — keep it readable.

---

## FRONTEND: Infinite logo slider

You referenced a working `InfiniteSlider` component. Instructions for Claude Code:

1. Confirm `frontend/components/core/infinite-slider.tsx` exists (this is the
   shadcn/motion-primitives style component using Framer Motion). If it doesn't exist
   yet, install it rather than hand-rolling a marquee with raw CSS animations —
   Framer Motion gives smoother easing and drag-to-scroll for free.
2. Add it to the **landing page** (`frontend/app/page.tsx`), not the dashboard — it's
   a marketing/trust element ("built with Python, FastAPI, LangGraph, Next.js" logos
   or similar), not part of the data workflow.
3. Use real, license-safe SVG logos already in `frontend/public/` — do not fabricate
   or hotlink brand logos you don't have local files for.
4. Keep the slider inside its own full-width section with vertical padding, not
   crammed between other sections:
```tsx
<section className="w-full py-12 border-y border-border/50">
  <InfiniteSlider gap={24} reverse>
    {/* logos */}
  </InfiniteSlider>
</section>
```
5. Do not use the infinite slider for charts, results, or anything data-related —
   it's a decorative landing-page element only.

---

## Order of operations for this Claude Code session

1. Issue 6 (target excluded from all cleaning steps — see the class-balance
   decision note below) — fix, verify. This is the root cause of the single-class
   target bug seen in testing; fix it first.
2. Issue 1 + 1a (single-class target safety-net check) — fix, verify.
3. Issue 6a (dataset-level validity gate + frontend error banner) — fix, verify.
   Build this so it also catches the Issue 1 case (single-class target) through the
   same mechanism — don't maintain two separate "is this unusable" code paths.
4. Issue 2 (target detection on original df, pipeline reorder) — fix, verify.
5. Issue 3 (visualization before encoding) — fix, verify.
6. Issue 4 + 5 (identifier detection + drop recommendation) — fix, verify.
7. Re-run the full `/analyze` flow on 4 different CSVs (one classification, one
   regression, one no-target/exploratory, one deliberately invalid — e.g. a
   single-class target or empty file) and paste all four responses.
8. Only after step 7 is confirmed correct: do the Medium priority issues (7–10).
9. Only after that: grid layout + infinite slider on the frontend.
10. Do not touch Docker (Phase 7) — explicitly out of scope until the spec says so.

**Note on Issue 6's scope:** decide now whether target-column protection means
"excluded from outlier removal only" or "excluded from every cleaning step
(imputation, outlier handling, duplicate-based row drops)." Recommended: protect it
from everything except duplicate-row dropping (an exact duplicate row, target
included, is still a duplicate) — but never let outlier/missing-value logic alter or
remove rows based on the target's own value.

At each numbered step, stop and report actual verified output before continuing —
do not chain all fixes into one giant unverified commit.
