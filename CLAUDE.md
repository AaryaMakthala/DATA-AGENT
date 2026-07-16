# AI Data Analyst & Data Cleaning Agent — Project Spec

This file is the source of truth for this project. Read it fully before writing code.
Follow the build order in "Build Phases" at the bottom — do not skip ahead to later
phases until the current phase actually runs and is verified.

## 1. Objective

Build a production-style full-stack AI Data Analyst system.

Flow: user uploads a CSV → Python profiles it → the profile (not the raw data) goes to
an LLM for a cleaning strategy, explanation, insights, and algorithm recommendations →
Python executes the actual cleaning and chart generation → the system returns a cleaned
CSV, a report, charts, and ML algorithm recommendations.

**Hard rule: the LLM never touches or modifies the dataset directly.** It only receives
a JSON profile and returns a plan/text. All reading, calculating, cleaning, and
visualizing is done in Python.

## 2. Tech Stack

**Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, React Hook Form, Zod,
Axios or fetch.

**Backend:** Python 3.11+, FastAPI, Pydantic, Uvicorn.

**AI orchestration:** LangChain, LangGraph (StateGraph).

**LLM providers (fallback chain, ONE call at a time, never parallel):**
1. Google Gemini
2. Groq
3. OpenRouter

If Gemini errors (bad key, rate limit, timeout, unavailable) → try Groq → if that
errors → try OpenRouter → if all fail, return a clear error to the caller.

**Data:** pandas, numpy, scikit-learn.
**Visualization:** matplotlib, seaborn, plotly.
**Deployment:** Docker + docker-compose.

**Explicitly excluded — do not add these:** authentication, vector databases,
multi-agent architectures, MCP, or any tooling beyond what's listed here. Keep it
simple and scalable, not maximal.

## 3. Project Structure

```
AI-Data-Analyst-Agent/
  frontend/
    app/
      page.tsx
      upload/page.tsx
      dashboard/page.tsx
      layout.tsx
      globals.css
    components/
      UploadBox.tsx
      DatasetSummary.tsx
      CleaningReport.tsx
      ChartViewer.tsx
      AlgorithmRecommendation.tsx
      DownloadButtons.tsx
      LoadingState.tsx
      ErrorMessage.tsx
    lib/
      api.ts
    types/
      analysis.ts
  backend/
    app/
      main.py
      api/
        routes.py
        schemas.py
      agents/
        graph.py
        state.py
        llm_router.py
      tools/
        profiler.py
        cleaner.py
        visualizer.py
        ml_recommender.py
      services/
        csv_service.py
        file_service.py
      prompts/
        cleaning_prompt.py
        analysis_prompt.py
      utils/
        config.py
        logger.py
    uploads/
    outputs/
      cleaned_files/
      charts/
      reports/
    requirements.txt
    Dockerfile
    .env
    .env.example
  docker-compose.yml
  README.md
```

## 4. Python Profiling Engine (`profiler.py`)

Analyze and return as JSON:
- `shape`: rows, columns
- `columns`: names + dtypes
- `missing_values`: per-column counts, e.g. `{"salary": 200, "age": 50}`
- `duplicates`: duplicate row count
- Numerical columns: mean, median, std, min, max
- Categorical columns: unique value count, frequency table
- `outliers`: per numeric column, via IQR method
- `correlations`: correlation matrix for numeric columns

Example shape of the returned JSON:
```json
{
  "shape": {"rows": 5000, "columns": 20},
  "missing_values": {},
  "duplicates": 50,
  "columns": {},
  "outliers": {},
  "correlations": {}
}
```

## 5. LangGraph Workflow (`agents/graph.py`, `agents/state.py`)

State object:
```
{
  file_path,
  profile,
  cleaning_plan,
  cleaned_file,
  charts,
  report,
  recommendations
}
```

Node sequence:
```
START → Upload CSV → Profiler Node → LLM Analysis Node → Cleaning Plan Node
→ Python Cleaning Node → Visualization Node → ML Recommendation Node → END
```

## 6. LLM Router (`agents/llm_router.py`)

```
class LLMRouter:
    def generate(prompt: str) -> str:
        try: return call_gemini(prompt)
        except Exception:
            try: return call_groq(prompt)
            except Exception:
                try: return call_openrouter(prompt)
                except Exception: raise a clear, caught error
```

Use LangChain provider wrappers. Handle: invalid API key, rate limit, timeout, model
unavailable, network errors — each with a distinguishable, logged error message.

## 7. Cleaner (`tools/cleaner.py`)

- Missing values: numerical → median, categorical → mode
- Duplicates: drop
- Outliers: detect via IQR, optionally cap or remove
- Categorical encoding: one-hot when required
- Save output to `outputs/cleaned_files/`

