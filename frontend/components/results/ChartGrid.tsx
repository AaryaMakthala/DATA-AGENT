import { ChartImage } from "@/components/results/ChartImage";
import type { ChartVM } from "@/components/results/types";

export function ChartGrid({ charts }: { charts: ChartVM[] }) {
  return (
    <>
      <h2 className="mt-12 font-display text-lg font-bold text-ink">Visual Insights</h2>
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {charts.map((chart) => (
          <div key={chart.key} className="card !p-5">
            <div className="mb-4 text-center text-xs font-bold text-ink">{chart.title}</div>
            <div className="flex items-center justify-center">
              {chart.url ? (
                <ChartImage title={chart.title} url={chart.url} />
              ) : (
                chart.node
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
