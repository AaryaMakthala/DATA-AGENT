import type { CardVM } from "@/components/results/types";

export function ModelComparison({ models }: { models: CardVM[] }) {
  return (
    <>
      <h2 className="mt-12 font-display text-lg font-bold text-ink">
        Model Performance Comparison
      </h2>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {models.map((m) => (
          <div
            key={m.name}
            className={`card !p-5 text-center ${m.isBest ? "!border-mustard" : ""}`}
            style={m.isBest ? { borderWidth: "2px" } : undefined}
          >
            <div className="text-sm font-bold text-ink">{m.name}</div>
            <div className="mt-2 font-display text-2xl font-bold text-ink">{m.value}</div>
            {m.tag && (
              <span
                className="mt-3 inline-flex items-center rounded-pill px-3 py-1 text-[10px] font-bold"
                style={
                  m.isBest
                    ? { background: "var(--color-mustard)", color: "var(--color-ink)" }
                    : { background: "#e6f0e2", color: "#3f7a4d" }
                }
              >
                {m.tag}
              </span>
            )}
            {m.reason && (
              <p className="mt-3 text-left text-[11px] leading-snug text-muted">{m.reason}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
