# AI Data Analyst & Data Cleaning Agent — As-Built Source of Truth

This document is the authoritative description of the current architecture, verified
against the real files rather than a plan. If implementation changes cause this document
to become inaccurate, update the documentation after verifying the new behavior. The
original phase-by-phase build spec is preserved at the bottom under "Appendix: Original
Build Spec" for historical context; the sections above it are authoritative.

Last reconciled: 2026-07-20, against a full read of `backend/app/**` + `frontend/**`,
with the full pytest suite (`PYTHONPATH=. venv/Scripts/python.exe -m pytest -q`,
**55/55 passing** — re-verified 2026-07-20) and a clean `tsc --noEmit` as runtime proof.

2026-07-20 session confirmations (do not re-derive next session):
- §6.7 (one-hot-encoded columns mislabeled as "removed" in Before/After) — fix confirmed
  in place and covered by tests in `tests/test_presentation_polish.py`.
- Identifier-exclusion audit item — confirmed CLOSED. The threshold in `cleaner.py`
  correctly excludes high-cardinality identifier columns (e.g. Titanic `Cabin`, `Ticket`)
  from ML reasoning/charts; the threshold was deliberately left as-is after review, not a
  bug. No change needed — leaving the threshold alone was the correct tradeoff.
- Remaining §7 open items are UNCHANGED and still open (worked next session, one at a
  time, in this order): (1) `analysis_report` download generator returns `null` — no
  generator function exists; (2) per-node timing metrics not persisted
  (`metadata.processing_metrics` is `{}`; `PipelineContext.timed()` exists but is not
  wired into `graph.py`).

---

## 1. Objective (unchanged)

Full-stack AI Data Analyst. Flow: user uploads a CSV → Python profiles it → the
**profile (not the raw data)** goes to an LLM for analysis + a cleaning plan → Python
executes the actual cleaning, charting, and heuristic ML recommendation → the system
returns a cleaned CSV, an enriched dashboard report, charts, and algorithm suggestions.

**Hard rule (still enforced): the LLM never touches or modifies the dataset.** It only
receives a JSON profile and returns a plan/text. All reading, calculating, cleaning,
and visualizing is done in Python. Verified: both LLM prompts
(`prompts/analysis_prompt.py`, `prompts/cleaning_prompt.py`) receive only
`json.dumps(profile)`, never row data.

## 2. Tech Stack (as built)

**Backend:** Python 3.11+ target (dev venv runs 3.10.11), FastAPI, Pydantic, Uvicorn,
LangChain + LangGraph (`StateGraph`), pandas, numpy, scikit-learn, matplotlib/seaborn.
**LLM fallback chain (one call at a time):** Gemini → Groq → OpenRouter, in
`agents/llm_router.py`.
**Frontend:** Next.js 15 (App Router), TypeScript, Tailwind, React Hook Form, Zod,
axios. Verified deps in `frontend/package.json` (next 15.5.20, react 19.2.4, zod 3.24).

## 3. Design Principles

Concise architectural rules the codebase upholds. They are the "why" behind the
implementation sections that follow; each is enforced somewhere in §4–§6.

- **The LLM reasons over profiles, never raw data.** It receives only the JSON profile
  and returns a plan or text; Python performs every mutation (§1).
- **Preserve observations (rows) whenever possible.** Row deletion is a last resort, not
  a default cleaning step.
- **High-missingness features are dropped as columns or imputed — never by deleting most
  of the dataset** (§6.4).
- **Target detection always occurs before encoding**, on the original dataframe (§4a).
- **Visualization always occurs before encoding**, from a pre-encoding snapshot (§5).
- **Identifier columns are excluded from ML reasoning** and from charts (§5, §6.6).
- **The target column is never modified during cleaning** — no imputation, outlier
  handling, or encoding touches it (§5, §6.6).
- **Dataset validation gates the pipeline before the LLM runs.** Unmodelable datasets
  route straight to END, so no LLM call, cleaning, or charts are produced for them (§4a).
- **Every documented fix must be backed by runtime verification** — no "it compiles"
  without pasted output (§8).

## 4. The Real Request Path (verified, end to end)

This is the actual wiring — trust this over any older diagram.

