"""Prompt for the LLM Analysis Node: turns a data profile into a readable report."""

import json
from typing import Any


def build_analysis_prompt(profile: dict[str, Any]) -> str:
    """Build the prompt asking the LLM to explain a dataset's statistical profile.

    The LLM only ever sees this JSON profile -- never the raw dataset.
    """
    return f"""You are a senior data analyst. You have been given a statistical
profile of a dataset (not the raw data, just aggregate statistics).

Write a clear, plain-text report (a few short paragraphs, no markdown headers,
no bullet lists) covering:
1. Overall data quality: how bad are the missing values, duplicates, and outliers?
2. Notable patterns: what stands out in the correlations, distributions, or
   categorical frequencies?
3. Key insights a data scientist should know before modeling this data.

Dataset profile (JSON):
{json.dumps(profile, indent=2)}

Respond with the report text only -- no preamble, no restating these instructions.
"""
