import type { BestVM } from "@/components/results/types";

function gaugePath(fill: number): string {
  const f = Math.max(0, Math.min(1, fill));
  const theta = ((180 - 180 * f) * Math.PI) / 180;
  const x = 75 + 63 * Math.cos(theta);
  const y = 82 - 63 * Math.sin(theta);
  return `M12 82 A63 63 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`;
}

export function BestModelCard({ best }: { best: BestVM }) {
  const showConfidenceArrow = best.scoreValue !== "—";

  return (
    <>
      <h1 className="display-heading mt-10 text-4xl sm:text-5xl">
        Best Model for{" "}
        <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[8px]">
          Your Dataset
        </span>
      </h1>

      <div className="card-elevated mt-6 grid grid-cols-1 gap-8 p-8 md:grid-cols-2">
        <div className="md:border-r md:border-line md:pr-8">
          <div className="label-mono text-[10px]">{best.recommendedLabel}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-display text-2xl font-bold text-ink">{best.name}</span>
            <span className="inline-flex items-center rounded-pill bg-mustard px-3 py-1 text-[11px] font-bold text-ink">
              {best.badge}
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm text-muted">{best.description}</p>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="label-mono text-[10px]">{best.scoreLabel}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-display text-4xl font-bold text-ink">{best.scoreValue}</span>
              {showConfidenceArrow && (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#3f9d54"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="12" y1="19" x2="12" y2="6" />
                  <polyline points="6 12 12 6 18 12" />
                </svg>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">{best.scoreCaption}</p>
          </div>

          <div
            className="relative"
            role="img"
            aria-label={`${best.scoreLabel}: ${best.scoreValue}`}
          >
            <svg width="150" height="90" viewBox="0 0 150 90" aria-hidden="true">
              <path
                d="M12 82 A63 63 0 0 1 138 82"
                fill="none"
                stroke="#efe9dd"
                strokeWidth="16"
                strokeLinecap="round"
              />
              <path
                d={gaugePath(best.gaugeFill)}
                fill="none"
                stroke="#f4c542"
                strokeWidth="16"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-x-0 bottom-1 text-center font-display text-lg font-bold text-ink">
              {best.scoreValue}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-muted">
              <span>{best.scaleLeft}</span>
              <span>{best.scaleRight}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
