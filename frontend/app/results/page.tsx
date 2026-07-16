"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { SiteNav } from "@/components/SiteNav";
import { ApiError, getResults, resolveAssetUrl } from "@/lib/api";
import type { ResultsResponse } from "@/types/analysis";

/**
 * Results page. Two modes:
 *  - No `file_id` in the URL (visited from marketing nav): renders STATIC MOCK
 *    data as a product preview. The inline SVG charts and hardcoded metrics
 *    below serve this path only.
 *  - `file_id` present (after a real upload): fetches GET /results/{file_id}
 *    and renders real profile stats, real generated chart PNGs, and the real
 *    heuristic recommendation.
 *
 * Note on "score": the backend recommender is heuristic-only and trains no
 * models (CLAUDE.md §9), so there is NO performance percentage. Real mode
 * shows the recommender's confidence labels + reasoning instead of a metric.
 */

// ----------------------------- shared view-model -----------------------------

interface CardVM {
  name: string;
  value: string;
  tag?: string;
  isBest: boolean;
  reason?: string;
}

interface ChartVM {
  title: string;
  node: React.ReactNode;
}

interface ResultsVM {
  isReal: boolean;
  filename: string;
  rows: string;
  cols: string;
  best: {
    recommendedLabel: string;
    name: string;
    badge: string;
    description: string;
    scoreLabel: string;
    scoreValue: string;
    scoreCaption: string;
    gaugeFill: number;
    scaleLeft: string;
    scaleRight: string;
  };
  models: CardVM[];
  charts: ChartVM[];
  downloadHref?: string;
}

// ------------------------------- mock charts --------------------------------

function DonutChart() {
  const segments = [
    { color: "#2f6fd6", offset: 0, len: 45 },
    { color: "#5f9ae8", offset: 45, len: 32 },
    { color: "#a5c4e8", offset: 77, len: 23 },
  ];
  const c = 2 * Math.PI * 40;
  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
        <g transform="rotate(-90 60 60)">
          {segments.map((s, i) => (
            <circle
              key={i}
              cx="60"
              cy="60"
              r="40"
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={`${(s.len / 100) * c} ${c}`}
              strokeDashoffset={`${-(s.offset / 100) * c}`}
            />
          ))}
        </g>
      </svg>
      <ul className="space-y-2 text-xs text-muted">
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#2f6fd6" }} /> Low</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#5f9ae8" }} /> Medium</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#a5c4e8" }} /> High</li>
      </ul>
    </div>
  );
}

function FeatureImportanceChart() {
  const bars = [92, 74, 58, 44, 33];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((v, i) => (
        <g key={i}>
          <text x="0" y={22 + i * 26} fontSize="8" fill="#6b6b6b">Feature {String.fromCharCode(65 + i)}</text>
          <rect x="52" y={12 + i * 26} width={(v / 100) * 150} height="12" rx="2" fill="#2f6fd6" />
        </g>
      ))}
    </svg>
  );
}

function ScatterChart() {
  const points = [
    [22, 88], [30, 80], [34, 76], [40, 70], [46, 66], [50, 60], [55, 58],
    [58, 50], [62, 48], [66, 44], [70, 38], [74, 34], [80, 28], [85, 22],
    [45, 72], [52, 64], [60, 54], [68, 42], [76, 32], [38, 78],
  ];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" aria-hidden="true">
      <line x1="20" y1="130" x2="210" y2="20" stroke="#141414" strokeWidth="1" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={20 + (x / 100) * 190} cy={130 - (100 - y) / 100 * 110} r="3" fill="#2f6fd6" />
      ))}
    </svg>
  );
}

function ResidualsChart() {
  const bars = [12, 28, 55, 82, 100, 78, 50, 30, 14];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((v, i) => (
        <rect key={i} x={12 + i * 23} y={130 - (v / 100) * 110} width="18" height={(v / 100) * 110} rx="2" fill="#a5c4e8" />
      ))}
    </svg>
  );
}

