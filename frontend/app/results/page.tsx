"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { SiteNav } from "@/components/SiteNav";
import { ApiError, getResults, resolveAssetUrl } from "@/lib/api";

/**
 * Results page. Two modes:
 *  - No `file_id` in the URL (visited from marketing nav): renders STATIC MOCK
 *    data as a product preview.
 *  - `file_id` present (after a real upload): fetches GET /results/{file_id}
 *    and renders real profile stats, real generated chart PNGs, real
 *    heuristic recommendation, and (when the backend sends them) the richer
 *    sections below: executive summary, dataset overview, quality breakdown,
 *    cleaning report, correlation highlights, and warnings.
 *
 * IMPORTANT: every "extra" field beyond the original schema is `.nullish()`.
 * If your backend doesn't send it yet, the corresponding UI section is
 * simply omitted — this file will never throw on a partial response.
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
  key: string;
  title: string;
  node?: React.ReactNode;
  url?: string;
}

interface OverviewVM {
  problemType?: string;
  target?: string;
  numericFeatures?: number;
  categoricalFeatures?: number;
  missingTotal?: number;
  duplicates?: number;
  outliersTotal?: number;
}

interface QualityVM {
  score: number;
  issues: string[];
  components?: { label: string; value: number }[];
}

interface CleaningVM {
  rowsRemoved?: number;
  duplicatesRemoved?: number;
  outliersCapped?: number;
  columnsEncoded?: number;
  droppedColumns?: string[];
}

interface CorrelationVM {
  a: string;
  b: string;
  value: number;
}

interface StatRowVM {
  column: string;
  mean?: number;
  median?: number;
  std?: number;
  min?: number;
  max?: number;
}

interface ResultsVM {
  isReal: boolean;
  filename: string;
  rows: string;
  cols: string;
  invalidMessage?: string;
  executiveSummary?: string;
  overview?: OverviewVM;
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
  quality?: QualityVM;
  cleaning?: CleaningVM;
  correlations?: CorrelationVM[];
  stats?: StatRowVM[];
  warnings?: string[];
}

// --------------------------- Zod response validation -------------------------

const numericStatSchema = z.object({
  mean: z.number().nullish(),
  median: z.number().nullish(),
  std: z.number().nullish(),
  min: z.number().nullish(),
  max: z.number().nullish(),
});

const resultsResponseSchema = z
  .object({
    file_id: z.string().min(1),
    profile: z
      .object({
        shape: z.object({
          rows: z.number(),
          columns: z.number(),
        }),
        numeric_summary: z.record(numericStatSchema).nullish(),
        categorical_summary: z.record(z.unknown()).nullish(),
        missing_values: z.record(z.number()).nullish(),
        duplicates: z.number().nullish(),
        outliers: z
          .record(z.object({ count: z.number() }).passthrough())
          .nullish(),
        correlations: z.record(z.record(z.number())).nullish(),
      })
      .passthrough()
      .nullish(),
    report: z.string().nullish(),
    data_validity: z
      .object({
        valid: z.boolean(),
        errors: z.array(z.string()).nullish().transform((v) => v ?? []),
        warnings: z.array(z.string()).nullish().transform((v) => v ?? []),
      })
      .passthrough()
      .nullish(),
    quality_score: z
      .object({
        quality_score: z.number(),
        issues: z.array(z.string()).nullish().transform((v) => v ?? []),
        components: z.record(z.number()).nullish(),
      })
      .passthrough()
      .nullish(),
    cleaning_summary: z
      .object({
        rows_removed: z.number().nullish(),
        duplicates_removed: z.number().nullish(),
        outliers_capped: z.number().nullish(),
        columns_encoded: z.number().nullish(),
        dropped_columns: z.array(z.string()).nullish(),
      })
      .passthrough()
      .nullish(),
    recommendations: z
      .object({
        problem_type: z.string().nullish(),
        target_column: z.string().nullish(),
        detection_reasoning: z
          .string()
          .nullish()
          .transform((v) => v ?? ""),
        ranked_models: z
          .array(
            z.object({
              name: z.string(),
              confidence: z.string().nullish(),
              reason: z.string().nullish().transform((v) => v ?? ""),
            })
          )
          .nullish()
          .transform((v) => v ?? []),
        top_recommendation: z.string().nullish(),
        warnings: z.array(z.string()).nullish(),
      })
      .passthrough()
      .nullish(),
    charts: z
      .array(z.string())
      .nullish()
      .transform((v) => v ?? []),
    cleaned_file: z.string().nullish(),
  })
  .passthrough();

type ValidatedResults = z.infer<typeof resultsResponseSchema>;

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
  executiveSummary:
    "This dataset contains 1,250 sales records with 15 columns and appears well-suited for a regression problem predicting revenue. Data quality is good (92/100). Random Forest is recommended because it handles the mix of numeric and categorical features and the moderate outlier count well. The main watch-item is two highly correlated feature pairs.",
  overview: {
    problemType: "Regression",
    target: "Revenue",
    numericFeatures: 11,
    categoricalFeatures: 4,
    missingTotal: 38,
    duplicates: 6,
    outliersTotal: 22,
  },
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
    { name: "Random Forest", value: "92%", tag: "Best Fit", isBest: true, reason: "Robust to outliers and mixed feature types." },
    { name: "XGBoost", value: "89%", tag: "Excellent", isBest: false, reason: "Fast, strong on structured tabular data." },
    { name: "Gradient Boosting", value: "87%", tag: "Very Good", isBest: false, reason: "Handles nonlinear relationships well." },
    { name: "Linear Regression", value: "74%", tag: "Good", isBest: false, reason: "Simple baseline, less robust to outliers." },
    { name: "SVR", value: "68%", tag: "Average", isBest: false, reason: "Sensitive to feature scaling on this data." },
  ],
  charts: [
    { key: "mock-donut", title: "Target Distribution", node: <DonutChart /> },
    { key: "mock-fi", title: "Feature Importance", node: <FeatureImportanceChart /> },
    { key: "mock-scatter", title: "Actual vs Predicted", node: <ScatterChart /> },
    { key: "mock-resid", title: "Residuals Distribution", node: <ResidualsChart /> },
    { key: "mock-heat", title: "Correlation Heatmap", node: <HeatmapChart /> },
    { key: "mock-box", title: "Prediction Error", node: <BoxPlotChart /> },
  ],
  quality: {
    score: 92,
    issues: ["Two features are highly correlated (>0.85)", "Minor class imbalance in a categorical column"],
    components: [
      { label: "Missing values", value: 95 },
      { label: "Duplicates", value: 98 },
      { label: "Outliers", value: 88 },
      { label: "Feature quality", value: 93 },
      { label: "Balance", value: 84 },
    ],
  },
  cleaning: {
    rowsRemoved: 6,
    duplicatesRemoved: 6,
    outliersCapped: 22,
    columnsEncoded: 4,
    droppedColumns: ["Customer_ID"],
  },
  correlations: [
    { a: "Ad_Spend", b: "Revenue", value: 0.91 },
    { a: "Store_Size", b: "Foot_Traffic", value: 0.87 },
  ],
  stats: [
    { column: "Revenue", mean: 4820.5, median: 4600, std: 980.2, min: 120, max: 12500 },
    { column: "Ad_Spend", mean: 1200.4, median: 1100, std: 340.1, min: 50, max: 5200 },
    { column: "Foot_Traffic", mean: 860.2, median: 820, std: 210.7, min: 40, max: 2100 },
  ],
  warnings: ["Two highly correlated feature pairs detected", "One categorical column has high cardinality"],
};

// --------------------------- real-data transforms ---------------------------

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function round(n: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/** Placeholder `best` block for invalid datasets. Never rendered -- the
 * invalidMessage branch in ResultsView returns before touching `best`. */
