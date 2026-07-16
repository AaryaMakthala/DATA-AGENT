import type { CleaningPlan } from "@/types/analysis";

interface CleaningReportProps {
  report: string | null;
  cleaningPlan: CleaningPlan | null;
}

function PlanList({ title, entries }: { title: string; entries?: Record<string, string> }) {
  if (!entries || Object.keys(entries).length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-700">{title}</h3>
      <ul className="mt-1 flex flex-wrap gap-2">
        {Object.entries(entries).map(([column, strategy]) => (
          <li
            key={column}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
          >
            <span className="font-medium">{column}</span>: {strategy}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CleaningReport({ report, cleaningPlan }: CleaningReportProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">Analysis & Cleaning Report</h2>

      {report && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{report}</p>
        </div>
      )}

      {cleaningPlan && !cleaningPlan.raw_plan && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">Cleaning Plan Applied</h3>
          <PlanList title="Missing values" entries={cleaningPlan.missing_values} />
          <PlanList title="Outlier handling" entries={cleaningPlan.outliers} />
          <PlanList title="Categorical encoding" entries={cleaningPlan.encoding} />
          {cleaningPlan.dropped_columns && Object.keys(cleaningPlan.dropped_columns).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-700">Dropped columns</h3>
              <ul className="mt-1 flex flex-col gap-1">
                {Object.entries(cleaningPlan.dropped_columns).map(([column, reason]) => (
                  <li key={column} className="text-xs text-slate-600">
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
                      {column}
                    </span>{" "}
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cleaningPlan.duplicates && (
            <p className="text-sm text-slate-700">
              <span className="font-medium">Duplicates:</span> {cleaningPlan.duplicates}
            </p>
          )}
          {cleaningPlan.notes && (
            <p className="text-sm italic text-slate-600">{cleaningPlan.notes}</p>
          )}
        </div>
      )}

      {cleaningPlan?.raw_plan && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            The cleaning plan could not be parsed as structured JSON; showing the raw response:
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-amber-900">{cleaningPlan.raw_plan}</pre>
        </div>
      )}
    </section>
  );
}
