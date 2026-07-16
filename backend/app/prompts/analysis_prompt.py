"""Prompt for the LLM Analysis Node: turns a data profile into a readable report."""

import json
from typing import Any


def build_analysis_prompt(profile: dict[str, Any]) -> str:
    """Build a prompt asking the LLM to summarize a dataset profile.

    The LLM only receives aggregate statistics and metadata, never the raw dataset.
    """

    return f"""
You are an experienced Senior Data Scientist.

You are given ONLY a statistical profile of a dataset.
You DO NOT have access to the raw data.

Your task is to write a concise professional report.

Requirements:

- Write in plain English.
- Output plain text only.
- Do NOT use markdown.
- Do NOT use bullet points.
- Do NOT use numbered lists.
- Do NOT mention that you are an AI.
- Do NOT invent information that is not present in the profile.
- If information is unavailable, simply omit it.

Cover the following topics naturally:

1. Overall dataset quality
   - Missing values
   - Duplicate rows
   - Outliers
   - Any potential data quality concerns

2. Statistical observations
   - Numeric distributions
   - Correlations (if available)
   - Category frequencies
   - Unusual patterns

3. Recommendations before machine learning
   - Cleaning priorities
   - Feature engineering opportunities
   - Possible risks

Dataset Profile (JSON):

{json.dumps(profile, indent=2)}

Return ONLY the report.
"""