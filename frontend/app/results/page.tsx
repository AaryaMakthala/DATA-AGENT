"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { SiteNav, SiteFooter } from "@/components/SiteNav";
import { ApiError, getResults, resolveAssetUrl } from "@/lib/api";

/**
 * Results page — rewritten against the richer backend contract produced by
 * `app/services/response_builder.py` (build_final_response). Two modes:
 *
 *  - No `file_id` in the URL (marketing nav): renders STATIC MOCK data,
 *    shaped exactly like a real transformed ResultsVM, as a product preview.
 *  - `file_id` present: fetches GET /results/{file_id} and renders the full
 *    dashboard.
 *
 * VISUAL SYSTEM (v2): every surface uses the site's real signature — the
 * HARD OFFSET shadow (border-2 border-ink + box-shadow: Npx Npx 0 0 ink),
 * the same language as .btn / .pill-label / .table-wrap — via the shared
 * .card / .card-elevated classes in globals.css. Section headings follow
 * Home's eyebrow-label + big-serif-heading rhythm instead of small corner
 * labels. "Best fit" surfaces get a mustard-colored hard shadow (.card-accent)
 * instead of a colored border, so the all-ink-border rule stays intact.
 */

// ----------------------------- shared view-model -----------------------------

interface ReadinessBadgeVM {
  label: string;
  sublabel: string;
  score: number;
}

interface OverviewVM {
  datasetName: string;
  rows: number;
  columns: number;
  memoryUsage?: string;
  numericFeatures?: number;
  categoricalFeatures?: number;
  detectedTarget?: string;
  problemType?: string;
  processingStatus?: string;
  processingTimeSeconds?: number;
  readiness?: ReadinessBadgeVM;
}

interface HealthVM {
  health: string;
  score: number;
  explanation: string;
}

interface ExecutiveSummaryVM {
  overview: string;
  keyFindings: string[];
  risks: string[];
  recommendations: string[];
  isFallback: boolean;
}

interface QualityComponentVM {
  key: string;
  label: string;
  score: number;
  color: string;
  explanation: string;
}

interface QualityIssueVM {
  issue: string;
  severity: string;
  impact: string;
  recommendation: string;
}

interface QualityVM {
  score: number;
  status: string;
  sublabel: string;
  components: QualityComponentVM[];
  issues: QualityIssueVM[];
}

interface BeforeAfterRowVM {
  metric: string;
  before: number | string;
  after: number | string;
  difference: string;
  informational?: boolean;
}

interface TimelineItemVM {
  action: string;
  reason: string;
  confidence: string;
}

interface AIDecisionVM {
  decision: string;
  reason: string;
  confidence: string;
}

interface InsightVM {
  title: string;
  value: string;
  detail: string;
}

interface ChartVM {
  key: string;
  title: string;
  description?: string;
  interpretation?: string;
  chartType?: string;
  node?: React.ReactNode;
  url?: string;
}

interface ModelVM {
  name: string;
  confidence: string;
  reason: string;
  advantages: string[];
  disadvantages: string[];
  specs?: Record<string, string>;
  isBest: boolean;
}

interface WhyNotVM {
  model: string;
  explanation: string;
}

interface ReadinessRowVM {
  label: string;
  stars: number;
  display: string;
}

interface ProcessingMetricVM {
  label: string;
  seconds: number;
}

interface DownloadsVM {
  cleanedCsv?: string;
  analysisReport?: string;
  jsonResults?: string;
  chartsZip?: string;
  cleaningLog?: string;
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

interface BestModelVM {
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
}

interface ResultsVM {
  isReal: boolean;
  filename: string;
  rows: string;
  cols: string;
  invalidMessage?: string;
  overview?: OverviewVM;
  health?: HealthVM;
  executiveSummary?: ExecutiveSummaryVM;
  quality?: QualityVM;
  beforeAfter?: BeforeAfterRowVM[];
  timeline?: TimelineItemVM[];
  aiDecisions?: AIDecisionVM[];
  insights?: InsightVM[];
  best: BestModelVM;
  models: ModelVM[];
  whyNotOthers?: WhyNotVM[];
  readinessRows?: ReadinessRowVM[];
  charts: ChartVM[];
  processingMetrics?: ProcessingMetricVM[];
  downloads?: DownloadsVM;
  correlations?: CorrelationVM[];
  stats?: StatRowVM[];
  warnings?: string[];
}

// --------------------------- Zod response validation -------------------------
// Mirrors app/services/response_builder.build_final_response()'s output.
// Every field nullish -- a partially-rolled-out backend degrades gracefully.

const readinessBadgeSchema = z.object({
  label: z.string(),
  sublabel: z.string(),
  score: z.number(),
}).nullish();

const overviewSchema = z
  .object({
    dataset_name: z.string(),
    rows: z.number(),
    columns: z.number(),
    memory_usage: z.string().nullish(),
    numeric_features: z.number().nullish(),
    categorical_features: z.number().nullish(),
    detected_target: z.string().nullish(),
    problem_type: z.string().nullish(),
    processing_status: z.string().nullish(),
    processing_time_seconds: z.number().nullish(),
    readiness_badge: readinessBadgeSchema,
  })
  .passthrough()
  .nullish();

const healthSchema = z
  .object({ health: z.string(), score: z.number(), explanation: z.string() })
  .passthrough()
  .nullish();

const executiveSummarySchema = z
  .object({
    overview: z.string().nullish().transform((v) => v ?? ""),
    key_findings: z.array(z.string()).nullish().transform((v) => v ?? []),
    risks: z.array(z.string()).nullish().transform((v) => v ?? []),
    recommendations: z.array(z.string()).nullish().transform((v) => v ?? []),
    source: z.string().nullish(),
  })
  .passthrough()
  .nullish();

const insightSchema = z.object({
  icon: z.string().nullish(),
  title: z.string(),
  value: z.string(),
  detail: z.string(),
});

const qualityComponentSchema = z.object({
  key: z.string(),
  label: z.string(),
  score: z.number(),
  status_color: z.string().nullish(),
  explanation: z.string().nullish().transform((v) => v ?? ""),
});

const qualityIssueSchema = z.object({
  issue: z.string(),
  severity: z.string().nullish().transform((v) => v ?? "Medium"),
  impact: z.string().nullish().transform((v) => v ?? ""),
  recommendation: z.string().nullish().transform((v) => v ?? ""),
});

const qualitySchema = z
  .object({
    score: z.number(),
    dashboard: z
      .object({
        overall_score: z.number(),
        status: z.string(),
        sublabel: z.string().nullish().transform((v) => v ?? ""),
        components: z.array(qualityComponentSchema).nullish().transform((v) => v ?? []),
      })
      .passthrough()
      .nullish(),
    health: healthSchema,
    issues: z.array(qualityIssueSchema).nullish().transform((v) => v ?? []),
  })
  .passthrough()
  .nullish();

const beforeAfterRowSchema = z.object({
  metric: z.string(),
  before: z.union([z.number(), z.string()]),
  after: z.union([z.number(), z.string()]),
  difference: z.string(),
  informational: z.boolean().nullish().transform((v) => v ?? undefined),
});

const beforeAfterSchema = z
  .object({ table: z.array(beforeAfterRowSchema).nullish().transform((v) => v ?? []) })
  .passthrough()
  .nullish();

const timelineItemSchema = z.object({
  action: z.string(),
  reason: z.string().nullish().transform((v) => v ?? ""),
  confidence: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? "—" : String(v))),
});

const aiDecisionSchema = z.object({
  decision: z.string(),
  reason: z.string().nullish().transform((v) => v ?? ""),
  confidence: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? "—" : String(v))),
});

const cleaningSummarySchema = z
  .object({
    timeline: z.array(timelineItemSchema).nullish().transform((v) => v ?? []),
    ai_decisions: z.array(aiDecisionSchema).nullish().transform((v) => v ?? []),
  })
  .passthrough()
  .nullish();

const chartSchema = z.object({
  path: z.string().nullish(),
  chart_type: z.string().nullish(),
  title: z.string(),
  description: z.string().nullish(),
  interpretation: z.string().nullish(),
});

