import type { DatasetProfile } from "@/types/analysis";

interface DatasetSummaryProps {
  profile: DatasetProfile;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function DatasetSummary({ profile }: DatasetSummaryProps) {
  const missingCount = Object.keys(profile.missing_values).length;
  const outlierTotal = Object.values(profile.outliers).reduce((sum, o) => sum + o.count, 0);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">Dataset Summary</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Rows" value={profile.shape.rows} />
        <StatCard label="Columns" value={profile.shape.columns} />
        <StatCard label="Duplicate rows" value={profile.duplicates} />
        <StatCard label="Outlier values" value={outlierTotal} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-600">Column</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">Missing</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {Object.entries(profile.columns).map(([column, dtype]) => {
              const numeric = profile.numeric_summary[column];
              const categorical = profile.categorical_summary[column];
              return (
                <tr key={column}>
                  <td className="px-4 py-2 font-medium text-slate-800">{column}</td>
                  <td className="px-4 py-2 text-slate-600">{dtype}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {profile.missing_values[column] ?? 0}
                    {missingCount > 0 && profile.missing_values[column] ? (
                      <span className="ml-1 text-xs text-amber-600">
                        ({((profile.missing_values[column] / profile.shape.rows) * 100).toFixed(1)}%)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {numeric && (
                      <span>
                        mean {numeric.mean ?? "—"}, median {numeric.median ?? "—"}, std {numeric.std ?? "—"}
                      </span>
                    )}
                    {categorical && <span>{categorical.unique_count} unique values</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
