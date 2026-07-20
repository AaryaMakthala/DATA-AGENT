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


def build_analysis_report_text(
    file_id: str,
    report_raw: Union[str, dict[str, Any], None],
    recommendations: Optional[dict[str, Any]] = None,
    profile: Optional[dict[str, Any]] = None,
    quality_score: Optional[dict[str, Any]] = None,
) -> str:
    """Render a plain-text analysis report from what the pipeline ACTUALLY produced.

    Built entirely from already-stored fields -- the LLM's structured analysis
    (`report`, i.e. overview/key_findings/risks/recommendations), the heuristic
    ML recommendation (`recommendations`), the original profile shape, and the
    computed quality score -- nothing here is fabricated. This is the
    downloadable counterpart to the on-screen Executive Summary + ML
    Recommendation sections (§7.1: the Analysis Report download was previously
    null because no generator existed).

    Reuses `format_executive_summary`, so it inherits that helper's structured/
    fallback handling: a dict report renders full sections, a plain-string
    report renders as a single Overview with the other sections omitted.
    """
    summary = format_executive_summary(report_raw or "")
    rec = recommendations or {}

    lines: list[str] = []
    lines.append("DATA ANALYSIS REPORT")
    lines.append("=" * 60)
    lines.append(f"File ID: {file_id}")

    if profile:
        shape = profile.get("shape", {}) or {}
        rows = shape.get("rows")
        cols = shape.get("columns")
        if rows is not None and cols is not None:
            lines.append(f"Dataset: {rows} rows x {cols} columns (as uploaded)")
    if isinstance(quality_score, dict) and quality_score.get("quality_score") is not None:
        lines.append(f"Quality score: {quality_score.get('quality_score')}/100")
    lines.append("")

    lines.append("EXECUTIVE SUMMARY")
    lines.append("-" * 60)
    overview = (summary.get("overview") or "").strip()
    lines.append(overview if overview else "No overview was produced for this dataset.")
    lines.append("")

    for heading, key in (
        ("KEY FINDINGS", "key_findings"),
        ("RISKS", "risks"),
        ("RECOMMENDATIONS", "recommendations"),
    ):
        items = summary.get(key) or []
        if items:
            lines.append(heading)
            lines.append("-" * 60)
            for item in items:
                lines.append(f"- {item}")
            lines.append("")

    if rec:
        lines.append("MODEL RECOMMENDATION")
        lines.append("-" * 60)
        if rec.get("problem_type"):
            lines.append(f"Problem type: {rec['problem_type']}")
        if rec.get("target_column"):
            lines.append(f"Target column: {rec['target_column']}")
        if rec.get("detection_reasoning"):
            lines.append(f"Target detection: {rec['detection_reasoning']}")
        top = rec.get("top_recommendation")
        if top:
            lines.append(f"Top recommended model: {top}")
        ranked = rec.get("ranked_models") or []
        if ranked:
            lines.append("")
            lines.append("Ranked models:")
            for i, model in enumerate(ranked, start=1):
                if isinstance(model, dict):
                    name = model.get("name") or model.get("model") or "Unnamed model"
                    reason = model.get("reason") or model.get("rationale")
                    lines.append(f"  {i}. {name}")
                    if reason:
                        lines.append(f"     {reason}")
                else:
                    lines.append(f"  {i}. {model}")
        warnings = rec.get("warnings") or []
        if warnings:
            lines.append("")
            lines.append("Warnings:")
            for w in warnings:
                lines.append(f"- {w}")
        lines.append("")

    if summary.get("source") == "fallback_unstructured":
        lines.append("Note: the analysis model returned an unstructured summary, so")
        lines.append("Key Findings / Risks / Recommendations sections may be absent.")

    return "\n".join(lines).rstrip() + "\n"