## 8. Visualizer (`tools/visualizer.py`)

Rules:
- Categorical column → bar chart
- Numerical column → histogram
- Two numerical columns → scatter plot
- Correlation matrix → heatmap

Save to `outputs/charts/`.

## 9. ML Recommender (`tools/ml_recommender.py`)

**This is a heuristic recommender, not a training pipeline. No models are ever
trained, fit, or run here.** All output comes from reasoning about the dataset's
characteristics — shape, dtypes, target column, cardinality, missing data — using
established rules of thumb about which algorithms suit which kinds of data. This
keeps the pipeline fast and avoids the recommender becoming its own slow, heavy
subsystem.

**Stage A — Problem type detection (rule-based, in Python, no LLM, no training):**
- If there's no clear target column (last column, or one named like `target`,
  `label`, `class`, `y`) → clustering.
- If a target column is identified:
  - Target dtype is object/category, or numeric with low cardinality (e.g. ≤ 20
    unique values and unique/total ratio below ~0.05) → classification.
  - Target dtype is numeric/continuous with high cardinality → regression.
- Log the detected type and the reasoning (cardinality, dtype, ratio checked) so
  it's auditable.

**Stage B — Heuristic model ranking (no training, just reasoned suggestions):**
Based on dataset characteristics — row count, column count, ratio of numeric to
categorical features, class balance (for classification), presence of outliers/
missing data from the profiler — rank the standard candidates for the detected
problem type using documented rules of thumb, e.g.:
- Small dataset (few hundred rows or fewer) → simpler models (Logistic/Linear
  Regression) favored over tree ensembles, which need more data to shine.
- High-dimensional or mixed categorical/numeric data → tree-based models
  (Random Forest, Gradient Boosting, XGBoost) favored, since they handle mixed
  types and non-linear relationships without heavy preprocessing.
- Presence of significant outliers → tree-based models favored over Linear/
  Logistic Regression, which are more sensitive to outliers.
- Clustering: recommend KMeans when the profiler suggests roughly spherical,
  similarly-sized numeric clusters are plausible (e.g. no extreme skew); note
  DBSCAN as an alternative when density-based structure or noise/outliers in
  the data make KMeans's assumptions a poor fit.
- Classification candidates to rank from: Logistic Regression, Random Forest,
  Gradient Boosting, XGBoost.
- Regression candidates to rank from: Linear Regression, Random Forest
  Regressor, Gradient Boosting.
- Clustering candidates to rank from: KMeans, DBSCAN.

**Output shape** — a ranked list with a plain-English reason per model, and a
top pick, but explicitly no performance metrics (since nothing was trained):
```json
{
  "problem_type": "classification",
  "target_column": "churn",
  "detection_reasoning": "Target 'churn' is categorical with 2 unique values.",
  "ranked_models": [
    {
      "name": "Random Forest",
      "reason": "Handles the mix of numeric and categorical features well and is robust to the outliers found in the profile, without needing heavy preprocessing."
    },
    {
      "name": "Logistic Regression",
      "reason": "A reasonable simpler baseline, but more sensitive to the outliers detected in this dataset than tree-based options."
    }
  ],
  "top_recommendation": "Random Forest"
}
```
This is what gets returned to the frontend and shown in `AlgorithmRecommendation.tsx`
— a reasoned suggestion list, not a benchmark table. Make this explicit anywhere it's
described (docstrings, API docs, README) so it's never mistaken for a claim about
actual measured performance on this data.

## 10. FastAPI Endpoints

- `POST /upload` — upload a CSV, return a `file_id`
- `POST /analyze/{file_id}` — run the full LangGraph workflow
- `GET /results/{file_id}` — return `{ cleaned_file, charts, report, recommendations }`
- Enable CORS for the Next.js frontend origin.

## 11. Frontend Requirements

- Drag-and-drop CSV upload with upload progress
- Analysis status / loading state
- Dataset summary display
- Cleaning suggestions display
- Chart viewer
- Algorithm recommendations display
- Download button for cleaned CSV
- Reads backend URL from `NEXT_PUBLIC_API_URL`

## 12. Environment Files

**backend/.env.example**
```
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
UPLOAD_FOLDER=uploads
OUTPUT_FOLDER=outputs
```

**frontend/.env.local.example**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 13. Error Handling — must cover

**CSV:** empty file, corrupted CSV, unsupported file type, very large file, encoding
issues (try `utf-8`, fallback to `latin-1`), missing headers.

**Pandas:** KeyError, ValueError, EmptyDataError.

**LLM:** invalid API key, quota exceeded, timeout, rate limit, model unavailable —
each provider failure should trigger the fallback chain, not just fail silently.