```
POST /upload            -> saves CSV, returns file_id            (routes.py:138)
POST /analyze/{file_id} -> runs the LangGraph, writes report JSON to disk
GET  /results/{file_id} -> reads report JSON, enriches it, returns dashboard contract
GET  /download/{file_id}         -> cleaned CSV attachment       (routes.py:319)
GET  /download/json/{file_id}    -> report JSON as attachment    (routes.py:333)
GET  /download/charts/{file_id}  -> zip of this run's PNG charts (routes.py:359)
```

### 4a. The LangGraph (`agents/graph.py`, state in `agents/state.py`)

The graph runs on a **plain `AnalystState` TypedDict** (`agents/state.py`). Node
sequence:

```
START -> profiler -> target_detection -> validation
      -(valid)->  llm_nodes  -> python_cleaning -> visualization -> ml_recommendation -> END
      -(invalid)-> END        (no LLM, no cleaning, no charts for unmodelable data)
```

Key facts about the graph, all verified in code:

- **`file_id` is generated once** in `profiler_node` and threaded through state; every
  downstream node reads `state["file_id"]` rather than minting its own UUID (fixes an
  old bug where cleaned files and charts got different IDs).
- **Target detection runs on the ORIGINAL dataframe** (`target_detection_node`), before
  any cleaning/encoding — never re-derived from encoded dummy columns.
- **`llm_nodes` runs the two independent LLM calls concurrently** (analysis + cleaning
  plan) on a 2-worker `ThreadPoolExecutor`. Both futures are waited on so a double
  failure logs both provider-chain errors before raising.
- **`_run_analysis_llm` parses the analysis response as JSON** (`{overview,
  key_findings, risks, recommendations}`), falling back to the raw string.
  `state["report"]` is therefore `dict | str`; `services/executive_summary.py` handles
  both.
- **`state["profile"]` is always the ORIGINAL pre-cleaning profile.**
  `ml_recommendation_node` re-profiles the cleaned file and stores it as
  `state["cleaned_profile"]` (a real field on `AnalystState`), plus a
  `quality_score` computed from the cleaned profile.

### 4b. The results enrichment (`services/report_adapter.py`)

`GET /results` calls **`report_adapter.build_results_response(file_id, data)`**
(`routes.py:312`), merged on top of a legacy flat payload. This is the **single real
integration point** for the dashboard contract. It returns:

```
overview, quality{score, components, dashboard, health, issues},
analysis{executive_summary, dataset_insights},
visualizations{charts[]}, ml_recommendation{problem_type, target_column,
detection_reasoning, top_recommendation, models[], why_not_others[], readiness,
warnings[]}, downloads{cleaned_csv, charts_zip, analysis_report, json_results,
cleaning_log}, metadata{row_count, column_count, processing_metrics},
before_after (only when cleaned_profile is present)
```

`report_adapter.py` constructs `PipelineContext` **ad hoc, post-hoc** (from the stored
report dict) and hands it to the formatter helpers. It builds two contexts: `ctx` from
the **original** profile (overview/insights) and `before_ctx` pairing original+cleaned
(before/after). See §6.1.

### 4c. Formatter helpers (`services/`)

`overview.py`, `insights.py`, `before_after.py`, `cleaning_report.py`,
`quality_presentation.py`, `ml_presentation.py`, `executive_summary.py` are pure
shaping functions called by `report_adapter.py`. `pipeline_context.py` provides the
`PipelineContext` dataclass (+ `timed()` / `timings_as_dict()` timing helpers) they
read off.

**DELETED as dead code (2026-07-19):** `services/response_builder.py` and the
module-level `build_context()` / `attach_target_detection()` / `attach_cleaned_profile()`
functions in `pipeline_context.py`. These were an earlier "profile once, thread a shared
context through the graph" design that was **never wired into `graph.py`**. The graph
always used the plain `AnalystState` TypedDict flow. The `PipelineContext` *dataclass* is
kept because `report_adapter`/`overview`/`insights`/`before_after` genuinely use it. **Do
not reintroduce a `build_context`-style flow without actually wiring it into `graph.py`**
— if you want the single-profile architecture, that is a real refactor (see §7.3), not a
helper to call from `report_adapter`.

## 5. Tools (`tools/`)

- **`profiler.py`** — `profile_csv()` returns shape/columns/missing/duplicates/numeric
  stats/categorical freqs/IQR outliers/correlations. Reads with `low_memory=False`
  (avoids a real pandas `IndexError` on mixed-dtype columns) and an encoding fallback
  (utf-8 → latin-1). Includes ragged-column detection + narrow auto-repair (§6.3).
