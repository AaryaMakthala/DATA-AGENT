"""Prompt for the LLM Analysis Node: turns a data profile into a readable report.

CHANGED: previously asked for plain-text prose (one paragraph, no structure).
Now asks for structured JSON -- {overview, key_findings, risks,
recommendations} -- so the frontend's Executive Summary section (redesign
brief §2) can render four distinct panels instead of splitting one paragraph
after the fact. `agents/graph.py`'s `_run_analysis_llm` parses this the same
way `_run_cleaning_plan_llm` already parses the cleaning plan: extract a
fenced JSON block if present, `json.loads` it, and fall back to the raw
string if parsing fails -- `app/services/executive_summary.py`'s
`format_executive_summary` already accepts either shape, so no other file
needs to change to support the fallback path.
"""

import json
from typing import Any


def build_analysis_prompt(profile: dict[str, Any]) -> str:
    """Build a prompt asking the LLM to summarize a dataset profile as structured JSON.

    The LLM only receives aggregate statistics and metadata, never the raw dataset.
    """

    return f"""
You are an experienced Senior Data Scientist.

You are given ONLY a statistical profile of a dataset.
You DO NOT have access to the raw data.

Your task is to write a concise professional analysis as a single JSON object.

Requirements:

- Return ONLY a single valid JSON object. No markdown, no code fences, no
  commentary before or after it.
- The JSON object must have exactly these four keys:
  "overview": a string, 1-3 sentences describing what the dataset is and
    its overall shape/quality at a glance.
  "key_findings": a list of short strings, each one concrete observation
    (numeric distributions, correlations if available, category
    frequencies, unusual patterns).
  "risks": a list of short strings, each one a data quality concern or
    modeling risk (missing values, duplicates, outliers, imbalance,
    leakage-prone columns, anything that could mislead a model).
  "recommendations": a list of short strings, each one a concrete
    suggestion before machine learning (cleaning priorities, feature
    engineering opportunities, what to watch for).
- Each list should have 2-5 items. If you genuinely have fewer well-founded
  items than that, return fewer rather than padding with filler.
- Do NOT invent information that is not present in the profile.
- Do NOT mention that you are an AI.
- Every string should be plain English, no markdown formatting inside the
  strings (no bullets, no bold, no headers).

Example shape (values are illustrative only -- base your actual answer
strictly on the profile below, never reuse this example's content):

{{
  "overview": "This dataset contains N rows and M columns and appears suited to a classification problem predicting the Survived column.",
  "key_findings": ["Missing values are concentrated in the Age and Cabin columns.", "Fare and Pclass show a strong negative correlation."],
  "risks": ["Cabin is 77% missing, which limits how much signal cabin-based features can carry.", "The target classes are moderately imbalanced."],
  "recommendations": ["Impute Age using the median given its skewed distribution.", "Consider extracting Title from Name as an engineered feature."]
}}

Dataset Profile (JSON):

{json.dumps(profile, indent=2)}

Return ONLY the JSON object described above.
"""