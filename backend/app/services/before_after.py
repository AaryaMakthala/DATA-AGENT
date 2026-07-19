"""Before-vs-after cleaning comparison (redesign brief §5).

Purely arithmetic over two profiles that already exist by the time this runs:
`ctx.profile` (the original file's profile) and `ctx.cleaned_profile` (the
cleaned file's profile). Both are set on the `before_ctx` instance that
`report_adapter.build_results_response` constructs. No new profiling happens
here -- this module only diffs two dicts, which is also why it can't
reintroduce a stale-profile bug: it has no file path, only the two profile
dicts.
"""

from typing import Any, Optional

from app.services.pipeline_context import PipelineContext


def compute_before_after(ctx: PipelineContext, applied_plan: dict[str, Any]) -> dict[str, Any]:
    """Build the before/after comparison block for the results JSON.

    Args:
        ctx: Pipeline context with both `profile` and `cleaned_profile` set.
            Raises if `cleaned_profile` is missing -- callers must set it
            (report_adapter builds a dedicated `before_ctx` for this).
        applied_plan: The `applied_plan` dict returned by `cleaner.clean_csv`
            (used to count columns_encoded / values_imputed / dropped
            identifier columns -- these aren't derivable from the profile
            diff alone since a column can vanish for several different
            reasons).

    Returns:
        Dict with rows_before/after, duplicates_removed, missing_before/after,
        outliers_before/after, columns_removed, columns_encoded,
        values_imputed, identifier_columns_removed -- matching redesign
        brief §5 exactly, plus a `table` list ready for direct frontend
        rendering (row/before/after/difference).
    """
    if ctx.cleaned_profile is None:
        raise ValueError("compute_before_after requires ctx.cleaned_profile to be set")

    before = ctx.profile
    after = ctx.cleaned_profile

    rows_before = int(before["shape"]["rows"])
    rows_after = int(after["shape"]["rows"])

    duplicates_before = int(before.get("duplicates", 0))
    duplicates_after = int(after.get("duplicates", 0))

    missing_before = sum(before.get("missing_values", {}).values())
    missing_after = sum(after.get("missing_values", {}).values())

    outliers_before = sum(e.get("count", 0) for e in before.get("outliers", {}).values())
    outliers_after = sum(e.get("count", 0) for e in after.get("outliers", {}).values())

    cols_before = set(before.get("columns", {}).keys())
    cols_after = set(after.get("columns", {}).keys())

    identifier_columns_removed = list(applied_plan.get("dropped_columns", {}).keys())
    # Columns that disappeared for reasons other than the identifier drop
    # (e.g. a missing-value "drop column" strategy, if ever added upstream).
    other_removed = [c for c in (cols_before - cols_after) if c not in identifier_columns_removed]
    columns_removed = identifier_columns_removed + other_removed

    # One-hot encoding replaces N original categorical columns with M dummy
    # columns; "columns_encoded" counts the ORIGINAL columns the plan encoded.
    encoding_plan = applied_plan.get("encoding", {})
    columns_encoded = [
        col for col, action in encoding_plan.items()
        if action == "one_hot"
    ] if isinstance(encoding_plan, dict) else []

    # Values imputed: count of missing cells that were filled (not dropped).
    # missing_before - missing_after over-counts if rows were also dropped
    # (dropna removes missing cells without "imputing" them), so we only
    # count columns whose plan strategy was median/mode.
    missing_plan = applied_plan.get("missing_values", {})
    imputed_columns = []
    if isinstance(missing_plan, dict):
        for col, action in missing_plan.items():
            act = action.get("action") if isinstance(action, dict) else action
            if act in ("median", "mode"):
                imputed_columns.append(col)
    values_imputed = sum(
        before.get("missing_values", {}).get(col, 0) for col in imputed_columns
    )

    result = {
        "rows_before": rows_before,
        "rows_after": rows_after,
        "duplicates_removed": max(0, duplicates_before - duplicates_after) if rows_after != rows_before or duplicates_after == 0 else duplicates_before,
        "missing_before": int(missing_before),
        "missing_after": int(missing_after),
        "outliers_before": int(outliers_before),
        "outliers_after": int(outliers_after),
        "columns_removed": columns_removed,
        "columns_encoded": columns_encoded,
        "values_imputed": int(values_imputed),
        "identifier_columns_removed": identifier_columns_removed,
    }

    result["table"] = _build_comparison_table(result)
    return result


def _build_comparison_table(r: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten the before/after dict into rows the frontend table can render directly."""

    def diff(a: int, b: int) -> str:
        delta = b - a
        if delta == 0:
            return "0"
        sign = "+" if delta > 0 else ""
        return f"{sign}{delta}"

    return [
        {"metric": "Rows", "before": r["rows_before"], "after": r["rows_after"], "difference": diff(r["rows_before"], r["rows_after"])},
        {"metric": "Missing values", "before": r["missing_before"], "after": r["missing_after"], "difference": diff(r["missing_before"], r["missing_after"])},
        {"metric": "Outliers", "before": r["outliers_before"], "after": r["outliers_after"], "difference": diff(r["outliers_before"], r["outliers_after"])},
        {"metric": "Duplicate rows removed", "before": r["duplicates_removed"], "after": 0, "difference": f"-{r['duplicates_removed']}"},
        {"metric": "Columns removed", "before": len(r["columns_removed"]), "after": 0, "difference": f"-{len(r['columns_removed'])}"},
        {"metric": "Columns encoded", "before": len(r["columns_encoded"]), "after": len(r["columns_encoded"]), "difference": "0"},
        {"metric": "Values imputed", "before": r["values_imputed"], "after": 0, "difference": f"-{r['values_imputed']}"},
    ]