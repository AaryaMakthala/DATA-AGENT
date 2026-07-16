import type { QualityVM } from "@/components/results/types";

export function QualityScore({ quality }: { quality: QualityVM }) {
  return (
    <div className="card-elevated mt-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
          style={{
            background:
              quality.score >= 80 ? "#3f9d54" : quality.score >= 60 ? "#f4c542" : "#c05a44",
          }}
          aria-label={`Data quality score ${quality.score}`}
        >
          {quality.score}
        </div>
        <div>
          <div className="label-mono text-[10px]">Data Quality Score</div>
          <div className="font-display text-lg font-bold text-ink">
            {quality.score >= 80 ? "Good" : quality.score >= 60 ? "Fair" : "Needs attention"}
          </div>
        </div>
      </div>
      {quality.issues.length > 0 && (
        <ul className="flex flex-1 flex-col gap-1">
          {quality.issues.map((issue, i) => (
            <li key={i} className="text-xs text-muted">
              • {issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