- **`cleaner.py`** — applies the LLM plan with pandas. Target column is **excluded** from
  all missing-value/outlier/encoding steps. Identifier columns dropped. Missing-value
  column-drop safeguard (§6.4). IQR outlier action skipped below 30 rows. Saves a
  pre-encoding viz snapshot. Extensive `DIAG[...]` row-count logging (§6.2).
- **`visualizer.py`** — every chart function returns a **metadata dict**
  `{path, chart_type, title, description, interpretation}`, not a bare path. Charts are
  drawn from the pre-encoding snapshot so no dummy-vs-dummy scatter plots.
- **`ml_recommender.py`** — heuristic (NO training). Rule-based problem-type detection +
  reasoned model ranking. Includes the `nunique(target) <= 1 -> invalid` backstop.
- **`validator.py`** — gates unmodelable datasets to `valid=False` before the LLM runs.
- **`data_quality.py`** — deterministic quality score from the (cleaned) profile.

## 6. Fixed Bugs — current state (all verified, don't re-fix)

**6.1 Bug #1 — banner/overview showed post-cleaning row counts.**
FIXED at `report_adapter.py:167–202`. Overview/banner/dataset-dimensions/insights build
their `ctx` from `profile_original` **only**. `quality_source_profile` and `before_ctx`
separately use the cleaned profile. Never revert `ctx` to `profile_after or
profile_original`.

**6.2 Bug #3 — "impossible" duplicate-count mismatch.**
Root cause was measuring `original_duplicates` **before** `_apply_missing_values` ran,
then comparing it against a count taken after rows were removed — two different
dataframes. FIXED at `cleaner.py`: `original_duplicates` is now measured immediately
before `_apply_duplicates` (`cleaner.py:553`), and the "mathematically impossible"
warning is gated on `duplicates_strategy == "drop"` (`cleaner.py:577`) so it never fires
for a "keep" plan. `DIAG[...]` logging traces every row-count-changing step.
`report_adapter.py` has a matching *observational* diagnostic (logging only, no fix).

**6.3 Ragged-CSV auto-repair (profiler).**
`_detect_ragged_columns()` catches a header/data field-count mismatch (the classic
"single free-text banner line above the real header" case that made pandas silently
collapse 9 of 10 columns into an implicit index). `_try_strip_leading_preamble()`
attempts a **narrow, safe** auto-repair:
- Gated on `header_fields == 1` AND the new header + all sampled rows agreeing on the
  full column count.
- Bounded by `_MAX_PREAMBLE_LINES_TO_STRIP = 1` — it only ever strips **one** line.
- **2+ bad leading lines, or any inconsistency after stripping → falls back to raising
  the original `ProfilerError`.** It cannot silently mis-repair a genuinely corrupt file
  (proven by `test_ragged_header_genuinely_corrupt_file_still_raises`).
To widen it later, raise `_MAX_PREAMBLE_LINES_TO_STRIP` — that's the single knob.

**6.4 Missing-value column-drop safeguard (Issue 6 — FIXED 2026-07-19).**
Previously the cleaning prompt told the LLM to choose `"drop"` for very-high-missingness
columns, which deleted most of the dataset to preserve one sparse column (Titanic Cabin:
687/891 rows gone). NOW: `_apply_missing_values` converts a `"drop"` that would remove
more than `_MAX_ROW_DROP_FRACTION_FOR_MISSING` (**10%**) of the rows in hand into
dropping the **COLUMN** instead, preserving sample size. Below the threshold, `"drop"`
still drops rows. The conversion is recorded in `applied_plan["dropped_columns"]` with a
reason so the report is honest. `prompts/cleaning_prompt.py` was updated to describe this
behavior to the LLM. Covered by `test_high_missingness_drop_converts_to_column_drop` and
`test_low_missingness_drop_still_drops_rows`.

**6.5 Chart URL rendering.**
`file_service.chart_path_to_url()` is the single filesystem-path → `/charts/<name>`
converter; `report_adapter`'s chart manifest routes every path through it. Frontend
`safeResolveAssetUrl` allowlist is `["/charts/", "/download/"]` — chart URLs and all four
download URLs pass it (frontend detail in §9).

**6.6 Prior known-bugs (Issues 1–5 from the original spec) remain fixed:** outlier
cleaning excludes the target; single/zero-class targets → `problem_type="invalid"`;
target detection on the original frame; visualization before encoding; identifier
columns excluded from charts and ML reasoning.

