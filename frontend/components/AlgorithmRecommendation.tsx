import type { Recommendations } from "@/types/analysis";

interface AlgorithmRecommendationProps {
  recommendations: Recommendations;
}

const PROBLEM_TYPE_LABEL: Record<Recommendations["problem_type"], string> = {
  classification: "Classification",
  regression: "Regression",
  clustering: "Clustering",
};

export default function AlgorithmRecommendation({ recommendations }: AlgorithmRecommendationProps) {
  const { problem_type, target_column, detection_reasoning, ranked_models, top_recommendation } =
    recommendations;

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
              <p className="text-sm font-semibold text-slate-900">{model.name}</p>
              <p className="mt-1 text-sm text-slate-600">{model.reason}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