const modelSchema = z.object({
  model_name: z.string(),
  confidence: z.string().nullish().transform((v) => v ?? "—"),
  reason: z.string().nullish().transform((v) => v ?? ""),
  advantages: z.array(z.string()).nullish().transform((v) => v ?? []),
  disadvantages: z.array(z.string()).nullish().transform((v) => v ?? []),
  interpretability: z.string().nullish(),
  training_speed: z.string().nullish(),
  inference_speed: z.string().nullish(),
  handles_missing: z.string().nullish(),
  handles_outliers: z.string().nullish(),
  scalability: z.string().nullish(),
});

const whyNotSchema = z.object({ model: z.string(), explanation: z.string() });

const readinessDimSchema = z.object({ stars: z.number(), display: z.string() }).nullish();

const mlRecommendationSchema = z
  .object({
    problem_type: z.string().nullish(),
    target_column: z.string().nullish(),
    detection_reasoning: z.string().nullish().transform((v) => v ?? ""),
    top_recommendation: z.string().nullish(),
    models: z.array(modelSchema).nullish().transform((v) => v ?? []),
    why_not_others: z.array(whyNotSchema).nullish().transform((v) => v ?? []),
    readiness: z
      .object({
        business_intelligence: readinessDimSchema,
        machine_learning: readinessDimSchema,
        deep_learning: readinessDimSchema,
        visualization: readinessDimSchema,
        deployment: readinessDimSchema,
      })
      .passthrough()
      .nullish(),
    warnings: z.array(z.string()).nullish().transform((v) => v ?? []),
    excluded_columns: z.array(z.string()).nullish().transform((v) => v ?? []),
  })
  .passthrough()
  .nullish();

const downloadsSchema = z
  .object({
    cleaned_csv: z.string().nullish(),
    analysis_report: z.string().nullish(),
    json_results: z.string().nullish(),
    charts_zip: z.string().nullish(),
    cleaning_log: z.string().nullish(),
  })
  .passthrough()
  .nullish();

const processingMetricsSchema = z.record(z.number()).nullish();

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
    original_filename: z.string().nullish(),
    profile: z
      .object({
        shape: z.object({ rows: z.number(), columns: z.number() }),
        numeric_summary: z.record(numericStatSchema).nullish(),
        categorical_summary: z.record(z.unknown()).nullish(),
        missing_values: z.record(z.number()).nullish(),
        duplicates: z.number().nullish(),
        outliers: z.record(z.object({ count: z.number() }).passthrough()).nullish(),
        correlations: z.record(z.record(z.number())).nullish(),
      })
      .passthrough()
      .nullish(),
    data_validity: z
      .object({
        valid: z.boolean(),
        errors: z.array(z.string()).nullish().transform((v) => v ?? []),
        warnings: z.array(z.string()).nullish().transform((v) => v ?? []),
      })
      .passthrough()
      .nullish(),
    overview: overviewSchema,
    quality: qualitySchema,
    analysis: z
      .object({
        executive_summary: executiveSummarySchema,
        dataset_insights: z.array(insightSchema).nullish().transform((v) => v ?? []),
      })
      .passthrough()
      .nullish(),
    cleaning_summary: cleaningSummarySchema,
    before_after: beforeAfterSchema,
    visualizations: z
      .object({ charts: z.array(chartSchema).nullish().transform((v) => v ?? []) })
      .passthrough()
      .nullish(),
    ml_recommendation: mlRecommendationSchema,
    downloads: downloadsSchema,
    metadata: z
      .object({
        row_count: z.number().nullish(),
        column_count: z.number().nullish(),
        processing_metrics: processingMetricsSchema,
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

type ValidatedResults = z.infer<typeof resultsResponseSchema>;

// ------------------------------- mock charts (marketing preview only) -------

function DonutChart() {
  const segments = [
    { color: "var(--color-ink)", offset: 0, len: 45 },
    { color: "var(--color-mustard)", offset: 45, len: 32 },
    { color: "var(--color-cream-sunken)", offset: 77, len: 23 },
  ];
  const c = 2 * Math.PI * 40;
  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
        <g transform="rotate(-90 60 60)">
          {segments.map((s, i) => (
            <circle key={i} cx="60" cy="60" r="40" fill="none" stroke={s.color} strokeWidth="18"
              strokeDasharray={`${(s.len / 100) * c} ${c}`} strokeDashoffset={`${-(s.offset / 100) * c}`} />
          ))}
        </g>
      </svg>
      <ul className="space-y-2 text-xs text-muted">
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-ink/20" style={{ background: "var(--color-ink)" }} /> Low</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-ink/20" style={{ background: "var(--color-mustard)" }} /> Medium</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-ink/20" style={{ background: "var(--color-cream-sunken)" }} /> High</li>
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
          <rect x="52" y={12 + i * 26} width={(v / 100) * 150} height="12" rx="2" fill="var(--color-mustard)" />
        </g>
      ))}
    </svg>
  );
}

function HeatmapChart() {
  const palette = ["var(--color-cream-sunken)", "#e3d19b", "var(--color-mustard)", "#c9a13a", "var(--color-ink)"];
  const grid = [
    [4, 2, 3, 1, 0], [2, 4, 0, 3, 1], [3, 0, 4, 2, 1], [1, 3, 2, 4, 0], [0, 1, 1, 0, 4],
  ];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" aria-hidden="true">
      {grid.map((row, r) => row.map((v, cIdx) => (
        <rect key={`${r}-${cIdx}`} x={20 + cIdx * 34} y={10 + r * 26} width="32" height="24" fill={palette[v]} />
      )))}
    </svg>
  );
}

// -------------------------- shared color helpers -----------------------------
// The palette is intentionally small: ink + mustard for everything good or
// neutral (matching the rest of the site), and ONE red accent reserved for
// genuine problems — a low score or a high-severity issue — so it actually
// carries meaning instead of decorating half the page.

/** Accent color for a 0–100 score, used as TEXT/fill color, never as a
 * background behind white text (the old approach that made scores hard to
 * read and made the page feel like a muddy traffic-light dashboard). */
function scoreAccent(score: number): string {
  return score < 50 ? "var(--color-danger)" : "var(--color-mustard)";
}