**6.7 Before/after mislabeled one-hot-encoded columns as removed (FIXED 2026-07-20).**
The Before/After summary (and the cleaning-log download that reads it) reported every
one-hot-encoded column as *removed* and counted *zero* columns encoded — e.g. Titanic
`Sex`/`Embarked` showed under "Columns removed" while `columns_encoded` was empty, even
though the cleaned CSV correctly had `Sex_male`/`Sex_female`/`Embarked_*`. Two
interacting bugs in `before_after.py`: (1) `columns_encoded` compared each plan entry
(a dict `{"action": "one_hot", ...}`) against the string `"one_hot"`, which never
matches, so it was always `[]` — fixed by unwrapping the action like the
`missing_values` branch already does; (2) `columns_removed` came from the profile
column set-difference, and encoding makes the original column name vanish (replaced by
dummies), so encoded columns fell into "removed" — fixed by excluding `columns_encoded`
from `other_removed`. Data was always correct; this was reporting-only, but it misfired
for **every** one-hot-encoded column in every dataset. A skipped-encode
(`_ENCODING_SKIPPED_LABEL`) is a plain string, not `"one_hot"`, so it correctly stays
out of `columns_encoded`. Covered by `test_encoded_column_is_encoded_not_removed` and
`test_skipped_encode_is_not_counted_as_encoded` in `tests/test_presentation_polish.py`.

## 7. Open Items / Known Gaps (confirmed still open)

1. **`analysis_report` download — FIXED 2026-07-20.** Now served by
   `download_analysis_report` (`routes.py`, `GET /download/report/{file_id}`), backed by
   `build_analysis_report_text` in `services/executive_summary.py`. It renders a
   plain-text report on demand from the already-stored `report` (the LLM's structured
   analysis: overview/key_findings/risks/recommendations), `recommendations` (heuristic
   ML ranking), `profile` shape, and `quality_score` — nothing fabricated; reuses
   `format_executive_summary` so it inherits the structured/fallback handling.
   `report_adapter.py`'s `downloads.analysis_report` points at the endpoint when a
   `report` exists (null only for invalid datasets that never reached the LLM). Verified
   end-to-end against `Titanic-Dataset.csv`: `/results` returned a real
   `/download/report/<id>` URL and the download returned HTTP 200, `text/plain`
   attachment, 3318 bytes of real content. The `cleaning_log` download was already real
   (`download_cleaning_log`) from a prior session. Both frontend download cards resolve
   via the `safeResolveAssetUrl` `/download/` allowlist; `tsc --noEmit` clean.