function HeatmapChart() {
  const palette = ["#b23a2e", "#d98a6a", "#e9e2d4", "#8fb4dd", "#3f6fb0"];
  const grid = [
    [4, 2, 3, 1, 0],
    [2, 4, 0, 3, 1],
    [3, 0, 4, 2, 1],
    [1, 3, 2, 4, 0],
    [0, 1, 1, 0, 4],
  ];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" aria-hidden="true">
      {grid.map((row, r) =>
        row.map((v, cIdx) => (
          <rect key={`${r}-${cIdx}`} x={20 + cIdx * 34} y={10 + r * 26} width="32" height="24" fill={palette[v]} />
        )),
      )}
    </svg>
  );
}

function BoxPlotChart() {
  const boxes = [
    { x: 20, top: 40, h: 30 },
    { x: 60, top: 45, h: 28 },
    { x: 100, top: 70, h: 22 },
    { x: 140, top: 60, h: 26 },
    { x: 180, top: 80, h: 18 },
  ];
  const labels = ["RF", "XGB", "GB", "LR", "SVR"];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" aria-hidden="true">
      {boxes.map((b, i) => (
        <g key={i}>
          <line x1={b.x + 12} y1={b.top - 12} x2={b.x + 12} y2={b.top + b.h + 12} stroke="#2f6fd6" strokeWidth="1" />
          <rect x={b.x} y={b.top} width="24" height={b.h} rx="2" fill="#a5c4e8" stroke="#2f6fd6" />
          <line x1={b.x} y1={b.top + b.h / 2} x2={b.x + 24} y2={b.top + b.h / 2} stroke="#2f6fd6" strokeWidth="1.4" />
          <text x={b.x + 12} y="144" fontSize="8" fill="#6b6b6b" textAnchor="middle">{labels[i]}</text>
        </g>
      ))}
    </svg>
  );
}

// ------------------------------ mock view-model -----------------------------

const MOCK_VM: ResultsVM = {
  isReal: false,
  filename: "sales_data.csv",
  rows: "1,250",
  cols: "15",
  best: {
    recommendedLabel: "Recommended Model",
    name: "Random Forest Regressor",
    badge: "Best Fit",
    description: "This model performed the best on your dataset based on accuracy, precision, and cross-validation score.",
    scoreLabel: "Performance Score",
    scoreValue: "92%",
    scoreCaption: "High Accuracy",
    gaugeFill: 0.92,
    scaleLeft: "0%",
    scaleRight: "100%",
  },
  models: [
    { name: "Random Forest", value: "92%", tag: "Best Fit", isBest: true },
    { name: "XGBoost", value: "89%", tag: "Excellent", isBest: false },
    { name: "Gradient Boosting", value: "87%", tag: "Very Good", isBest: false },
    { name: "Linear Regression", value: "74%", tag: "Good", isBest: false },
    { name: "SVR", value: "68%", tag: "Average", isBest: false },
  ],
  charts: [
    { title: "Target Distribution", node: <DonutChart /> },
    { title: "Feature Importance", node: <FeatureImportanceChart /> },
    { title: "Actual vs Predicted", node: <ScatterChart /> },
    { title: "Residuals Distribution", node: <ResidualsChart /> },
    { title: "Correlation Heatmap", node: <HeatmapChart /> },
    { title: "Prediction Error", node: <BoxPlotChart /> },
  ],
};

// --------------------------- real-data transforms ---------------------------

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Turn a generated chart filename into a human-readable title.
 * File IDs are hex (no underscores), so splitting on "_" is safe:
 *   {id}_bar_Department.png      -> "Department Distribution"
 *   {id}_hist_Age.png            -> "Age Distribution"
 *   {id}_scatter_Age_Salary.png  -> "Age vs Salary"
 *   {id}_correlation_heatmap.png -> "Correlation Heatmap" */
function chartTitle(path: string): string {
  const file = path.split("/").pop()?.replace(/\.png$/, "") ?? path;
  const parts = file.split("_");
  const kind = parts[1];
  const rest = parts.slice(2);
  if (kind === "bar" || kind === "hist") return `${rest.join(" ")} Distribution`;
  if (kind === "scatter") return `${rest[0]} vs ${rest[1]}`;
  if (kind === "correlation") return "Correlation Heatmap";
  return rest.join(" ") || file;
}