function isHighSeverity(severity: string): boolean {
  return severity.toLowerCase() === "high";
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "<1s";
  if (seconds < 1) return "<1s";
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

// ------------------------------ mock view-model -----------------------------

const MOCK_VM: ResultsVM = {
  isReal: false,
  filename: "sales_data.csv",
  rows: "1,250",
  cols: "15",
  overview: {
    datasetName: "sales_data.csv",
    rows: 1250,
    columns: 15,
    memoryUsage: "~146.5 KB",
    numericFeatures: 11,
    categoricalFeatures: 4,
    detectedTarget: "Revenue",
    problemType: "regression",
    processingStatus: "Complete",
    processingTimeSeconds: 5.4,
    readiness: { label: "Excellent Dataset", sublabel: "Ready for Machine Learning", score: 92 },
  },
  health: { health: "Excellent", score: 92, explanation: "Data is clean, well-structured, and ready for modeling with minimal further work." },
  executiveSummary: {
    overview: "This dataset contains 1,250 sales records with 15 columns and is well suited to a regression problem predicting revenue.",
    keyFindings: ["Data quality is good (92/100).", "Ad_Spend and Revenue are strongly correlated (0.91)."],
    risks: ["Two highly correlated feature pairs may introduce multicollinearity."],
    recommendations: ["Random Forest is recommended given the mix of numeric and categorical features."],
    isFallback: false,
  },
  quality: {
    score: 92, status: "Excellent", sublabel: "Ready for ML",
    components: [
      { key: "missing_values", label: "Missing values", score: 95, color: scoreAccent(95), explanation: "Only 1.2% of cells are missing." },
      { key: "duplicates", label: "Duplicates", score: 98, color: scoreAccent(98), explanation: "0.5% of rows are exact duplicates." },
      { key: "outliers", label: "Outliers", score: 88, color: scoreAccent(88), explanation: "3.4% of numeric values fall outside the IQR fences." },
      { key: "feature_quality", label: "Feature quality", score: 93, color: scoreAccent(93), explanation: "1 of 15 columns was an identifier and carried no modeling signal." },
      { key: "class_balance", label: "Balance", score: 84, color: scoreAccent(84), explanation: "Not applicable for a regression target." },
    ],
    issues: [
      { issue: "Two features are highly correlated (>0.85)", severity: "Medium", impact: "May inflate the apparent importance of one feature over the other.", recommendation: "Consider dropping one of the pair before modeling." },
      { issue: "Minor class imbalance in a categorical column", severity: "Medium", impact: "Rare categories may be under-learned.", recommendation: "Group rare categories or use weighted sampling." },
    ],
  },
  beforeAfter: [
    { metric: "Rows", before: 1250, after: 1244, difference: "-6" },
    { metric: "Missing values", before: 38, after: 0, difference: "-38" },
    { metric: "Outliers", before: 22, after: 9, difference: "-13" },
    { metric: "Columns encoded", before: 4, after: 4, difference: "0" },
  ],
  timeline: [
    { action: "Dropped identifier column 'Customer_ID'", reason: "Unique identifier column that does not contribute meaningful information for machine learning.", confidence: "High" },
    { action: "Filled missing values using median for 'Ad_Spend'", reason: "Distribution contains outliers, so median is more robust than mean.", confidence: "95%" },
    { action: "Removed 6 duplicate rows", reason: "Exact duplicate rows add no new information and can bias model training.", confidence: "High" },
    { action: "Capped outliers on 'Revenue'", reason: "Extreme values likely reflect legitimate large orders rather than data errors.", confidence: "82%" },
  ],
  aiDecisions: [
    { decision: "Median Imputation on 'Ad_Spend'", reason: "Distribution contains outliers, so median is more robust than mean.", confidence: "95%" },
    { decision: "Cap Outliers on 'Revenue'", reason: "Extreme values likely reflect legitimate large orders rather than data errors.", confidence: "82%" },
  ],
  insights: [
    { title: "Strongest Correlation", value: "Ad_Spend & Revenue", detail: "Correlation coefficient of 0.91." },
    { title: "Biggest Missing Column", value: "Store_Size", detail: "3.0% of values are missing." },
    { title: "Largest Outlier Count", value: "Revenue", detail: "14 values fall outside the IQR fences." },
  ],
  best: {
    recommendedLabel: "Recommended Model",
    name: "Random Forest Regressor",
    badge: "Best Fit",
    description: "This model performed the best on your dataset based on the heuristic ranking below.",
    scoreLabel: "Confidence",
    scoreValue: "High",
    scoreCaption: "regression · target: Revenue",
    gaugeFill: 0.9,
    scaleLeft: "Low",
    scaleRight: "High",
  },
  models: [
    { name: "Random Forest Regressor", confidence: "High", reason: "Robust to outliers and mixed feature types; a low-maintenance baseline.", advantages: ["Robust, low-maintenance baseline", "Built-in feature importances"], disadvantages: ["Larger model size", "Less interpretable than linear models"], specs: { Interpretability: "Medium", "Training speed": "Fast", Scalability: "Good" }, isBest: true },
    { name: "XGBoost Regressor", confidence: "Medium-High", reason: "Excels on large datasets; handles mixed categorical/numeric features well.", advantages: ["Excellent accuracy on large tabular data", "Handles missing values natively"], disadvantages: ["More hyperparameters to tune", "Can overfit small datasets"], specs: { Interpretability: "Medium", "Training speed": "Fast", Scalability: "Excellent" }, isBest: false },
    { name: "Gradient Boosting Regressor", confidence: "Medium", reason: "Strong on structured tabular data with non-linear relationships.", advantages: ["Strong accuracy on structured data", "Captures non-linear relationships"], disadvantages: ["Slower to train", "Sensitive to hyperparameters"], specs: { Interpretability: "Medium", "Training speed": "Medium", Scalability: "Medium" }, isBest: false },
    { name: "Linear Regression", confidence: "Medium-Low", reason: "A simple, interpretable baseline; more sensitive to the outliers in this dataset.", advantages: ["Highly interpretable coefficients", "Fast to train and deploy"], disadvantages: ["Assumes a linear relationship", "Sensitive to outliers"], specs: { Interpretability: "Excellent", "Training speed": "Very Fast", Scalability: "Excellent" }, isBest: false },
  ],
  whyNotOthers: [
    { model: "XGBoost Regressor", explanation: "Ranked below Random Forest (Medium-High confidence): the small-to-medium dataset gives this data-hungry booster less room to shine." },
    { model: "Linear Regression", explanation: "Ranked below Random Forest (Medium-Low confidence): more sensitive to the outliers detected in this dataset." },
  ],
  readinessRows: [
    { label: "Business Intelligence", stars: 5, display: "★★★★★" },
    { label: "Machine Learning", stars: 5, display: "★★★★★" },
    { label: "Deep Learning", stars: 3, display: "★★★☆☆" },
    { label: "Visualization", stars: 5, display: "★★★★★" },
    { label: "Deployment", stars: 4, display: "★★★★☆" },
  ],
  charts: [
    { key: "mock-donut", title: "Target Distribution", description: "Spread of the Revenue target across low/medium/high bands.", node: <DonutChart /> },
    { key: "mock-fi", title: "Feature Importance (proxy)", description: "Correlation-based proxy for feature relevance.", node: <FeatureImportanceChart /> },
    { key: "mock-heat", title: "Correlation Heatmap", description: "Pairwise correlation across numeric columns.", node: <HeatmapChart /> },
  ],
  processingMetrics: [
    { label: "Profiling", seconds: 0.4 },
    { label: "LLM Analysis", seconds: 1.6 },
    { label: "Cleaning", seconds: 1.1 },
    { label: "Charts", seconds: 1.2 },
    { label: "ML Recommend", seconds: 0.7 },
    { label: "Total", seconds: 5.4 },
  ],
  downloads: { cleanedCsv: "#", analysisReport: "#", jsonResults: "#", chartsZip: "#", cleaningLog: "#" },
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

const EMPTY_BEST: ResultsVM["best"] = {
  recommendedLabel: "", name: "", badge: "", description: "", scoreLabel: "",
  scoreValue: "", scoreCaption: "", gaugeFill: 0, scaleLeft: "", scaleRight: "",
};

const ALLOWED_ASSET_PREFIXES = ["/charts/", "/download/"] as const;

function safeResolveAssetUrl(path: string): string | undefined {
  const trimmed = path.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:") || lower.startsWith("blob:")) {
    return undefined;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const base = new URL(apiBase);
      if (url.origin !== base.origin) return undefined;
      if (url.pathname.includes("..")) return undefined;
      if (!ALLOWED_ASSET_PREFIXES.some((p) => url.pathname.startsWith(p))) return undefined;
      return url.toString();
    } catch {
      return undefined;
    }
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (normalized.includes("..") || normalized.includes("\\")) return undefined;
  if (!ALLOWED_ASSET_PREFIXES.some((p) => normalized.startsWith(p))) return undefined;
  return resolveAssetUrl(normalized);
}

function chartTitleFromPath(path: string): string {
  const file = path.split("/").pop()?.replace(/\.png$/i, "") ?? path;
  const parts = file.split("_");
  const kind = parts[1];
  const rest = parts.slice(2);
  if (kind === "bar" || kind === "hist") return `${rest.join(" ")} Distribution`;
  if (kind === "scatter") return `${rest[0]} vs ${rest[1]}`;
  if (kind === "correlation") return "Correlation Heatmap";
  return rest.join(" ") || file;
}

function confidenceToFill(label?: string | null): number {
  switch ((label ?? "").trim().toLowerCase()) {
    case "high": return 0.9;
    case "medium-high": return 0.72;
    case "medium": return 0.55;
    case "medium-low": return 0.42;
    case "low": return 0.3;
    default: return 0.6;
  }
}

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
      if (Math.abs(value) >= threshold) pairs.push({ a, b, value: round(value, 2) });
    }
  }
  return pairs.sort((x, y) => Math.abs(y.value) - Math.abs(x.value)).slice(0, limit);
}

