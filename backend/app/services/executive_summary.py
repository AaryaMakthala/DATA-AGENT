"""§2 Executive Summary formatting.

IMPORTANT INTEGRATION NOTE (I don't have your actual LLM prompt file, e.g.
`prompts/analysis_prompt.py`, so this is the one place in Phase 1 that
requires a small change OUTSIDE these new files):

The cleanest way to get "Overview / Key Findings / Risks / Recommendations"
instead of one paragraph is to ask the LLM for that structure directly, e.g.
add to the analysis prompt's expected JSON output:

    "executive_summary": {
        "overview": "1-2 sentences",
        "key_findings": ["...", "..."],
        "risks": ["...", "..."],
        "recommendations": ["...", "..."]
    }

`format_executive_summary` below accepts that shape directly. It also
accepts your CURRENT plain-string summary as a graceful fallback (splitting
on blank lines / sentences is inherently lossy -- treat the fallback as a
stop-gap until the prompt is updated, not the intended long-term path).
"""

from typing import Any, Optional, Union

_SECTION_ICONS = {
    "overview": "file-text",
    "key_findings": "search",
    "risks": "alert-triangle",
    "recommendations": "check-circle",
}


def format_executive_summary(llm_summary: Union[str, dict[str, Any]]) -> dict[str, Any]:
    """Normalize whatever the LLM analysis node returned into the 4-section shape.

    Args:
        llm_summary: Either the NEW structured dict
            `{"overview": str, "key_findings": [str], "risks": [str],
              "recommendations": [str]}` (preferred -- update the prompt to
            emit this), or the CURRENT plain-string summary (fallback).

    Returns:
        {"overview": str, "key_findings": [str], "risks": [str],
         "recommendations": [str], "icons": {...}} ready for the frontend to
        render as four labeled sections.
    """
    if isinstance(llm_summary, dict):
        return {
            "overview": llm_summary.get("overview", ""),
            "key_findings": list(llm_summary.get("key_findings", [])),
            "risks": list(llm_summary.get("risks", [])),
            "recommendations": list(llm_summary.get("recommendations", [])),
            "icons": _SECTION_ICONS,
            "source": "structured",
        }

    # Fallback: best-effort split of a plain-paragraph summary. This is
    # intentionally conservative -- it does not try to invent findings that
    # aren't there, it just breaks the paragraph into sentence-level chunks
    # under a single "Overview" section so nothing is lost, and leaves the
    # other three sections empty rather than guessing.
    text = (llm_summary or "").strip()
    return {
        "overview": text,
        "key_findings": [],
        "risks": [],
        "recommendations": [],
        "icons": _SECTION_ICONS,
        "source": "fallback_unstructured",
        "note": (
            "LLM summary was a plain string. Update the analysis prompt to "
            "return structured executive_summary JSON for full Key Findings/"
            "Risks/Recommendations sections."
        ),
    }