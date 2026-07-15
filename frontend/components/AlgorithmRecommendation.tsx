import type { Recommendations } from "@/types/analysis";

interface AlgorithmRecommendationProps {
  recommendations: Recommendations;
}

const PROBLEM_TYPE_LABEL: Record<Recommendations["problem_type"], string> = {
  classification: "Classification",
  regression: "Regression",
  clustering: "Clustering",
  unknown: "No target detected — exploratory suggestions",
  invalid: "Cannot recommend models",
};

export default function AlgorithmRecommendation({ recommendations }: AlgorithmRecommendationProps) {
  const {
    problem_type,
    target_column,
    detection_reasoning,
    possible_targets,
    ranked_models,
    top_recommendation,
    excluded_columns,
    warnings,
  } = recommendations;

  if (problem_type === "invalid") {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Algorithm Recommendations</h2>
          <p className="mt-1 text-xs text-slate-500">
            Heuristic reasoning based on dataset characteristics. No models were trained — these are
            suggestions, not measured performance.
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
              Cannot recommend models
            </span>
            {target_column && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Target: {target_column}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-red-700">{detection_reasoning}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Algorithm Recommendations</h2>
        <p className="mt-1 text-xs text-slate-500">
          Heuristic reasoning based on dataset characteristics. No models were trained — these are
          suggestions, not measured performance.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
            {PROBLEM_TYPE_LABEL[problem_type]}
          </span>
          {target_column && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              Target: {target_column}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-600">{detection_reasoning}</p>
      </div>

      {possible_targets && possible_targets.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {problem_type === "unknown" ? "Possible targets considered" : "Other target candidates"}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {possible_targets.slice(0, 5).map((cand) => (
              <li key={cand.column} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-slate-800">
                  {cand.column}
                  {cand.column === target_column && (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                      chosen
                    </span>
                  )}
                </span>
                <span className="flex-none text-xs text-slate-500">
                  {cand.type} · {(cand.confidence * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {excluded_columns && excluded_columns.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Excluded from feature reasoning
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {excluded_columns.map((col) => (
              <span
                key={col}
                className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {col}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Identifier-like columns carry no predictive signal, so they were dropped before modeling.
          </p>
        </div>
      )}

      {warnings && warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <ul className="list-disc pl-5 text-sm text-amber-800">
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {top_recommendation && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Top pick</p>
          <p className="mt-1 text-base font-semibold text-emerald-900">{top_recommendation}</p>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {ranked_models.map((model, index) => (
          <li
            key={model.name}
            className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {model.name}
                {model.confidence && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {model.confidence}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-slate-600">{model.reason}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