/** Map a coarse confidence label to a gauge fill fraction (visual only —
 * this is NOT a performance metric). */
function confidenceToFill(label?: string): number {
  switch ((label ?? "").trim().toLowerCase()) {
    case "high":
      return 0.9;
    case "medium-high":
      return 0.72;
    case "medium":
      return 0.55;
    case "medium-low":
      return 0.42;
    case "low":
      return 0.3;
    default:
      return 0.6;
  }
}

function buildRealVM(data: ResultsResponse): ResultsVM {
  const rec = data.recommendations;
  const rows = data.profile?.shape.rows ?? 0;
  const cols = data.profile?.shape.columns ?? 0;
  const ranked = rec?.ranked_models ?? [];
  const top = ranked[0];
  const topFill = confidenceToFill(top?.confidence);

  const problem = rec?.problem_type ?? "unknown";
  const target = rec?.target_column;
  const caption = target ? `${problem} · target: ${target}` : problem;

  return {
    isReal: true,
    filename: `${data.file_id}.csv`,
    rows: formatNumber(rows),
    cols: String(cols),
    best: {
      recommendedLabel: "Recommended Model",
      name: rec?.top_recommendation ?? "No recommendation",
      badge: "Best Fit",
      description: rec?.detection_reasoning ?? "No detection reasoning available.",
      scoreLabel: "Model Confidence",
      scoreValue: top?.confidence ?? "—",
      scoreCaption: caption,
      gaugeFill: topFill,
      scaleLeft: "Low",
      scaleRight: "High",
    },
    models: ranked.map((m, i) => ({
      name: m.name,
      value: m.confidence ?? "—",
      tag: i === 0 ? "Best Fit" : undefined,
      isBest: i === 0,
      reason: m.reason,
    })),
    charts: (data.charts ?? []).map((path) => ({
      title: chartTitle(path),
      node: (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveAssetUrl(path)}
          alt={chartTitle(path)}
          className="w-full rounded-[10px] border border-line"
        />
      ),
    })),
    downloadHref: data.cleaned_file ? resolveAssetUrl(data.cleaned_file) : undefined,
  };
}

// ------------------------------- gauge arc ----------------------------------

function gaugePath(fill: number): string {
  const f = Math.max(0, Math.min(1, fill));
  const theta = ((180 - 180 * f) * Math.PI) / 180;
  const x = 75 + 63 * Math.cos(theta);
  const y = 82 - 63 * Math.sin(theta);
  return `M12 82 A63 63 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`;
}

// --------------------------- presentational view ----------------------------