const METRIC_LABELS: Record<string, string> = {
  profiling: "Profiling",
  target_detection: "Target Detection",
  validation: "Validation",
  analyzing: "LLM Analysis",
  cleaning: "Cleaning",
  cleaning_profile: "Cleaning Profile",
  generating_charts: "Charts",
  recommending_models: "ML Recommend",
  total_time: "Total",
};

function buildRealVM(data: ValidatedResults): ResultsVM {
  const rec = data.ml_recommendation;
  const rows = data.overview?.rows ?? data.profile?.shape.rows ?? data.metadata?.row_count ?? 0;
  const cols = data.overview?.columns ?? data.profile?.shape.columns ?? data.metadata?.column_count ?? 0;
  const filename =
    data.original_filename ??
    data.overview?.dataset_name ??
    `${data.file_id}.csv`;

  const validity = data.data_validity;
  const invalidByGate = validity != null && validity.valid === false;
  const invalidByRec = rec?.problem_type === "invalid";
  if (invalidByGate || invalidByRec) {
    const message =
      validity?.errors?.[0] ??
      rec?.detection_reasoning ??
      "This dataset can't be analyzed. It doesn't contain data a predictive model can learn from.";
    return {
      isReal: true, filename, rows: formatNumber(rows), cols: String(cols),
      invalidMessage: message, best: EMPTY_BEST, models: [], charts: [],
    };
  }

  const overview: OverviewVM | undefined = data.overview
    ? {
        datasetName: data.overview.dataset_name,
        rows: data.overview.rows,
        columns: data.overview.columns,
        memoryUsage: data.overview.memory_usage ?? undefined,
        numericFeatures: data.overview.numeric_features ?? undefined,
        categoricalFeatures: data.overview.categorical_features ?? undefined,
        detectedTarget: data.overview.detected_target ?? undefined,
        problemType: data.overview.problem_type ?? undefined,
        processingStatus: data.overview.processing_status ?? undefined,
        processingTimeSeconds: data.overview.processing_time_seconds ?? undefined,
        readiness: data.overview.readiness_badge ?? undefined,
      }
    : undefined;

  const rawHealth: HealthVM | undefined = data.quality?.health ?? undefined;

  const es = data.analysis?.executive_summary;
  const executiveSummary: ExecutiveSummaryVM | undefined = es
    ? {
        overview: es.overview ?? "",
        keyFindings: es.key_findings ?? [],
        risks: es.risks ?? [],
        recommendations: es.recommendations ?? [],
        isFallback: es.source === "fallback_unstructured",
      }
    : undefined;

  const insights: InsightVM[] | undefined = data.analysis?.dataset_insights?.length
    ? data.analysis.dataset_insights.map((i) => ({ title: i.title, value: i.value, detail: i.detail }))
    : undefined;

  const quality: QualityVM | undefined = data.quality
    ? {
        score: data.quality.score,
        status: data.quality.dashboard?.status ?? (data.quality.score >= 80 ? "Good" : data.quality.score >= 60 ? "Fair" : "Needs attention"),
        sublabel: data.quality.dashboard?.sublabel ?? "",
        components: (data.quality.dashboard?.components ?? []).map((c) => ({
          key: c.key, label: c.label, score: c.score, color: scoreAccent(c.score), explanation: c.explanation,
        })),
        issues: (data.quality.issues ?? []).map((i) => ({
          issue: i.issue, severity: i.severity, impact: i.impact, recommendation: i.recommendation,
        })),
      }
    : undefined;

  const beforeAfter: BeforeAfterRowVM[] | undefined = data.before_after?.table?.length
    ? data.before_after.table
    : undefined;

  const timeline: TimelineItemVM[] | undefined = data.cleaning_summary?.timeline?.length
    ? data.cleaning_summary.timeline.map((t) => ({ action: t.action, reason: t.reason, confidence: t.confidence }))
    : undefined;
  const aiDecisions: AIDecisionVM[] | undefined = data.cleaning_summary?.ai_decisions?.length
    ? data.cleaning_summary.ai_decisions.map((d) => ({ decision: d.decision, reason: d.reason, confidence: d.confidence }))
    : undefined;

  const chartsFromManifest: ChartVM[] = (data.visualizations?.charts ?? [])
    .map((c, idx) => {
      const url = c.path ? safeResolveAssetUrl(c.path) : undefined;
      return {
        key: c.path ?? `${c.title}-${idx}`,
        title: c.title || (c.path ? chartTitleFromPath(c.path) : `Chart ${idx + 1}`),
        description: c.description ?? undefined,
        interpretation: c.interpretation ?? undefined,
        chartType: c.chart_type ?? undefined,
        url,
      };
    })
    .filter((c) => c.url !== undefined || c.title);

  const ranked = rec?.models ?? [];
  const top = ranked[0];
  const topFill = confidenceToFill(top?.confidence);
  const problem = rec?.problem_type ?? "unknown";
  const target = rec?.target_column ?? undefined;
  const caption = target ? `${problem} · target: ${target}` : problem;

  const models: ModelVM[] = ranked.map((m, i) => ({
    name: m.model_name,
    confidence: m.confidence,
    reason: m.reason,
    advantages: m.advantages,
    disadvantages: m.disadvantages,
    specs: {
      ...(m.interpretability ? { Interpretability: m.interpretability } : {}),
      ...(m.training_speed ? { "Training speed": m.training_speed } : {}),
      ...(m.inference_speed ? { "Inference speed": m.inference_speed } : {}),
      ...(m.scalability ? { Scalability: m.scalability } : {}),
      ...(m.handles_missing ? { "Handles missing": m.handles_missing } : {}),
      ...(m.handles_outliers ? { "Handles outliers": m.handles_outliers } : {}),
    },
    isBest: i === 0,
  }));

  const whyNotOthers: WhyNotVM[] | undefined = rec?.why_not_others?.length ? rec.why_not_others : undefined;

  const readinessMap = rec?.readiness;
  const readinessRows: ReadinessRowVM[] | undefined = readinessMap
    ? ([
        ["Business Intelligence", readinessMap.business_intelligence],
        ["Machine Learning", readinessMap.machine_learning],
        ["Deep Learning", readinessMap.deep_learning],
        ["Visualization", readinessMap.visualization],
        ["Deployment", readinessMap.deployment],
      ] as const)
        .filter(([, v]) => v != null)
        .map(([label, v]) => ({ label, stars: v!.stars, display: v!.display }))
    : undefined;

  const pm = data.metadata?.processing_metrics;
  const processingMetrics: ProcessingMetricVM[] | undefined = pm
    ? Object.entries(pm).map(([key, seconds]) => ({ label: METRIC_LABELS[key] ?? key, seconds }))
    : undefined;

  const dl = data.downloads;
  const downloads: DownloadsVM | undefined = dl
    ? {
        cleanedCsv: dl.cleaned_csv ? safeResolveAssetUrl(dl.cleaned_csv) : undefined,
        analysisReport: dl.analysis_report ? safeResolveAssetUrl(dl.analysis_report) : undefined,
        jsonResults: dl.json_results ? safeResolveAssetUrl(dl.json_results) : undefined,
        chartsZip: dl.charts_zip ? safeResolveAssetUrl(dl.charts_zip) : undefined,
        cleaningLog: dl.cleaning_log ? safeResolveAssetUrl(dl.cleaning_log) : undefined,
      }
    : undefined;

  const profile = data.profile;
  const correlations = topCorrelations(profile?.correlations);
  const excludedCols = new Set(rec?.excluded_columns ?? []);
  const stats: StatRowVM[] | undefined = profile?.numeric_summary
    ? Object.entries(profile.numeric_summary)
        .filter(([column]) => !excludedCols.has(column))
        .map(([column, s]) => ({
          column, mean: s.mean ?? undefined, median: s.median ?? undefined, std: s.std ?? undefined, min: s.min ?? undefined, max: s.max ?? undefined,
        }))
    : undefined;

  const warnings = [...(validity?.warnings ?? []), ...(rec?.warnings ?? [])];

  return {
    isReal: true,
    filename,
    rows: formatNumber(rows),
    cols: String(cols),
    overview,
    health: rawHealth,
    executiveSummary,
    quality,
    beforeAfter,
    timeline,
    aiDecisions,
    insights,
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
    models,
    whyNotOthers,
    readinessRows,
    charts: chartsFromManifest,
    processingMetrics,
    downloads,
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
      <div className="flex h-48 w-full flex-col items-center justify-center text-center" role="img" aria-label={`${title}: chart unavailable`}>
        <p className="text-xs text-muted">Chart unavailable</p>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={title} className="w-full rounded-[10px] border border-line" loading="lazy" onError={() => setHasError(true)} />
  );
}