const EMPTY_BEST: ResultsVM["best"] = {
  recommendedLabel: "",
  name: "",
  badge: "",
  description: "",
  scoreLabel: "",
  scoreValue: "",
  scoreCaption: "",
  gaugeFill: 0,
  scaleLeft: "",
  scaleRight: "",
};

const ALLOWED_ASSET_PREFIXES = ["/charts/", "/download/"] as const;

/** Resolve backend asset paths only when they are known safe chart/download URLs. */
function safeResolveAssetUrl(path: string): string | undefined {
  const trimmed = path.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("blob:")
  ) {
    return undefined;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const base = new URL(apiBase);
      if (url.origin !== base.origin) return undefined;
      if (url.pathname.includes("..")) return undefined;
      if (!ALLOWED_ASSET_PREFIXES.some((p) => url.pathname.startsWith(p))) {
        return undefined;
      }
      return url.toString();
    } catch {
      return undefined;
    }
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (normalized.includes("..") || normalized.includes("\\")) return undefined;
  if (!ALLOWED_ASSET_PREFIXES.some((p) => normalized.startsWith(p))) {
    return undefined;
  }
  return resolveAssetUrl(normalized);
}

/** Turn a generated chart filename into a human-readable title. */
function chartTitle(path: string): string {
  const file = path.split("/").pop()?.replace(/\.png$/i, "") ?? path;
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
function confidenceToFill(label?: string | null): number {
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

const QUALITY_COMPONENT_LABELS: Record<string, string> = {
  missing_values: "Missing values",
  duplicates: "Duplicates",
  outliers: "Outliers",
  feature_quality: "Feature quality",
  class_balance: "Balance",
};

/** Extract the top N correlated feature pairs above a threshold, excluding
 * self-pairs and duplicate (a,b)/(b,a) pairs. */
function topCorrelations(
  matrix: Record<string, Record<string, number>> | null | undefined,
  threshold = 0.75,
  limit = 6,
): CorrelationVM[] {
  if (!matrix) return [];
  const seen = new Set<string>();
  const pairs: CorrelationVM[] = [];
  for (const a of Object.keys(matrix)) {
    for (const b of Object.keys(matrix[a] ?? {})) {
      if (a === b) continue;
      const key = [a, b].sort().join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      const value = matrix[a][b];
      if (typeof value !== "number" || Number.isNaN(value)) continue;
      if (Math.abs(value) >= threshold) {
        pairs.push({ a, b, value: round(value, 2) });
      }
    }
  }
  return pairs.sort((x, y) => Math.abs(y.value) - Math.abs(x.value)).slice(0, limit);
}

function buildRealVM(data: ValidatedResults): ResultsVM {
  const rec = data.recommendations;
  const rows = data.profile?.shape.rows ?? 0;
  const cols = data.profile?.shape.columns ?? 0;

  // Failure gate (Bug 1 + Bug 4): if the backend flagged this dataset as
  // unusable, surface the real validation error and render NOTHING else.
  const validity = data.data_validity;
  const invalidByGate = validity != null && validity.valid === false;
  const invalidByRec = rec?.problem_type === "invalid";
  if (invalidByGate || invalidByRec) {
    const message =
      validity?.errors?.[0] ??
      rec?.detection_reasoning ??
      "This dataset can't be analyzed. It doesn't contain data a predictive model can learn from.";
    return {
      isReal: true,
      filename: `${data.file_id}.csv`,
      rows: formatNumber(rows),
      cols: String(cols),
      invalidMessage: message,
      best: EMPTY_BEST,
      models: [],
      charts: [],
    };
  }

  const ranked = rec?.ranked_models ?? [];
  const top = ranked[0];
  const topFill = confidenceToFill(top?.confidence);

  const problem = rec?.problem_type ?? "unknown";
  const target = rec?.target_column ?? undefined;
  const caption = target ? `${problem} · target: ${target}` : problem;

  const charts: ChartVM[] = [];
  for (const path of data.charts ?? []) {
    const url = safeResolveAssetUrl(path);
    if (!url) continue;
    charts.push({ key: path, title: chartTitle(path), url });
  }

  // --- Dataset overview -------------------------------------------------
  const profile = data.profile;
  const missingTotal = profile?.missing_values
    ? Object.values(profile.missing_values).reduce((sum, v) => sum + v, 0)
    : undefined;
  const outliersTotal = profile?.outliers
    ? Object.values(profile.outliers).reduce((sum, o) => sum + (o?.count ?? 0), 0)
    : undefined;
  const numericFeatures = profile?.numeric_summary
    ? Object.keys(profile.numeric_summary).length
    : undefined;
  const categoricalFeatures = profile?.categorical_summary
    ? Object.keys(profile.categorical_summary).length
    : undefined;

  const overview: OverviewVM | undefined = profile
    ? {
        problemType: rec?.problem_type ?? undefined,
        target,
        numericFeatures,
        categoricalFeatures,
        missingTotal,
        duplicates: profile.duplicates ?? undefined,
        outliersTotal,
      }
    : undefined;

  // --- Quality ------------------------------------------------------------
  const quality: QualityVM | undefined = data.quality_score
    ? {
        score: data.quality_score.quality_score,
        issues: data.quality_score.issues ?? [],
        components: data.quality_score.components
          ? Object.entries(data.quality_score.components).map(([key, value]) => ({
              label: QUALITY_COMPONENT_LABELS[key] ?? key,
              value,
            }))
          : undefined,
      }
    : undefined;

  // --- Cleaning report ------------------------------------------------------
  const cs = data.cleaning_summary;
  const cleaning: CleaningVM | undefined = cs
    ? {
        rowsRemoved: cs.rows_removed ?? undefined,
        duplicatesRemoved: cs.duplicates_removed ?? undefined,
        outliersCapped: cs.outliers_capped ?? undefined,
        columnsEncoded: cs.columns_encoded ?? undefined,
        droppedColumns: cs.dropped_columns ?? undefined,
      }
    : undefined;

  // --- Correlation highlights -----------------------------------------------
  const correlations = topCorrelations(profile?.correlations);

  // --- Statistical summary ---------------------------------------------------
  const stats: StatRowVM[] | undefined = profile?.numeric_summary
    ? Object.entries(profile.numeric_summary).map(([column, s]) => ({
        column,
        mean: s.mean ?? undefined,
        median: s.median ?? undefined,
        std: s.std ?? undefined,
        min: s.min ?? undefined,
        max: s.max ?? undefined,
      }))
    : undefined;

  // --- Warnings ---------------------------------------------------------------
  const warnings = [
    ...(validity?.warnings ?? []),
    ...(rec?.warnings ?? []),
  ];

  return {
    isReal: true,
    filename: `${data.file_id}.csv`,
    rows: formatNumber(rows),
    cols: String(cols),
    executiveSummary: data.report || undefined,
    overview,
    best: {
      recommendedLabel: "Recommended Model",
      name: rec?.top_recommendation ?? "No recommendation",
      badge: "Best Fit",
      description: rec?.detection_reasoning || "No detection reasoning available.",
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
      reason: m.reason || undefined,
    })),
    charts,
    downloadHref: data.cleaned_file ? safeResolveAssetUrl(data.cleaned_file) : undefined,
    quality,
    cleaning,
    correlations: correlations.length > 0 ? correlations : undefined,
    stats,
    warnings: warnings.length > 0 ? warnings : undefined,
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

// --------------------------- chart image (real) -----------------------------

function ChartImage({ title, url }: { title: string; url: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className="flex h-48 w-full flex-col items-center justify-center text-center"
        role="img"
        aria-label={`${title}: chart unavailable`}
      >
        <p className="text-xs text-muted">Chart unavailable</p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={title}
      className="w-full rounded-[10px] border border-line"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

// --------------------------- small presentational bits ----------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 font-display text-lg font-bold text-ink">{children}</h2>;
}

function StatCell({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined) return null;
  return (
    <div>
      <div className="label-mono text-[10px]">{label}</div>
      <div className="mt-1 font-display text-xl font-bold text-ink">{value}</div>
    </div>
  );
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped >= 80 ? "#3f9d54" : clamped >= 60 ? "#f4c542" : "#c05a44";
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-bold text-ink">{clamped}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-pill bg-cream-sunken">
        <div className="h-full rounded-pill" style={{ width: `${clamped}%`, background: color }} />
      </div>
    </div>
  );
}

// --------------------------- presentational view ----------------------------

function ResultsView({ vm }: { vm: ResultsVM }) {
  // Invalid-dataset state (Bug 1 + Bug 4): render ONLY the failure message and
  // a "Try a different file" action.
  if (vm.invalidMessage) {
    return (
      <div
        className="mb-16 mt-6 rounded-[16px] border px-6 py-12 text-center"
        style={{ borderColor: "#e6cfc8", backgroundColor: "#f8eeeb" }}
        role="alert"
      >
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "#c05a44" }}
          aria-hidden="true"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="8" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <h1 className="display-heading mt-6 text-3xl sm:text-4xl">This dataset can&apos;t be analyzed</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted">{vm.invalidMessage}</p>
        <p className="mt-2 text-xs text-muted">File: {vm.filename}</p>
        <Link href="/upload" className="btn btn-yellow mt-8 inline-flex">Try a different file</Link>
      </div>
    );
  }

  const showConfidenceArrow = vm.best.scoreValue !== "—";

  return (
    <>
      {/* Success banner */}
      <div
        className="mt-6 flex items-center justify-between rounded-[16px] border px-6 py-5"
        style={{ borderColor: "#cfe3c8", backgroundColor: "#eef6e9" }}
      >
        <div className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "#3f9d54" }} aria-hidden="true">
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

      {/* Executive summary (LLM `report` text) */}
      {vm.executiveSummary && (
        <div className="card-elevated mt-6 p-6">
          <div className="label-mono text-[10px]">Executive Summary</div>
          <p className="mt-3 text-sm leading-relaxed text-ink">{vm.executiveSummary}</p>
        </div>
      )}

      {/* Dataset overview */}
      {vm.overview && (
        <div className="card-elevated mt-6 grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
          <StatCell label="Problem Type" value={vm.overview.problemType ? cap(vm.overview.problemType) : undefined} />
          <StatCell label="Target" value={vm.overview.target} />
          <StatCell label="Numeric Features" value={vm.overview.numericFeatures} />
          <StatCell label="Categorical Features" value={vm.overview.categoricalFeatures} />
          <StatCell label="Missing Values" value={vm.overview.missingTotal !== undefined ? formatNumber(vm.overview.missingTotal) : undefined} />
          <StatCell label="Duplicates" value={vm.overview.duplicates !== undefined ? formatNumber(vm.overview.duplicates) : undefined} />
          <StatCell label="Outliers" value={vm.overview.outliersTotal !== undefined ? formatNumber(vm.overview.outliersTotal) : undefined} />
        </div>
      )}

      {/* Data quality score */}
      {vm.quality && (
        <div className="card-elevated mt-6 flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
                style={{
                  background:
                    vm.quality.score >= 80 ? "#3f9d54" : vm.quality.score >= 60 ? "#f4c542" : "#c05a44",
                }}
                aria-label={`Data quality score ${vm.quality.score}`}
              >
                {vm.quality.score}
              </div>
              <div>
                <div className="label-mono text-[10px]">Data Quality Score</div>
                <div className="font-display text-lg font-bold text-ink">
                  {vm.quality.score >= 80 ? "Good" : vm.quality.score >= 60 ? "Fair" : "Needs attention"}
                </div>
              </div>
            </div>
            {vm.quality.issues.length > 0 && (
              <ul className="flex flex-1 flex-col gap-1">
                {vm.quality.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-muted">• {issue}</li>
                ))}
              </ul>
            )}
          </div>

          {vm.quality.components && vm.quality.components.length > 0 && (
            <div className="grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-5">
              {vm.quality.components.map((c) => (
                <ProgressBar key={c.label} label={c.label} value={c.value} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cleaning report */}
      {vm.cleaning && (
        <>
          <SectionHeading>Cleaning Report</SectionHeading>
          <div className="card-elevated mt-5 grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
            <StatCell label="Rows Removed" value={vm.cleaning.rowsRemoved} />
            <StatCell label="Duplicates Removed" value={vm.cleaning.duplicatesRemoved} />
            <StatCell label="Outliers Capped" value={vm.cleaning.outliersCapped} />
            <StatCell label="Columns Encoded" value={vm.cleaning.columnsEncoded} />
          </div>
          {vm.cleaning.droppedColumns && vm.cleaning.droppedColumns.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              Dropped identifier columns: {vm.cleaning.droppedColumns.join(", ")}
            </p>
          )}
        </>
      )}

      {/* Best model heading */}
      <h1 className="display-heading mt-12 text-4xl sm:text-5xl">
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
              {showConfidenceArrow && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3f9d54" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="19" x2="12" y2="6" />
                  <polyline points="6 12 12 6 18 12" />
                </svg>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">{vm.best.scoreCaption}</p>
          </div>

          {/* Gauge */}
          <div
            className="relative"
            role="img"
            aria-label={`${vm.best.scoreLabel}: ${vm.best.scoreValue}`}
          >
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
      <SectionHeading>Model Performance Comparison</SectionHeading>
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
      {vm.charts.length > 0 && (
        <>
          <SectionHeading>Visual Insights</SectionHeading>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {vm.charts.map((chart) => (
              <div key={chart.key} className="card !p-5">
                <div className="mb-4 text-center text-xs font-bold text-ink">{chart.title}</div>
                <div className="flex items-center justify-center">
                  {chart.url ? <ChartImage title={chart.title} url={chart.url} /> : chart.node}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Statistical summary */}
      {vm.stats && vm.stats.length > 0 && (
        <>
          <SectionHeading>Statistical Summary</SectionHeading>
          <div className="card-elevated mt-5 overflow-x-auto p-2">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="px-4 py-3 font-bold">Column</th>
                  <th className="px-4 py-3 font-bold">Mean</th>
                  <th className="px-4 py-3 font-bold">Median</th>
                  <th className="px-4 py-3 font-bold">Std Dev</th>
                  <th className="px-4 py-3 font-bold">Min</th>
                  <th className="px-4 py-3 font-bold">Max</th>
                </tr>
              </thead>
              <tbody>
                {vm.stats.map((s) => (
                  <tr key={s.column} className="border-t border-line">
                    <td className="px-4 py-3 font-bold text-ink">{s.column}</td>
                    <td className="px-4 py-3 text-ink">{fmt(s.mean)}</td>
                    <td className="px-4 py-3 text-ink">{fmt(s.median)}</td>
                    <td className="px-4 py-3 text-ink">{fmt(s.std)}</td>
                    <td className="px-4 py-3 text-ink">{fmt(s.min)}</td>
                    <td className="px-4 py-3 text-ink">{fmt(s.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Correlation highlights */}
      {vm.correlations && vm.correlations.length > 0 && (
        <>
          <SectionHeading>Correlation Highlights</SectionHeading>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {vm.correlations.map((c) => (
              <div key={`${c.a}-${c.b}`} className="card !p-4 flex items-center justify-between">
                <span className="text-sm text-ink">{c.a} ↔ {c.b}</span>
                <span className="font-display text-lg font-bold text-ink">{c.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">High correlation between features may indicate multicollinearity.</p>
        </>
      )}

      {/* Warnings */}
      {vm.warnings && vm.warnings.length > 0 && (
        <>
          <SectionHeading>Warnings</SectionHeading>
          <ul className="mt-4 flex flex-col gap-2">
            {vm.warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-[12px] border px-4 py-3 text-sm text-ink"
                style={{ borderColor: "#f0dfa8", backgroundColor: "#fdf6e3" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b8860b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {w}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Stopgap disclaimer. AI-generated model suggestions are heuristic (no
          model is trained -- CLAUDE.md §9), so they must not be read as
          professional advice. */}
      <p className="mt-8 text-center text-xs text-muted">
        AI-generated recommendations — not professional advice; verify before use.
      </p>

      {/* Download panel */}
      <div className="mb-16 mt-10 flex flex-col items-start justify-between gap-4 rounded-[16px] border border-line bg-cream-card px-8 py-7 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cream-sunken text-ink" aria-hidden="true">
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
          <a
            href={vm.downloadHref}
            download
            className="btn btn-yellow"
            aria-label={`Download cleaned dataset for ${vm.filename}`}
          >
            Download CSV
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11" />
              <polyline points="8 11 12 15 16 11" />
              <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
            </svg>
          </a>
        ) : (
          <button
            type="button"
            className="btn btn-yellow opacity-50 cursor-not-allowed"
            disabled
            aria-disabled="true"
            aria-label="Cleaned dataset unavailable"
          >
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

function fmt(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// ------------------------------- data loader --------------------------------

function mapLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 404:
        return "Analysis results not found. The analysis may have expired.";
      case 422:
        return "Dataset could not be processed. The file may be invalid.";
      case 500:
        return "Backend processing error. Please try again later.";
      default:
        return err.message || "Failed to load results.";
    }
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
}

function ResultsContent() {
  const params = useSearchParams();
  const fileId = params.get("file_id");

  const [vm, setVm] = useState<ResultsVM | null>(fileId ? null : MOCK_VM);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    setRetryToken((t) => t + 1);
  }, []);

  useEffect(() => {
    // Marketing preview (no file_id): always show the static mock, and clear
    // any error/real VM left over from a prior file_id in this session.
    if (!fileId) {
      setError(null);
      setVm(MOCK_VM);
      return;
    }
    // New file_id: wipe ALL prior state BEFORE the new response arrives, so no
    // charts/columns/model data from a previous upload can ever be visible.
    let active = true;
    setVm(null);
    setError(null);

    getResults(fileId)
      .then((raw) => {
        if (!active) return;
        const parsed = resultsResponseSchema.safeParse(raw);
        if (!parsed.success) {
          console.error("Invalid /results response shape:", parsed.error.issues);
          throw new Error("Backend returned unexpected data structure.");
        }
        setVm(buildRealVM(parsed.data));
      })
      .catch((err: unknown) => {
        if (active) setError(mapLoadError(err));
      });

    return () => {
      active = false;
    };
  }, [fileId, retryToken]);

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
          <div
            className="mt-6 rounded-[16px] border border-line bg-cream-card px-6 py-10 text-center"
            role="alert"
          >
            <p className="text-sm font-bold text-ink">Couldn&apos;t load results</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <div className="mt-6 flex justify-center gap-4">
              <button type="button" onClick={retry} className="btn btn-yellow">
                Retry
              </button>
              <Link href="/upload" className="btn">
                Upload a file
              </Link>
            </div>
          </div>
        ) : vm ? (
          <ResultsView vm={vm} />
        ) : (
          <div
            className="mt-6 rounded-[16px] border border-line bg-cream-card px-6 py-16 text-center"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
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