function ResultsView({ vm }: { vm: ResultsVM }) {
  return (
    <>
      {/* Success banner */}
      <div
        className="mt-6 flex items-center justify-between rounded-[16px] border px-6 py-5"
        style={{ borderColor: "#cfe3c8", backgroundColor: "#eef6e9" }}
      >
        <div className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "#3f9d54" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="5 12 10 17 19 7" />
            </svg>
          </span>
          <div>
            <div className="text-sm font-bold text-ink">Upload Successful!</div>
            <p className="text-xs text-muted">File: {vm.filename}</p>
          </div>
        </div>
        <div className="label-mono text-[10px]">{vm.rows} rows · {vm.cols} columns</div>
      </div>

      {/* Best model heading */}
      <h1 className="display-heading mt-10 text-4xl sm:text-5xl">
        Best Model for{" "}
        <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[8px]">Your Dataset</span>
      </h1>

      {/* Recommended model card */}
      <div className="card-elevated mt-6 grid grid-cols-1 gap-8 p-8 md:grid-cols-2">
        <div className="md:border-r md:border-line md:pr-8">
          <div className="label-mono text-[10px]">{vm.best.recommendedLabel}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-display text-2xl font-bold text-ink">{vm.best.name}</span>
            <span className="inline-flex items-center rounded-pill bg-mustard px-3 py-1 text-[11px] font-bold text-ink">{vm.best.badge}</span>
          </div>
          <p className="mt-4 max-w-sm text-sm text-muted">{vm.best.description}</p>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="label-mono text-[10px]">{vm.best.scoreLabel}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-display text-4xl font-bold text-ink">{vm.best.scoreValue}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3f9d54" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="19" x2="12" y2="6" />
                <polyline points="6 12 12 6 18 12" />
              </svg>
            </div>
            <p className="mt-2 text-xs text-muted">{vm.best.scoreCaption}</p>
          </div>

          {/* Gauge */}
          <div className="relative">
            <svg width="150" height="90" viewBox="0 0 150 90" aria-hidden="true">
              <path d="M12 82 A63 63 0 0 1 138 82" fill="none" stroke="#efe9dd" strokeWidth="16" strokeLinecap="round" />
              <path d={gaugePath(vm.best.gaugeFill)} fill="none" stroke="#f4c542" strokeWidth="16" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-x-0 bottom-1 text-center font-display text-lg font-bold text-ink">{vm.best.scoreValue}</div>
            <div className="mt-1 flex justify-between text-[9px] text-muted">
              <span>{vm.best.scaleLeft}</span>
              <span>{vm.best.scaleRight}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Model comparison */}
      <h2 className="mt-12 font-display text-lg font-bold text-ink">Model Performance Comparison</h2>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {vm.models.map((m) => (
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
            {m.reason && <p className="mt-3 text-left text-[11px] leading-snug text-muted">{m.reason}</p>}
          </div>
        ))}
      </div>

      {/* Visual insights */}
      <h2 className="mt-12 font-display text-lg font-bold text-ink">Visual Insights</h2>
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {vm.charts.map((chart) => (
          <div key={chart.title} className="card !p-5">
            <div className="mb-4 text-center text-xs font-bold text-ink">{chart.title}</div>
            <div className="flex items-center justify-center">{chart.node}</div>
          </div>
        ))}
      </div>

      {/* Download panel */}
      <div className="mb-16 mt-10 flex flex-col items-start justify-between gap-4 rounded-[16px] border border-line bg-cream-card px-8 py-7 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cream-sunken text-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11" />
              <polyline points="8 11 12 15 16 11" />
              <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
            </svg>
          </span>
          <div>
            <div className="text-sm font-bold text-ink">Download Updated CSV File</div>
            <p className="text-xs text-muted">Get your clean, processed, and updated dataset.</p>
          </div>
        </div>
        {vm.downloadHref ? (
          <a href={vm.downloadHref} download className="btn btn-yellow">
            Download CSV
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11" />
              <polyline points="8 11 12 15 16 11" />
              <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
            </svg>
          </a>
        ) : (
          <button type="button" className="btn btn-yellow">
            Download CSV
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11" />
              <polyline points="8 11 12 15 16 11" />
              <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}

// ------------------------------- data loader --------------------------------

function ResultsContent() {
  const params = useSearchParams();
  const fileId = params.get("file_id");

  const [vm, setVm] = useState<ResultsVM | null>(fileId ? null : MOCK_VM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) {
      setVm(MOCK_VM);
      return;
    }
    let active = true;
    setVm(null);
    setError(null);
    getResults(fileId)
      .then((data) => {
        if (active) setVm(buildRealVM(data));
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load results.");
      });
    return () => {
      active = false;
    };
  }, [fileId]);

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav />

        <div className="pt-8">
          <Link href="/upload" className="label-mono transition-colors hover:text-ink">
            ← Back to Upload
          </Link>
        </div>

        {error ? (
          <div className="mt-6 rounded-[16px] border border-line bg-cream-card px-6 py-10 text-center">
            <p className="text-sm font-bold text-ink">Couldn&apos;t load results</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <Link href="/upload" className="btn btn-yellow mt-6 inline-flex">Upload a file</Link>
          </div>
        ) : vm ? (
          <ResultsView vm={vm} />
        ) : (
          <div className="mt-6 rounded-[16px] border border-line bg-cream-card px-6 py-16 text-center">
            <p className="label-mono">Loading analysis…</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <ResultsContent />
    </Suspense>
  );
}
