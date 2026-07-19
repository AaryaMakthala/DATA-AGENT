"""Turns the cleaner's `applied_plan` dict into three UI-ready structures
(redesign brief §6 Cleaning Timeline, §7 Cleaning Report, §8 AI Decisions).

No new logic about WHAT was cleaned lives here -- that's entirely determined
by `app.tools.cleaner.clean_csv`, which is untouched. This module only
reshapes its output (`applied_plan`) plus the before/after numbers already
computed by `before_after.compute_before_after` into presentation structures.
"""

from typing import Any, Optional

_ACTION_LABELS = {
    "median": "Filled missing values using median",
    "mode": "Filled missing values using mode",
    "drop": "Dropped rows with missing values",
    "cap": "Capped outliers to the IQR fence",
    "remove": "Removed outlier rows",
    "one_hot": "One-hot encoded",
}

_DEFAULT_CONFIDENCE = "Not specified"


def _strategy_and_reason(raw: Any) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (action, reason, confidence) from a plan entry.

    Entry may be a bare string ("median") or the enriched
    {"action": ..., "reason": ..., "confidence": ...} form the LLM can return
    (see `cleaner._strategy_of`'s docstring). Bare strings have no reason/
    confidence attached by the LLM, so those fields fall back to a generic
    explanation rather than being fabricated.
    """
    if isinstance(raw, str):
        return raw, None, None
    if isinstance(raw, dict):
        return raw.get("action"), raw.get("reason"), raw.get("confidence")
    return None, None, None


def build_cleaning_timeline(applied_plan: dict[str, Any]) -> list[dict[str, Any]]:
    """One entry per concrete action the cleaner took, ordered the way it ran:
    identifier drop -> missing values -> duplicates -> outliers -> encoding.
    Each entry: {icon, action, reason, confidence}.
    """
    timeline: list[dict[str, Any]] = []

    # Columns physically removed from the frame. This includes identifier
    # drops AND columns the cleaner's high-missingness safeguard dropped
    # instead of deleting rows. The per-column `reason` already explains which
    # case it was, so the label stays generic ("Dropped column") rather than
    # asserting "identifier" for a column that was actually dropped for
    # missingness.
    dropped_columns = applied_plan.get("dropped_columns", {}) or {}
    for col, reason in dropped_columns.items():
        timeline.append({
            "icon": "trash",
            "action": f"Dropped column '{col}'",
            "reason": reason,
            "confidence": "High",
        })

    missing_plan = applied_plan.get("missing_values", {})
    if isinstance(missing_plan, dict):
        for col, raw in missing_plan.items():
            # If this column was ultimately DROPPED (e.g. the high-missingness
            # safeguard converted its "drop rows" strategy into a column drop),
            # the missing-value action never ran against a surviving column --
            # emitting "Dropped rows with missing values for 'Cabin'" right
            # after "Dropped column 'Cabin'" is contradictory. Skip it so the
            # timeline only shows what actually happened.
            if col in dropped_columns:
                continue
            action, reason, confidence = _strategy_and_reason(raw)
            if action not in _ACTION_LABELS:
                continue
            timeline.append({
                "icon": "wand",
                "action": f"{_ACTION_LABELS[action]} for '{col}'",
                "reason": reason or f"Column '{col}' had missing values that needed handling before modeling.",
                "confidence": confidence or _DEFAULT_CONFIDENCE,
            })

    dup_action, dup_reason, dup_conf = _strategy_and_reason(applied_plan.get("duplicates"))
    if dup_action == "drop":
        timeline.append({
            "icon": "copy",
            "action": "Removed duplicate rows",
            "reason": dup_reason or "Exact duplicate rows add no new information and can bias model training.",
            "confidence": dup_conf or _DEFAULT_CONFIDENCE,
        })

    outliers_plan = applied_plan.get("outliers", {})
    if isinstance(outliers_plan, dict):
        for col, raw in outliers_plan.items():
            if col in dropped_columns:
                continue
            action, reason, confidence = _strategy_and_reason(raw)
            if action not in ("cap", "remove"):
                continue
            timeline.append({
                "icon": "target",
                "action": f"{_ACTION_LABELS[action]} on '{col}'",
                "reason": reason or f"Values in '{col}' fell outside the IQR fences.",
                "confidence": confidence or _DEFAULT_CONFIDENCE,
            })

    encoding_plan = applied_plan.get("encoding", {})
    if isinstance(encoding_plan, dict):
        for col, raw in encoding_plan.items():
            if col in dropped_columns:
                continue
            action, reason, confidence = _strategy_and_reason(raw)
            if action != "one_hot":
                continue
            timeline.append({
                "icon": "layers",
                "action": f"One-hot encoded '{col}'",
                "reason": reason or f"'{col}' is categorical; models need numeric input.",
                "confidence": confidence or _DEFAULT_CONFIDENCE,
            })

    for col, reason in applied_plan.get("leakage_warnings", {}).items():
        timeline.append({
            "icon": "alert-triangle",
            "action": f"Flagged possible target leakage in '{col}'",
            "reason": reason,
            "confidence": "High",
        })

    return timeline


def build_ai_decisions(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reshape the timeline into the §8 'AI Decisions' card format.

    Same underlying data as the timeline, presented as
    {decision, reason, confidence} triples with confidence normalized to a
    percentage where the source gave a categorical label (High/Medium/Low),
    since the AI Decisions cards show a number.
    """
    label_to_pct = {"high": 95, "medium": 75, "low": 50}
    decisions = []
    for entry in timeline:
        conf = entry.get("confidence", _DEFAULT_CONFIDENCE)
        if isinstance(conf, str) and conf.lower() in label_to_pct:
            conf_display = f"{label_to_pct[conf.lower()]}%"
        elif isinstance(conf, str) and conf.endswith("%"):
            conf_display = conf
        else:
            conf_display = "Not specified"
        decisions.append({
            "decision": entry["action"],
            "reason": entry["reason"],
            "confidence": conf_display,
        })
    return decisions


def build_cleaning_summary(
    applied_plan: dict[str, Any],
    before_after: dict[str, Any],
    execution_time_seconds: float,
) -> dict[str, Any]:
    """§7 Cleaning Report: rows affected, columns affected, execution time.

    'Rows affected' = rows removed by duplicate/outlier handling (rows that
    exist in `before` but not `after`) PLUS rows whose values changed via
    imputation is not row-countable from the plan alone, so we report the
    conservative, verifiable number: rows removed. 'Columns affected' is
    every column touched by any step (dropped, imputed, capped/removed
    outliers, encoded).
    """
    rows_affected = before_after["rows_before"] - before_after["rows_after"]

    columns_affected: set[str] = set()
    columns_affected.update(applied_plan.get("dropped_columns", {}).keys())
    for section in ("missing_values", "outliers", "encoding"):
        section_plan = applied_plan.get(section, {})
        if isinstance(section_plan, dict):
            columns_affected.update(section_plan.keys())

    return {
        "rows_affected": rows_affected,
        "columns_affected": sorted(columns_affected),
        "columns_affected_count": len(columns_affected),
        "execution_time_seconds": round(execution_time_seconds, 4),
        "total_actions": len(applied_plan.get("dropped_columns", {})) + sum(
            len(applied_plan.get(s, {})) if isinstance(applied_plan.get(s), dict) else 0
            for s in ("missing_values", "outliers", "encoding")
        ) + (1 if _strategy_and_reason(applied_plan.get("duplicates"))[0] == "drop" else 0),
    }