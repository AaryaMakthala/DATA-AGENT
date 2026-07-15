# Data Agent

**Your Personal Data Analyst and Data Cleaner**

Data Agent is an AI-powered data analysis platform that automatically profiles uploaded datasets, detects data quality issues, identifies likely prediction targets, recommends suitable machine learning algorithms, generates visual insights, and provides AI-assisted cleaning recommendations. It combines data profiling, machine learning intelligence, visualization, and LLM-powered explanations into a single application, allowing anyone to upload a dataset and receive a complete analysis without manually performing the traditional data analysis workflow.

---

## Table of Contents

- [Overview](#overview)
- [Core Workflow](#core-workflow)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

Data Agent simplifies the workflow of a data analyst. A user uploads a CSV file, and the system runs it through an automated pipeline that:

1. Profiles the dataset (row/column counts, data types, missing values, duplicates, outliers)
2. Detects columns that should be excluded from modeling (identifiers, GUIDs, indexes)
3. Identifies the most likely prediction target using a confidence-based scoring approach
4. Classifies the problem type (classification or regression)
5. Recommends machine learning algorithms suited to the dataset's characteristics
6. Generates an AI-written analysis report explaining patterns, correlations, and data quality issues
7. Produces an interactive dashboard of charts and visualizations
8. Applies AI-recommended cleaning steps to produce a cleaned, model-ready dataset

The goal is to make rigorous, explainable data analysis accessible to users without deep data science expertise.

---

## Core Workflow

```
Upload CSV Dataset
        |
        v
Dataset Profiling
        |
        v
Data Quality Analysis
        |
        v
Identifier Detection
        |
        v
Target Column Detection
        |
        v
Problem Type Classification
        |
        v
Algorithm Recommendation
        |
        v
AI Analysis Report
        |
        v
Interactive Dashboard
```

---

## Key Features

### Automated Dataset Profiling

The system analyzes uploaded CSV files and reports:

- Row and column statistics
- Data types
- Missing value detection
- Duplicate detection
- Outlier analysis
- Unique value analysis
- Statistical summaries

### Intelligent Target Detection

Rather than assuming the last column is the prediction target, the system uses a confidence-based scoring approach that evaluates column name meaning, business metric patterns, data type, cardinality, predictability, and general feature characteristics. Alternative target candidates are also surfaced with their own confidence scores.

### Identifier Detection and Filtering

Columns that should not participate in machine learning — such as customer IDs, employee IDs, transaction IDs, GUIDs, and record indexes — are automatically detected and excluded from feature reasoning, correlation analysis, and chart generation, preventing misleading recommendations.

### Machine Learning Algorithm Recommendation Engine

Algorithms are recommended based on actual dataset characteristics (size, feature composition, categorical ratio, outlier presence, class imbalance, and structure) rather than a static ranking. Supported recommendations include:

**Classification:** Gradient Boosting, Random Forest, XGBoost, Logistic Regression, Support Vector Machine

**Regression:** Gradient Boosting Regressor, Random Forest Regressor, XGBoost Regressor, Linear Regression

Each recommendation includes a confidence level and a plain-language explanation of why the model fits the dataset.

### Data Quality and Cleaning Recommendations

The system detects missing values, outliers, and duplicate records, and generates a cleaning strategy covering missing value handling, outlier treatment, categorical encoding, and column removal suggestions.

### AI-Powered Analysis Reports

An LLM generates natural-language insights describing patterns, correlations, data quality issues, and modeling considerations found in the dataset.

### Interactive Data Visualizations

Charts are generated automatically, including histograms, bar charts, scatter plots, correlation heatmaps, distribution charts, missing value charts, and target distribution charts.

### ML Validation and Testing

The project includes verification tests covering multiple dataset types (regression, classification with class imbalance, and invalid/single-class datasets) to confirm the pipeline correctly classifies problem type and rejects unusable data.

---

## Technology Stack

### Frontend

- Next.js 15
- TypeScript
- Tailwind CSS
- React
- Framer Motion
- shadcn/ui

### Backend

- FastAPI
- Python
- Pandas
- NumPy
- Scikit-learn

### AI / Agent System

- LangGraph
- LLM-based analysis workflow
- Groq (primary provider)
- Gemini (fallback provider)
- OpenRouter (secondary fallback)

### Data Processing

- Automated profiling
- ML preprocessing pipeline
- Algorithm recommendation engine

---

## Architecture

```
                 User
                  |
                  v
          Next.js Frontend
                  |
                  v
             FastAPI API
                  |
                  v
          LangGraph Workflow
                  |
     +------------+------------+
     |            |            |
     v            v            v
Profiler   ML Analyzer   LLM Agent
     |            |            |
Data Stats  Recommendations  Reports
                  |
                  v
          Interactive Dashboard
```

The LangGraph workflow runs the following node sequence:

```
START -> Profiler Node -> Target Detection Node -> Validation Node
      -> LLM Node (analysis + cleaning plan, run concurrently)
      -> Python Cleaning Node -> Visualization Node
      -> ML Recommendation Node -> END
```

If the validation node determines the dataset or detected target is unusable (for example, a single-class target), the workflow routes directly to `END` without invoking the LLM, cleaning, or visualization steps.

The two LLM calls in the workflow (analysis report generation and cleaning plan generation) are independent of one another and are executed concurrently rather than sequentially, since each depends only on the dataset profile and writes to a disjoint piece of state.

---

## Getting Started

### Prerequisites

- Python 3.10 or later
- Node.js 18 or later
- npm or yarn
- API keys for at least one supported LLM provider (Groq, Gemini, or OpenRouter)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate      # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000` and the backend API at `http://localhost:8000` by default.

---

## Project Structure

```
data-agent/
├── backend/
│   ├── app/
│   │   ├── agents/          # LangGraph workflow and node definitions
│   │   ├── api/              # FastAPI route definitions
│   │   ├── services/         # File handling and CSV validation services
│   │   ├── tools/            # Profiler, cleaner, visualizer, ML recommender
│   │   └── utils/            # Logging and shared utilities
│   ├── tests/                 # Verification and validation tests
│   └── test_fixtures/         # Sample datasets used in testing
├── frontend/
│   ├── app/                   # Next.js pages and routes
│   ├── components/            # React components and UI elements
│   └── types/                  # TypeScript type definitions
└── README.md
```

---

## Environment Variables

The backend requires the following environment variables, typically defined in a `.env` file within the `backend` directory:

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | API key for the Groq LLM provider (primary) |
| `GEMINI_API_KEY` | API key for the Gemini LLM provider (fallback) |
| `OPENROUTER_API_KEY` | API key for the OpenRouter LLM provider (secondary fallback) |

---

## Testing

Backend verification tests can be run from the `backend` directory:

```bash
python -m pytest tests/
```

Tests cover target detection, problem type classification, class imbalance handling, and rejection of invalid or unusable datasets.

---

## Roadmap

Planned areas of future work include:

- Caching of profiling results to avoid redundant computation on repeated dataset views
- Support for larger datasets through sampling-based profiling
- Expanded chart types, including box plots and target distribution charts
- Additional safeguards for numeric identifier columns that do not follow standard naming patterns
- Persistent storage for uploaded and cleaned datasets

---

## License

This project is currently unlicensed. Add a license file if you intend to distribute or open-source this project.