// --------------------------- scroll-reveal wrapper ---------------------------

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// --------------------------- small presentational bits ----------------------

/** Home-style section header, but the eyebrow now renders as an actual
 * bordered pill with the site's signature hard-offset shadow and the same
 * up-left hover lift as every button/pill on the site (translate + shadow
 * grow on hover, press-down on click) — not just static mono text. */
/** Small generic glyph shown inside every section-heading button — keeps
 * headings from being pure text, per the "button format, not just text"
 * requirement, without needing a bespoke icon per section. */
function HeadingGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </svg>
  );
}

/** Section heading — rendered as an actual button (bright mustard fill, mono
 * font, ink border, hard black shadow, hover-lift + press animation exactly
 * matching .btn) rather than plain heading text. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-20">
      <div className="section-heading-btn" role="heading" aria-level={2}>
        <HeadingGlyph />
        {children}
      </div>
    </div>
  );
}

/** Small SVG glyph per model, chosen from the model name so the "Best Model"
 * section has real iconography rather than text-only cards. */
function ModelIcon({ name }: { name: string }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const n = name.toLowerCase();
  if (n.includes("forest") || n.includes("tree")) {
    return (
      <svg {...common}>
        <path d="M12 3l4 5H8l4-5z" />
        <path d="M12 8l5 6H7l5-6z" />
        <path d="M12 14v7" />
      </svg>
    );
  }
  if (n.includes("boost") || n.includes("gradient") || n.includes("xgb")) {
    return (
      <svg {...common}>
        <line x1="6" y1="20" x2="6" y2="12" />
        <line x1="12" y1="20" x2="12" y2="6" />
        <line x1="18" y1="20" x2="18" y2="10" />
      </svg>
    );
  }
  if (n.includes("regress") || n.includes("linear")) {
    return (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M6 15l4-4 3 3 6-7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  );
}

/** Trophy glyph used inside "Best Fit" pills so the recommendation is marked
 * with real iconography, not text alone. */
function TrophyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H4a1 1 0 0 0-1 1c0 2.5 1.5 4 4 4M17 5h3a1 1 0 0 1 1 1c0 2.5-1.5 4-4 4" />
    </svg>
  );
}

function StatCell({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined) return null;
  return (
    <div>
      <div className="label-mono text-[10px]">{label}</div>
      <div className="mt-1 font-mono text-lg font-bold tracking-tight text-ink">{value}</div>
    </div>
  );
}

function ProgressBar({ label, value, onClick, active }: { label: string; value: number; onClick?: () => void; active?: boolean }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = scoreAccent(clamped);
  return (
    <div className={onClick ? "cursor-pointer" : undefined} onClick={onClick}>
      <div className="flex items-center justify-between text-xs">
        <span className={active ? "font-bold text-ink" : "text-muted"}>{label}</span>
        <span className="font-bold text-ink">{clamped}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-pill border-2 border-ink bg-cream-sunken">
        <div className="h-full transition-all" style={{ width: `${clamped}%`, background: color }} />
      </div>
    </div>
  );
}

/** Bouncing "there's more below" cue — points at the full analysis + download
 * section further down the page and smooth-scrolls there on click. */
function ScrollCue() {
  const scrollToDownloads = () => {
    document.getElementById("download-center")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <button
      type="button"
      onClick={scrollToDownloads}
      className="group mx-auto mt-6 flex flex-col items-center gap-2 text-center"
      aria-label="Scroll to full analysis and downloads"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink transition-opacity group-hover:opacity-70">
        Know more about your data — full analysis &amp; every download is below
      </span>
      <span
        className="icon-badge animate-float"
        style={{ animationDuration: "2.2s" }}
        aria-hidden="true"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>
  );
}

/** Small download-icon svg reused by the two centered "download" buttons. */
function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" /><polyline points="8 11 12 15 16 11" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-cream-card text-ink shadow-[var(--shadow-hard-sm)] transition-all duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-mustard hover:shadow-[var(--shadow-hard)]"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="card-elevated w-full max-w-md !p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="label-mono text-[10px]">{title}</div>
          <CloseButton onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

// ------------------------- loading experience (analyzing) -------------------

const PIPELINE_STAGES = ["Uploading", "Profiling", "Analyzing", "Cleaning", "Generating Charts", "Recommending Models", "Complete"];

const LOADING_MESSAGES = [
  "Scanning columns…",
  "Detecting data types…",
  "Finding patterns…",
  "Training candidate models…",
  "Almost done…",
];