2. **Per-node timing metrics — FIXED 2026-07-20.** `metadata.processing_metrics` now
   carries real per-node timings instead of `{}`. Wiring (no second timing system, no
   PipelineContext threading — §7.3 stays intact): (a) the existing `log_duration`
   helper (`utils/logger.py`) gained optional `sink`/`key` args so it records elapsed
   seconds into a dict in addition to logging; (b) each graph node in `agents/graph.py`
   passes a per-node `metrics` dict and returns `{"processing_metrics": metrics}` for its
   own stage (keys `profiling`, `target_detection`, `validation`, `analyzing`, `cleaning`,
   `generating_charts`, `cleaning_profile`, `recommending_models` — matching the
   frontend's `METRIC_LABELS`);
   (c) `AnalystState.processing_metrics` is `Annotated[dict, merge_processing_metrics]` —
   a reducer (`agents/state.py`) that accumulates each node's stage instead of the
   default overwrite-on-return, so all stages survive into the persisted report;
   (d) `report_adapter.py` loads the persisted dict onto `ctx.timings` as `StageTiming`
   and uses the existing `ctx.timings_as_dict()` to emit `metadata.processing_metrics`
   (which appends a derived `total_time`) — the same `ctx` `overview.py` already reads
   `total_time` off, so `overview.processing_time_seconds` now shows the real total too.
   Older stored reports (no `processing_metrics` key) still yield `{}`.

   **Extended 2026-07-20 (2nd pass):** a skeptical audit found `total_time` was the sum
   of only the *heavy* nodes — `target_detection_node` was timed log-only (no sink) and
   `validation_node` wasn't timed at all — so `total_time` /
   `overview.processing_time_seconds` slightly understated true end-to-end. Both nodes do
   real, file-size-dependent work (each calls `load_dataframe()` = a full CSV reload plus
   detection/validation), so that gap is genuine wall-clock, not a rounding artifact. Fix
   used the same infrastructure (no new timing system, no PipelineContext threading):
   wrapped each node's body in `log_duration(logger, "...", metrics, "<stage>")` with
   stage keys `target_detection` / `validation` and returned `{"processing_metrics":
   metrics}`; the existing reducer accumulates them. Added matching `METRIC_LABELS`
   entries ("Target Detection", "Validation") in the frontend — functionally optional
   since `page.tsx:902` already falls back to the raw key (`METRIC_LABELS[key] ?? key`)
   and the Zod schema is `z.record(z.number())`, so unknown keys never break rendering.
   Verified end-to-end against `Titanic-Dataset.csv`: `/results` returned all 8 stages
   `{"profiling":0.1054,"target_detection":0.0134,"validation":0.0104,"analyzing":2.0003,`
   `"cleaning":0.0721,"generating_charts":1.5538,"cleaning_profile":0.0668,`
   `"recommending_models":0.0071,"total_time":3.8293}`, sum of the 8 stages == `total_time`
   == `overview.processing_time_seconds` (3.8293, exact). Backward compat re-verified (old
   report with no key → `{}` / `0`). Invalid-dataset path now persists its 3 pre-END
   stages (`profiling`/`target_detection`/`validation`, summing to `total_time`) instead
   of profiling only. Full suite **55 passed**; `tsc --noEmit` clean.
3. **`PipelineContext` is post-hoc only.** It is NOT the single-source-of-truth profile
   carrier the old docstrings implied — see §4c. Each graph node still calls
   `profile_csv()` where it needs to (twice total: original in `profiler_node`, cleaned
   in `ml_recommendation_node`). This is correct and not a bug — just don't document it
   as a threaded context.

## 8. Verification Protocol (required before claiming any fix "done")

Per longstanding user policy: **never claim "done"/"verified"/"it compiles" without
pasting real runtime output.** For this repo specifically:

- Backend logic (full suite): `cd backend && PYTHONPATH=. python -m pytest -q`.
  pytest **is** installed in the venv (9.1.1). Current suite: **47 tests passing**.
  Must show `N passed` with a 0 exit code.
- Backend logic (quick subset): `cd backend && PYTHONPATH=. python tests/test_regressions.py`
  runs just the regression tests via a manual runner (no pytest needed). Handy for a
  fast check, but the full `python -m pytest -q` above is the authoritative gate.
- Backend imports: `PYTHONPATH=. venv/Scripts/python.exe -c "import app.api.routes, app.agents.graph"`.
- Frontend types: `cd frontend && npx --no-install tsc --noEmit` (exit 0).
- Behavior changes to cleaning/profiling must be proven against
  `classification_dataset.csv`, `sample_with_nan.csv`, a no-target dataset, and (for
  ragged/large files) a banner-preamble CSV — with output pasted, not summarized.

## 9. Frontend Contract Notes

`frontend/app/results/page.tsx` holds the Zod schema; `frontend/types/analysis.ts` the
TS interfaces. Both currently match `report_adapter`'s output (readiness dimensions,
ml/quality/before_after shapes verified field-for-field; `tsc --noEmit` clean). The
invalid-dataset gate (`problem_type: "invalid"`), the cream/mustard/ink token set, the
`safeResolveAssetUrl` allowlist (§6.5), and mock/real dual-mode are all present. **If you
change `report_adapter`'s output shape, update both frontend files and re-run `tsc`** —
the loose `dict[str, Any]` typing in `schemas.py` means FastAPI won't catch drift for you.

---

## Appendix: Original Build Spec (historical)

The project was built in phases; the detailed original spec (profiler JSON shape,
LangGraph state, LLM router contract, cleaner/visualizer/ml-recommender rules, error
handling matrix, Docker/README requirements, and the "Known Bugs — Required Fixes"
list) lives in **`CLAUDE_FIXES_AND_DESIGN.md`** and the git history. Those requirements
still hold as design intent; the sections above record how they actually landed. The
explicit exclusions from the original spec still stand: **no auth, no vector DBs, no
multi-agent architectures, no MCP** — keep it simple and scalable.

**Excluded / partially built:** Docker is incomplete — a `backend/Dockerfile` exists,
but there is **no `frontend/Dockerfile` and no root `docker-compose.yml`**, so the
Phase-7 "one-command `docker-compose up`" system does not exist; the project runs
natively only. Also missing: the two download generators (§7.1) and per-node timing
persistence (§7.2).
