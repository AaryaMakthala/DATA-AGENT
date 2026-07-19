"""Prompt for the Cleaning Plan Node.

The LLM creates an executable cleaning strategy.
Python performs the actual cleaning.
"""

import json
from typing import Any


def build_cleaning_prompt(profile: dict[str, Any]) -> str:
    """Build a prompt asking the LLM for a structured cleaning plan.

    The LLM acts as a reasoning/planning layer only -- it never sees or touches
    the raw data (CLAUDE.md hard rule). It receives only the statistical profile
    and returns a JSON plan that Python executes. Beyond the executable
    strategies, it is asked to add a short `reason` and a `confidence` to each
    action, plus a brief `dataset_understanding` summary, so the report the user
    sees is self-explaining. The executable strategy still lives in `action`, so
    the Python cleaner runs the plan exactly as before.
    """

    return f"""
You are an expert Data Cleaning Planner and Data Scientist.

You are given ONLY a statistical profile of a dataset.
You DO NOT have access to the raw dataset.

Your task is to produce a cleaning strategy AND a short reasoning summary.

IMPORTANT RULES

Return STRICT JSON ONLY.

Do NOT return:

- Markdown
- Code fences
- Explanations outside the JSON
- Additional text

Return exactly this schema:

{{
  "dataset_understanding": {{
    "description": "<one sentence describing what this dataset appears to be>",
    "key_observations": ["<short observation>", "<short observation>"]
  }},
  "missing_values": {{
    "<column_name>": {{
      "action": "median" | "mode" | "drop",
      "reason": "<short reason>",
      "confidence": "high" | "medium" | "low"
    }}
  }},
  "duplicates": {{
    "action": "drop" | "keep",
    "reason": "<short reason>",
    "confidence": "high" | "medium" | "low"
  }},
  "outliers": {{
    "<column_name>": {{
      "action": "cap" | "remove" | "keep",
      "reason": "<short reason>",
      "confidence": "high" | "medium" | "low"
    }}
  }},
  "encoding": {{
    "<column_name>": {{
      "action": "one_hot" | "none",
      "reason": "<short reason>",
      "confidence": "high" | "medium" | "low"
    }}
  }},
  "notes": "<one short paragraph, max 70 words>"
}}

Rules

Dataset Understanding

- One-sentence description of the likely domain/purpose.
- Two to four short, concrete observations grounded ONLY in the profile.

Missing Values

- Include ONLY columns that contain missing values.
- Numeric columns -> "median"
- Categorical columns -> "mode"
- Prefer imputation. Recommend "drop" ONLY for columns with a small amount
  of missing data. Do NOT choose "drop" to preserve a column that is missing
  a large share of its values: deleting most of the rows to keep one sparse
  column is almost always the wrong trade. (As a safeguard, the Python
  cleaner will convert a "drop" that would remove a large fraction of the
  rows into dropping that COLUMN instead of the rows -- so choosing "drop"
  for a high-missingness column drops the column, not the dataset.)

Duplicates

- If duplicate rows > 0 -> action "drop"
- Otherwise -> action "keep"

Outliers

- Include ONLY columns with detected outliers.
- Use "cap" by default.
- Use "remove" only when extreme outliers are likely harmful.
- Use "keep" only when outliers appear meaningful.

Encoding

- Include ONLY categorical columns.
- Ignore identifier columns.
- Ignore free-text columns.
- Ignore columns with very high cardinality.
- Use "one_hot" for low/medium-cardinality categorical features.

Every reason must be grounded ONLY in the provided profile. Do NOT invent
information that is not present.

Dataset Profile (JSON)

{json.dumps(profile, indent=2)}

Return ONLY the JSON object.
"""