**API:** 400 bad request, 404 file not found, 500 internal error — use FastAPI
`HTTPException` with meaningful messages.

**Frontend:** failed API call, upload failure, infinite loading state, backend
unreachable — all need visible user-facing error states, not silent failures.

Use try/except throughout, structured logging, and meaningful error messages —
no bare `except: pass`.

## 14. Code Quality

Clean modular architecture, production style, type hints everywhere, docstrings,
comments where logic isn't obvious, no unnecessary complexity or premature
abstraction.

**No placeholders.** Every function must be a real, working implementation —
no `# TODO: implement this later`, no `pass`, no stub functions that return fake
data "for now." If a piece genuinely can't be finished in the current phase (e.g.
it depends on a later phase), don't create the file yet at all rather than filling
it with dummy logic. Every number shown in the UI or report (stats, scores, chart
values) must come from an actual pandas/numpy/sklearn computation on the real
uploaded data — never a hardcoded or illustrative placeholder value.

## 15. Docker

- `backend/Dockerfile`
- Root `docker-compose.yml` with `backend` and `frontend` services

## 16. README

Must include: project explanation, architecture diagram, installation steps,
environment setup, how to run locally, API documentation, screenshot placeholders,
future improvements section.

---

## Build Phases (follow in order — do not skip ahead)

**Phase 1 — Backend core, no LLM yet**
Scaffold `backend/` structure. Implement `profiler.py` fully and test it standalone
against a sample CSV via a script or `python -c`. Confirm the JSON output shape
matches Section 4 before moving on.

**Phase 2 — Backend API skeleton**
Implement `/upload` and a stub `/analyze/{file_id}` that just runs the profiler and
returns it. Run uvicorn, curl both endpoints with a real CSV, confirm real responses
(not just "code compiles").

**Phase 3 — LLM router + LangGraph**
Implement `llm_router.py` with the fallback chain, and `graph.py`/`state.py` with the
full node sequence. Wire real API keys into `.env` (I will provide these) and run one
full end-to-end `/analyze` call. Confirm the fallback actually triggers by temporarily
breaking the Gemini key and observing it fall through to Groq.

**Phase 4 — Cleaner, Visualizer, ML Recommender**
Implement each tool, wire into the graph, confirm `/results/{file_id}` returns a
cleaned file path, chart file paths, and recommendations that all actually exist on
disk.

**Phase 5 — Frontend**
Scaffold Next.js app, build the upload flow against the now-working backend API,
verify the full user journey in a browser: upload → analyze → view results → download.

**Phase 6 — README + polish**
Write the README once behavior is verified, so it documents what was actually built
rather than what was planned.

**Phase 7 — Docker (last, on request)**
Containerize both services only after everything above runs correctly outside
Docker. Verify `docker-compose up` gives a working system from a clean checkout.
Do not start this phase until explicitly told to — the project must run natively
first.

At the end of every phase: run it, show me it actually works (server logs, a curl
response, a screenshot description, whatever's relevant), and only then proceed.

## Known Bugs — Required Fixes (found during Phase 5 testing, confirmed against real data)

These are not optional polish — they produce incorrect output and must be fixed
before Phase 6. See CLAUDE_FIXES_AND_DESIGN.md for full details and verification
steps for each. Summary, in required fix order:

1. **Outlier cleaning must never modify the target column.** Confirmed root cause:
   on classification_dataset.csv (Target: 94 zeros, 6 ones), IQR outlier removal
   strips the 6 minority-class rows because they read as statistical outliers on a
   binary column, leaving Target with 1 unique value by the time it reaches the
   recommender. Exclude target_column from all outlier detection/capping/removal,
   for every problem type.
2. **Reject single/zero-class targets outright.** If nunique(target) <= 1, return
   problem_type="invalid" and stop recommending models. This must exist as a
   backstop even after #1 is fixed.
3. **Target detection must run on the original dataframe, before one-hot
   encoding** — never re-derive target/problem-type from encoded columns.
4. **Visualization must run before one-hot encoding**, or must explicitly exclude
   encoded dummy columns from scatter/histogram generation. Charts like
   "Education_Bachelor vs Education_High School" (dummy-vs-dummy scatter plots)
   are structurally meaningless and must not be generated.
5. **Identifier columns (ID, Name, Customer_ID, etc.) must be excluded** from
   charts and from ML feature reasoning — detect via name pattern + uniqueness
   ratio on non-numeric columns.

Do not proceed to Phase 6 (README) until all five are fixed and verified against
classification_dataset.csv, sample_with_nan.csv, and a no-target dataset, with
actual response output pasted as proof — not just "it works now."