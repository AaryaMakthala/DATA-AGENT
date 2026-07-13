"""Prompt for the Cleaning Plan Node: turns a data profile into a structured, executable plan.

The LLM never cleans data itself -- it only returns this plan. Python (Phase 4's
cleaner.py) is what actually executes it against the real DataFrame.
"""

import json
from typing import Any


def build_cleaning_prompt(profile: dict[str, Any]) -> str:
    """Build the prompt asking the LLM for a structured cleaning plan."""
    return f"""You are a data cleaning strategist. You have been given a statistical
profile of a dataset (not the raw data).

Based on this profile, produce a cleaning plan as STRICT JSON ONLY -- no markdown,
no code fences, no commentary before or after the JSON.

The JSON must have exactly this shape:
{{
  "missing_values": {{"<column_name>": "median" | "mode" | "drop"}},
  "duplicates": "drop" | "keep",
  "outliers": {{"<column_name>": "cap" | "remove" | "keep"}},
  "encoding": {{"<column_name>": "one_hot" | "none"}},
  "notes": "<one short paragraph explaining your reasoning>"
}}

Rules:
- Only include a column under "missing_values" if it actually has missing values
  in the profile. Use "median" for numeric columns, "mode" for categorical columns.
- Only include a column under "outliers" if the profile shows a nonzero outlier count.
- Only include low/medium-cardinality categorical columns under "encoding" (skip
  free-text/high-cardinality columns like names or IDs).
- "duplicates" should be "drop" whenever the profile shows duplicates > 0.

Dataset profile (JSON):
{json.dumps(profile, indent=2)}

Respond with the JSON object only.
"""