function SpinRing() {
  return (
    <svg viewBox="0 0 36 36" className="h-[72px] w-[72px] animate-spin-slow" style={{ animationDuration: "2.4s" }} aria-hidden="true">
      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-cream-sunken)" strokeWidth="4.5" />
      <circle
        cx="18" cy="18" r="14" fill="none" stroke="var(--color-mustard)" strokeWidth="4.5"
        strokeDasharray="40 88" strokeLinecap="round" transform="rotate(-90 18 18)"
      />
      <circle
        cx="18" cy="18" r="14" fill="none" stroke="var(--color-ink)" strokeWidth="4.5"
        strokeDasharray="18 88" strokeDashoffset="-52" strokeLinecap="round" transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

function LoadingExperience() {
  const [msgIndex, setMsgIndex] = useState(0);
  const currentStage = 2;

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1600);
    return () => clearInterval(id);
  }, []);

  return (
    <Reveal className="mt-6">
      <div className="card-elevated mx-auto max-w-md !p-8 text-center" role="status" aria-live="polite" aria-busy="true">
        <div className="flex justify-center">
          <SpinRing />
        </div>

        <h2 className="display-heading mt-5 text-2xl font-bold text-ink">Analyzing your dataset</h2>
        <p key={msgIndex} className="animate-fade-in-up mt-2 label-mono text-[11px]" style={{ animationDuration: "0.4s" }}>
          {LOADING_MESSAGES[msgIndex]}
        </p>

        <ol className="mx-auto mt-8 flex flex-col gap-2.5 text-left">
          {PIPELINE_STAGES.map((stage, i) => {
            const done = i < currentStage;
            const active = i === currentStage;
            return (
              <li key={stage} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${
                    done
                      ? "border-ink bg-ink text-white"
                      : active
                        ? "border-ink bg-mustard text-ink animate-pulse-soft"
                        : "border-line bg-cream-sunken text-muted"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={`text-xs ${done ? "text-ink" : active ? "font-bold text-ink" : "text-muted"}`}>
                  {stage}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Reveal>
  );
}

// --------------------------- presentational view ----------------------------

function ResultsView({ vm }: { vm: ResultsVM }) {
  const [openComponent, setOpenComponent] = useState<string | null>(null);
  const [chartModal, setChartModal] = useState<ChartVM | null>(null);

  if (vm.invalidMessage) {
    return (
      <Reveal className="mt-6">
        <div
          className="rounded-[24px] border-2 border-ink px-6 py-16 text-center shadow-[var(--shadow-hard)]"
          style={{ backgroundColor: "var(--color-danger-bg)" }}
          role="alert"
        >
          <div
            className="section-heading-btn mx-auto"
            style={{ backgroundColor: "var(--color-danger)", color: "#fff" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Analysis Failed
          </div>

          <span
            className="animate-pulse-soft mx-auto mt-7 flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink"
            style={{ background: "var(--color-danger)" }}
            aria-hidden="true"
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /><circle cx="12" cy="12" r="9" />
            </svg>
          </span>

          <h1 className="display-heading mt-6 text-3xl sm:text-4xl">This dataset can&apos;t be analyzed</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-ink/80">{vm.invalidMessage}</p>
          <span className="mt-3 inline-flex items-center rounded-pill border-2 border-ink bg-cream-card px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink shadow-[var(--shadow-hard-sm)]">
            File: {vm.filename}
          </span>

          <div className="mt-8">
            <Link href="/upload" className="btn btn-yellow group inline-flex !py-3.5 !px-7">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-cream-card transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-x-0.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="19 12 5 12" /><polyline points="12 19 5 12 12 5" />
                </svg>
              </span>
              Try a Different File
            </Link>
          </div>
        </div>
      </Reveal>
    );
  }

  const showConfidenceArrow = vm.best.scoreValue !== "—";

  return (
    <>
      {/* Dataset overview */}
      {vm.overview && (
        <Reveal className="mt-6">
          <div className="card-elevated !p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="eyebrow-pill">Dataset Overview</span>
                <div className="mt-1 font-mono text-xl font-bold tracking-tight text-ink">{vm.overview.datasetName}</div>
              </div>
              {vm.overview.readiness && (
                <div className="text-right">
                  <span className="pill-label">{vm.overview.readiness.label}</span>
                  <p className="mt-1.5 text-xs text-muted">{vm.overview.readiness.sublabel}</p>
                </div>
              )}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-6 border-t-2 border-line pt-6 sm:grid-cols-4 lg:grid-cols-6">
              <StatCell label="Rows" value={formatNumber(vm.overview.rows)} />
              <StatCell label="Columns" value={vm.overview.columns} />
              <StatCell label="Memory" value={vm.overview.memoryUsage} />
              <StatCell label="Numeric" value={vm.overview.numericFeatures} />
              <StatCell label="Categorical" value={vm.overview.categoricalFeatures} />
              <StatCell label="Target" value={vm.overview.detectedTarget ?? "—"} />
              <StatCell label="Problem Type" value={vm.overview.problemType ? cap(vm.overview.problemType) : undefined} />
              <StatCell label="Status" value={vm.overview.processingStatus} />
              <StatCell label="Processing Time" value={vm.overview.processingTimeSeconds !== undefined ? formatDuration(vm.overview.processingTimeSeconds) : undefined} />
            </div>

            {/* Centered download action at the bottom of this box only */}
            <div className="mt-6 flex justify-center border-t-2 border-line pt-6">
              {vm.downloads?.cleanedCsv ? (
                <a href={vm.downloads.cleanedCsv} download className="btn btn-yellow group !py-3.5 !px-7">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-cream-card transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-y-0.5">
                    <DownloadIcon />
                  </span>
                  Download Cleaned CSV
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => document.getElementById("download-center")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="btn btn-yellow group !py-3.5 !px-7"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-cream-card transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-y-0.5">
                    <DownloadIcon />
                  </span>
                  Download Cleaned CSV
                </button>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {/* Scroll cue — now sits right after the Dataset Overview box, pointing
          at the full analysis + downloads further down. Rendered directly
          (no Reveal wrapper): it's already in view on page load, so a
          scroll-triggered fade-in had nothing to trigger it. */}
      <ScrollCue />

      {/* Executive summary — 4-panel */}
      {vm.executiveSummary && (
        <>
          <Reveal><SectionHeading>Executive Summary</SectionHeading></Reveal>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: "Overview", body: vm.executiveSummary.overview ? <p className="mt-2 text-sm leading-relaxed text-ink">{vm.executiveSummary.overview}</p> : <p className="mt-2 text-sm text-muted">—</p> },
              { label: "Key Findings", body: vm.executiveSummary.keyFindings.length ? <ul className="mt-2 space-y-1.5 text-sm text-ink">{vm.executiveSummary.keyFindings.map((f, i) => <li key={i}>• {f}</li>)}</ul> : <p className="mt-2 text-sm text-muted">None flagged.</p> },
              { label: "Risks", body: vm.executiveSummary.risks.length ? <ul className="mt-2 space-y-1.5 text-sm text-ink">{vm.executiveSummary.risks.map((r, i) => <li key={i}>• {r}</li>)}</ul> : <p className="mt-2 text-sm text-muted">None flagged.</p> },
              { label: "Recommendations", body: vm.executiveSummary.recommendations.length ? <ul className="mt-2 space-y-1.5 text-sm text-ink">{vm.executiveSummary.recommendations.map((r, i) => <li key={i}>• {r}</li>)}</ul> : <p className="mt-2 text-sm text-muted">None flagged.</p> },
            ].map((panel, i) => (
              <Reveal key={panel.label} delay={i * 70}>
                <div className="card h-full">
                  <div className="label-mono text-[10px]">{panel.label}</div>
                  {panel.body}
                </div>
              </Reveal>
            ))}
          </div>
          {vm.executiveSummary.isFallback && (
            <p className="mt-3 text-xs text-muted">Summary shown as a single block — structured sections will populate once the backend returns them.</p>
          )}
        </>
      )}

      {/* Data quality dashboard */}
      {vm.quality && (
        <>
          <Reveal><SectionHeading>Data Quality Dashboard</SectionHeading></Reveal>
          <Reveal delay={60}>
            <div className="card-elevated mt-6 flex flex-col gap-6 !p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-ink font-display text-xl font-bold shadow-[var(--shadow-hard-sm)]"
                    style={{ color: scoreAccent(vm.quality.score) }}
                    aria-label={`Data quality score ${vm.quality.score}`}
                  >
                    {vm.quality.score}
                  </div>
                  <div>
                    <div className="label-mono text-[10px]">Data Quality Score</div>
                    <div className="font-display text-lg font-bold text-ink">{vm.quality.status}</div>
                    <p className="text-xs text-muted">{vm.quality.sublabel}</p>
                  </div>
                </div>
              </div>

              {vm.quality.components.length > 0 && (
                <div className="grid grid-cols-1 gap-4 border-t-2 border-line pt-5 sm:grid-cols-2 lg:grid-cols-5">
                  {vm.quality.components.map((c) => (
                    <div key={c.key}>
                      <ProgressBar
                        label={c.label}
                        value={c.score}
                        active={openComponent === c.key}
                        onClick={() => setOpenComponent(openComponent === c.key ? null : c.key)}
                      />
                      {openComponent === c.key && (
                        <p className="mt-2 text-[11px] leading-relaxed text-muted">{c.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Reveal>
        </>
      )}

      {/* Dataset health */}
      {vm.health && (
        <Reveal className="mt-6">
          <div className="card-elevated flex items-center gap-5 !p-6">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border-2 border-ink bg-ink font-display text-sm font-bold shadow-[var(--shadow-hard-sm)]"
              style={{ color: scoreAccent(vm.health.score) }}
            >
              {vm.health.score}
            </div>
            <div>
              <div className="label-mono text-[10px]">Dataset Health</div>
              <div className="font-display text-lg font-bold text-ink">{vm.health.health}</div>
              <p className="mt-1 text-xs text-muted">{vm.health.explanation}</p>
            </div>
          </div>
        </Reveal>
      )}

      {/* Before / after cleaning */}
      {vm.beforeAfter && vm.beforeAfter.length > 0 && (
        <>
          <Reveal><SectionHeading>Before vs. After Cleaning</SectionHeading></Reveal>
          <Reveal delay={40}>
            <p className="mt-3 text-xs text-muted">
              Outlier counts are independent IQR detections on each dataset — a different
              &ldquo;after&rdquo; count reflects re-measurement on the cleaned data, not damage from cleaning.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="table-wrap mt-5">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.beforeAfter.map((r) => (
                    <tr key={r.metric}>
                      <td className="font-bold text-ink">{r.metric}</td>
                      <td>{r.before}</td>
                      <td>{r.after}</td>
                      <td className="font-bold text-ink">{r.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </>
      )}

      {/* Cleaning timeline */}
      {vm.timeline && vm.timeline.length > 0 && (
        <>
          <Reveal><SectionHeading>Cleaning Timeline</SectionHeading></Reveal>
          <Reveal delay={60}>
            <div className="card-elevated mt-6 !p-6">
              <ol className="relative space-y-5 border-l-2 border-ink pl-6">
                {vm.timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span
                      className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-ink text-[10px] font-bold"
                      style={{ color: "var(--color-mustard)" }}
                    >✓</span>
                    <div className="text-sm font-bold text-ink">{t.action}</div>
                    {t.reason && <p className="mt-1 text-xs text-muted">{t.reason}</p>}
                    <span className="table-chip mt-2">confidence: {t.confidence}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </>
      )}

      {/* AI decisions */}
      {vm.aiDecisions && vm.aiDecisions.length > 0 && (
        <>
          <Reveal><SectionHeading>AI Decisions</SectionHeading></Reveal>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vm.aiDecisions.map((d, i) => (
              <Reveal key={i} delay={i * 60}>
                <div className="card h-full">
                  <span className="table-chip">{d.confidence} confidence</span>
                  <div className="mt-3 text-sm font-bold text-ink">{d.decision}</div>
                  <p className="mt-2 text-xs text-muted">{d.reason}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </>
      )}

      {/* Dataset insights */}
      {vm.insights && vm.insights.length > 0 && (
        <>
          <Reveal><SectionHeading>Dataset Insights</SectionHeading></Reveal>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vm.insights.map((ins, i) => (
              <Reveal key={i} delay={i * 60}>
                <div className="card h-full">
                  <div className="label-mono text-[10px]">{ins.title}</div>
                  <div className="mt-2 font-display text-base font-bold text-ink">{ins.value}</div>
                  <p className="mt-1 text-xs text-muted">{ins.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </>
      )}

      {/* Best model heading */}
      <Reveal>
        <div className="mt-20">
          <div className="section-heading-btn" role="heading" aria-level={1}>
            <TrophyIcon />
            Recommendation
          </div>
          <h1 className="display-heading mt-4 text-4xl sm:text-5xl">
            Best Model for <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[8px]">Your Dataset</span>
          </h1>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <div className="card-elevated card-accent mt-6 grid grid-cols-1 gap-8 !p-8 md:grid-cols-2">
          <div className="md:border-r-2 md:border-line md:pr-8">
            <div className="label-mono text-[10px]">{vm.best.recommendedLabel}</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="icon-chip !h-11 !w-11" aria-hidden="true"><ModelIcon name={vm.best.name} /></span>
              <span className="font-display text-2xl font-bold text-ink">{vm.best.name}</span>
              <span className="pill-label">
                <TrophyIcon />
                {vm.best.badge}
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm text-muted">{vm.best.description}</p>
          </div>
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="label-mono text-[10px]">{vm.best.scoreLabel}</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-display text-4xl font-bold text-ink">{vm.best.scoreValue}</span>
                {showConfidenceArrow && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="19" x2="12" y2="6" /><polyline points="6 12 12 6 18 12" />
                  </svg>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">{vm.best.scoreCaption}</p>
            </div>
            <div className="relative" role="img" aria-label={`${vm.best.scoreLabel}: ${vm.best.scoreValue}`}>
              <svg width="150" height="90" viewBox="0 0 150 90" aria-hidden="true">
                <path d="M12 82 A63 63 0 0 1 138 82" fill="none" stroke="var(--color-cream-sunken)" strokeWidth="16" strokeLinecap="round" />
                <path d={gaugePath(vm.best.gaugeFill)} fill="none" stroke="var(--color-mustard)" strokeWidth="16" strokeLinecap="round" />
              </svg>
              <div className="absolute inset-x-0 bottom-1 text-center font-display text-lg font-bold text-ink">{vm.best.scoreValue}</div>
              <div className="mt-1 flex justify-between text-[9px] text-muted"><span>{vm.best.scaleLeft}</span><span>{vm.best.scaleRight}</span></div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Model comparison — enriched cards */}
      <Reveal><SectionHeading>Model Comparison</SectionHeading></Reveal>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vm.models.map((m, i) => (
          <Reveal key={m.name} delay={i * 60}>
            <div className={`card h-full ${m.isBest ? "card-accent" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="icon-chip" aria-hidden="true"><ModelIcon name={m.name} /></span>
                  <div className="text-sm font-bold text-ink">{m.name}</div>
                </div>
                {m.isBest && (
                  <span className="pill-label !py-1 !px-2.5 !text-[9px]">
                    <TrophyIcon />
                    Best Fit
                  </span>
                )}
              </div>
              <div className="label-mono mt-1.5 text-[10px]">{m.confidence} confidence</div>
              <p className="mt-2 text-xs leading-relaxed text-muted">{m.reason}</p>
              {m.specs && Object.keys(m.specs).length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t-2 border-line pt-3 text-[10.5px]">
                  {Object.entries(m.specs).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-muted"><span>{k}</span><span className="text-ink">{v}</span></div>
                  ))}
                </div>
              )}
              {(m.advantages.length > 0 || m.disadvantages.length > 0) && (
                <div className="mt-3 grid grid-cols-2 gap-3 border-t-2 border-line pt-3 text-[10.5px]">
                  <div>
                    <div className="mb-1 label-mono text-[9px]">Pros</div>
                    <ul className="space-y-0.5 text-ink">{m.advantages.map((a, ai) => <li key={ai}>• {a}</li>)}</ul>
                  </div>
                  <div>
                    <div className="mb-1 label-mono text-[9px]">Cons</div>
                    <ul className="space-y-0.5" style={{ color: "var(--color-danger)" }}>{m.disadvantages.map((a, ai) => <li key={ai}>• {a}</li>)}</ul>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </div>

      {/* Why not other models */}
      {vm.whyNotOthers && vm.whyNotOthers.length > 0 && (
        <>
          <Reveal><SectionHeading>Why Not Other Models</SectionHeading></Reveal>
          <Reveal delay={60}>
            <div className="card-elevated mt-6 divide-y-2 divide-line !p-2">
              {vm.whyNotOthers.map((w, i) => (
                <div key={i} className="px-4 py-3 text-xs leading-relaxed text-ink">
                  <span className="font-bold">{w.model}</span> — {w.explanation.replace(`${w.model} `, "")}
                </div>
              ))}
            </div>
          </Reveal>
        </>
      )}

      {/* Model readiness */}
      {vm.readinessRows && vm.readinessRows.length > 0 && (
        <>
          <Reveal><SectionHeading>Model Readiness</SectionHeading></Reveal>
          <Reveal delay={60}>
            <div className="card-elevated mt-6 divide-y-2 divide-line !p-2">
              {vm.readinessRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between px-4 py-3 text-sm text-ink">
                  <span>{r.label}</span>
                  <span className="tracking-widest text-mustard">{r.display}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </>
      )}

      {/* Visual insights */}
      {vm.charts.length > 0 && (
        <>
          <Reveal><SectionHeading>Visual Insights</SectionHeading></Reveal>
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {vm.charts.map((chart, i) => (
              <Reveal key={chart.key} delay={i * 70}>
                <button
                  type="button"
                  className="card h-full w-full text-left"
                  onClick={() => (chart.url || chart.description || chart.interpretation) && setChartModal(chart)}
                >
                  <div className="mb-4 text-center text-xs font-bold text-ink">{chart.title}</div>
                  <div className="flex items-center justify-center">
                    {chart.url ? <ChartImage title={chart.title} url={chart.url} /> : chart.node}
                  </div>
                  {chart.description && <p className="mt-3 text-[11px] text-muted">{chart.description}</p>}
                </button>
              </Reveal>
            ))}
          </div>
        </>
      )}

      {chartModal && (
        <Modal title={chartModal.chartType ?? "Chart"} onClose={() => setChartModal(null)}>
          <div className="mt-3 font-display text-base font-bold text-ink">{chartModal.title}</div>
          {chartModal.url && <div className="mt-3"><ChartImage title={chartModal.title} url={chartModal.url} /></div>}
          {chartModal.description && <p className="mt-3 text-xs text-muted">{chartModal.description}</p>}
          {chartModal.interpretation && (
            <p className="mt-2 text-xs text-ink"><span className="font-bold">Interpretation: </span>{chartModal.interpretation}</p>
          )}
        </Modal>
      )}

      {/* Statistical summary */}
      {vm.stats && vm.stats.length > 0 && (
        <>
          <Reveal><SectionHeading>Statistical Summary</SectionHeading></Reveal>
          <Reveal delay={60}>
            <div className="table-wrap mt-6">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Mean</th>
                    <th>Median</th>
                    <th>Std Dev</th>
                    <th>Min</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.stats.map((s) => (
                    <tr key={s.column}>
                      <td className="font-bold text-ink">{s.column}</td>
                      <td>{fmt(s.mean)}</td>
                      <td>{fmt(s.median)}</td>
                      <td>{fmt(s.std)}</td>
                      <td>{fmt(s.min)}</td>
                      <td>{fmt(s.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </>
      )}

      {/* Correlation highlights */}
      {vm.correlations && vm.correlations.length > 0 && (
        <>
          <Reveal><SectionHeading>Correlation Highlights</SectionHeading></Reveal>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {vm.correlations.map((c, i) => (
              <Reveal key={`${c.a}-${c.b}`} delay={i * 50}>
                <div className="card flex items-center justify-between !p-4">
                  <span className="text-sm text-ink">{c.a} ↔ {c.b}</span>
                  <span className="font-display text-lg font-bold text-ink">{c.value.toFixed(2)}</span>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">High correlation between features may indicate multicollinearity.</p>
        </>
      )}

      {/* Processing metrics */}
      {vm.processingMetrics && vm.processingMetrics.length > 0 && (
        <>
          <Reveal><SectionHeading>Processing Metrics</SectionHeading></Reveal>
          <Reveal delay={60}>
            <div className="card-elevated mt-6 space-y-3 !p-6">
              {(() => {
                const max = Math.max(...vm.processingMetrics!.map((m) => m.seconds), 0.01);
                return vm.processingMetrics!.map((m) => (
                  <div key={m.label} className="grid grid-cols-[120px_1fr_50px] items-center gap-3 text-xs">
                    <span className="text-muted">{m.label}</span>
                    <span className="h-2 w-full overflow-hidden rounded-pill border-2 border-ink bg-cream-sunken">
                      <span className="bar-grow block h-full origin-left" style={{ width: `${(m.seconds / max) * 100}%`, background: "var(--color-mustard)" }} />
                    </span>
                    <span className="text-right font-bold text-ink">{m.seconds}s</span>
                  </div>
                ));
              })()}
            </div>
          </Reveal>
        </>
      )}

      {/* Data quality issues */}
      {vm.quality && vm.quality.issues.length > 0 && (
        <>
          <Reveal><SectionHeading>Data Quality Issues</SectionHeading></Reveal>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {vm.quality.issues.map((iss, i) => (
              <Reveal key={i} delay={i * 60}>
                <div className="card h-full">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-bold text-ink">{iss.issue}</span>
                    <span
                      className="table-chip shrink-0"
                      style={
                        isHighSeverity(iss.severity)
                          ? { borderColor: "var(--color-danger)", color: "var(--color-danger)", backgroundColor: "var(--color-danger-bg)" }
                          : undefined
                      }
                    >
                      {iss.severity}
                    </span>
                  </div>
                  {iss.impact && <p className="mt-3 text-[11px] text-muted"><span className="font-bold text-ink">Impact: </span>{iss.impact}</p>}
                  {iss.recommendation && <p className="mt-1 text-[11px] text-muted"><span className="font-bold text-ink">Recommendation: </span>{iss.recommendation}</p>}
                </div>
              </Reveal>
            ))}
          </div>
        </>
      )}

      {/* Warnings */}
      {vm.warnings && vm.warnings.length > 0 && (
        <>
          <Reveal><SectionHeading>Warnings</SectionHeading></Reveal>
          <ul className="mt-5 flex flex-col gap-2.5">
            {vm.warnings.map((w, i) => (
              <Reveal key={i} delay={i * 50}>
                <li
                  className="flex items-center gap-3 rounded-[14px] border-2 border-ink bg-cream-sunken px-4 py-3 text-sm text-ink shadow-[var(--shadow-hard-sm)]"
                >
                  <span className="icon-badge !h-8 !w-8 shrink-0" style={{ backgroundColor: "var(--color-mustard)" }} aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </span>
                  {w}
                </li>
              </Reveal>
            ))}
          </ul>
        </>
      )}

      <Reveal>
        <p className="mt-10 text-center text-xs text-muted">
          AI-generated recommendations — not professional advice; verify before use.
        </p>
      </Reveal>

      {/* Download center — 5 items */}
      <div id="download-center" className="scroll-mt-24">
        <Reveal><SectionHeading>Download Center</SectionHeading></Reveal>
        <div className="mb-16 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { key: "cleanedCsv", label: "Cleaned CSV", sub: "Your cleaned dataset", href: vm.downloads?.cleanedCsv },
            { key: "analysisReport", label: "Analysis Report", sub: "Full write-up", href: vm.downloads?.analysisReport },
            { key: "jsonResults", label: "JSON Results", sub: "Machine-readable", href: vm.downloads?.jsonResults },
            { key: "chartsZip", label: "Charts (ZIP)", sub: "All generated charts", href: vm.downloads?.chartsZip },
            { key: "cleaningLog", label: "Cleaning Log", sub: "Timeline + decisions", href: vm.downloads?.cleaningLog },
          ].map((d, i) => (
            <Reveal key={d.key} delay={i * 50}>
              <div className="card flex h-full flex-col gap-3">
                <span className="icon-badge !h-9 !w-9" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4v11" /><polyline points="8 11 12 15 16 11" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                  </svg>
                </span>
                <div>
                  <div className="text-xs font-bold text-ink">{d.label}</div>
                  <p className="text-[10.5px] text-muted">{d.sub}</p>
                </div>
                {d.href ? (
                  <a href={d.href} download className="btn btn-yellow !py-2 !text-[11px] justify-center">Download</a>
              ) : (
                <button type="button" className="btn !py-2 !text-[11px] justify-center opacity-50 cursor-not-allowed" disabled aria-disabled="true">Unavailable</button>
              )}
            </div>
          </Reveal>
        ))}
        </div>
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
      case 404: return "Analysis results not found. The analysis may have expired.";
      case 422: return "Dataset could not be processed. The file may be invalid.";
      case 500: return "Backend processing error. Please try again later.";
      default: return err.message || "Failed to load results.";
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

  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  useEffect(() => {
    if (!fileId) {
      setError(null);
      setVm(MOCK_VM);
      return;
    }
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

    return () => { active = false; };
  }, [fileId, retryToken]);

  return (
    <div className="relative flex min-h-screen flex-col bg-cream">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-grid-pattern-page" />

      <div className="mx-auto w-full max-w-6xl flex-1 px-6">
        <SiteNav />

        {/* Back link + upload-success indicator, side by side, right under the
            navbar. Rendered directly (no Reveal) so they're present the
            instant the page paints instead of waiting on a scroll trigger. */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-8">
          <Link href="/upload" className="label-mono transition-colors hover:text-ink">← Back to Upload</Link>

          {vm && !vm.invalidMessage && (
            <span className="inline-flex items-center gap-2 rounded-pill border-2 border-ink bg-cream-card py-1.5 pl-1.5 pr-3 shadow-[var(--shadow-hard-sm)]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink" style={{ backgroundColor: "var(--color-mustard)" }} aria-hidden="true">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="5 12 10 17 19 7" />
                </svg>
              </span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink">
                Upload Successful — {vm.rows} rows · {vm.cols} columns
              </span>
            </span>
          )}
        </div>

        {error ? (
          <Reveal className="mt-6">
            <div className="card-elevated !p-14 text-center" role="alert">
              <span className="icon-badge mx-auto" style={{ backgroundColor: "var(--color-danger)", color: "#fff" }} aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /><circle cx="12" cy="12" r="9" />
                </svg>
              </span>
              <p className="mt-4 text-sm font-bold text-ink">Couldn&apos;t load results</p>
              <p className="mt-2 text-sm text-muted">{error}</p>
              <div className="mt-6 flex justify-center gap-4">
                <button type="button" onClick={retry} className="btn btn-yellow">Retry</button>
                <Link href="/upload" className="btn btn-ghost">Upload a file</Link>
              </div>
            </div>
          </Reveal>
        ) : vm ? (
          <ResultsView vm={vm} />
        ) : (
          <LoadingExperience />
        )}
      </div>
      <SiteFooter />
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