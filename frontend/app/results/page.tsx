"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { SiteNav } from "@/components/SiteNav";
import { ApiError, getResults, resolveAssetUrl } from "@/lib/api";

/**
 * Results page — rewritten against the richer backend contract produced by
 * `app/services/response_builder.py` (build_final_response). Two modes:
 *
 *  - No `file_id` in the URL (marketing nav): renders STATIC MOCK data,
 *    shaped exactly like a real transformed ResultsVM, as a product preview.
 *  - `file_id` present: fetches GET /results/{file_id} and renders the full
 *    dashboard — dataset overview, executive summary, quality dashboard +
 *    health, before/after cleaning comparison, cleaning timeline + AI
 *    decisions, dataset insights, correlation highlights, statistical
 *    summary, visualizations, ML recommendation (models + why-not-others +
 *    readiness), processing metrics, quality issues, and a 5-item download
 *    center.
 *
 * IMPORTANT: every backend field is `.nullish()` in the Zod schema. If a
 * section isn't sent yet, the corresponding UI block is simply omitted —
 * this file never throws on a partial response, matching the defensive
 * style of the original implementation.
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
    // legacy top-level fields kept for backward compatibility during rollout
    file_id: z.string().min(1),
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

    // new nested contract (response_builder.build_final_response)
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
            <circle key={i} cx="60" cy="60" r="40" fill="none" stroke={s.color} strokeWidth="18"
              strokeDasharray={`${(s.len / 100) * c} ${c}`} strokeDashoffset={`${-(s.offset / 100) * c}`} />
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

function HeatmapChart() {
  const palette = ["#b23a2e", "#d98a6a", "#e9e2d4", "#8fb4dd", "#3f6fb0"];
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

// -------------------------- shared status color helpers ---------------------
// Reuses the exact literals already in the codebase's quality-score coloring
// (>=80 green / >=60 amber / else red) so new sections read as one system.

function statusColor(score: number): string {
  if (score >= 80) return "#3f9d54";
  if (score >= 60) return "#f4c542";
  return "#c05a44";
}

function severityColor(severity: string): string {
  return severity.toLowerCase() === "high" ? "#c05a44" : "#f4c542";
}

// Format a processing duration for display. Sub-second runs show "<1s" rather
// than the misleading "0s" a plain integer/round produces on fast or
// coarse-grained timings; everything else shows the second value normally.
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
      { key: "missing_values", label: "Missing values", score: 95, color: statusColor(95), explanation: "Only 1.2% of cells are missing." },
      { key: "duplicates", label: "Duplicates", score: 98, color: statusColor(98), explanation: "0.5% of rows are exact duplicates." },
      { key: "outliers", label: "Outliers", score: 88, color: statusColor(88), explanation: "3.4% of numeric values fall outside the IQR fences." },
      { key: "feature_quality", label: "Feature quality", score: 93, color: statusColor(93), explanation: "1 of 15 columns was an identifier and carried no modeling signal." },
      { key: "class_balance", label: "Balance", score: 84, color: statusColor(84), explanation: "Not applicable for a regression target." },
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

/** Resolve backend asset paths only when they are known safe chart/download URLs. */
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
  const filename = data.overview?.dataset_name ?? `${data.file_id}.csv`;

  // Failure gate: if the backend flagged this dataset as unusable, surface
  // the real validation error and render nothing else.
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

  // --- overview ---
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

  // --- health ---
  const rawHealth: HealthVM | undefined = data.quality?.health ?? undefined;

  // --- executive summary ---
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

  // --- insights ---
  const insights: InsightVM[] | undefined = data.analysis?.dataset_insights?.length
    ? data.analysis.dataset_insights.map((i) => ({ title: i.title, value: i.value, detail: i.detail }))
    : undefined;

  // --- quality ---
  const quality: QualityVM | undefined = data.quality
    ? {
        score: data.quality.score,
        status: data.quality.dashboard?.status ?? (data.quality.score >= 80 ? "Good" : data.quality.score >= 60 ? "Fair" : "Needs attention"),
        sublabel: data.quality.dashboard?.sublabel ?? "",
        components: (data.quality.dashboard?.components ?? []).map((c) => ({
          key: c.key, label: c.label, score: c.score, color: statusColor(c.score), explanation: c.explanation,
        })),
        issues: (data.quality.issues ?? []).map((i) => ({
          issue: i.issue, severity: i.severity, impact: i.impact, recommendation: i.recommendation,
        })),
      }
    : undefined;

  // --- before / after ---
  const beforeAfter: BeforeAfterRowVM[] | undefined = data.before_after?.table?.length
    ? data.before_after.table
    : undefined;

  // --- cleaning timeline + AI decisions ---
  const timeline: TimelineItemVM[] | undefined = data.cleaning_summary?.timeline?.length
    ? data.cleaning_summary.timeline.map((t) => ({ action: t.action, reason: t.reason, confidence: t.confidence }))
    : undefined;
  const aiDecisions: AIDecisionVM[] | undefined = data.cleaning_summary?.ai_decisions?.length
    ? data.cleaning_summary.ai_decisions.map((d) => ({ decision: d.decision, reason: d.reason, confidence: d.confidence }))
    : undefined;

  // --- charts ---
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

  // --- ML recommendation ---
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

  // --- processing metrics ---
  const pm = data.metadata?.processing_metrics;
  const processingMetrics: ProcessingMetricVM[] | undefined = pm
    ? Object.entries(pm).map(([key, seconds]) => ({ label: METRIC_LABELS[key] ?? key, seconds }))
    : undefined;

  // --- downloads ---
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

  // --- legacy profile-derived sections (kept for backward compatibility) ---
  const profile = data.profile;
  const correlations = topCorrelations(profile?.correlations);
  const stats: StatRowVM[] | undefined = profile?.numeric_summary
    ? Object.entries(profile.numeric_summary).map(([column, s]) => ({
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

// --------------------------- small presentational bits ----------------------

function SectionHeading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mt-12 flex items-end justify-between">
      <h2 className="font-display text-lg font-bold text-ink">{children}</h2>
      {sub && <span className="label-mono text-[10px]">{sub}</span>}
    </div>
  );
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

function ProgressBar({ label, value, onClick, active }: { label: string; value: number; onClick?: () => void; active?: boolean }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = statusColor(clamped);
  return (
    <div className={onClick ? "cursor-pointer" : undefined} onClick={onClick}>
      <div className="flex items-center justify-between text-xs">
        <span className={active ? "font-bold text-ink" : "text-muted"}>{label}</span>
        <span className="font-bold text-ink">{clamped}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-pill bg-cream-sunken">
        <div className="h-full rounded-pill transition-all" style={{ width: `${clamped}%`, background: color }} />
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="card-elevated max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="label-mono text-[10px]">{title}</div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --------------------------- presentational view ----------------------------

function ResultsView({ vm }: { vm: ResultsVM }) {
  const [openComponent, setOpenComponent] = useState<string | null>(null);
  const [chartModal, setChartModal] = useState<ChartVM | null>(null);

  if (vm.invalidMessage) {
    return (
      <div className="mb-16 mt-6 rounded-[16px] border px-6 py-12 text-center" style={{ borderColor: "#e6cfc8", backgroundColor: "#f8eeeb" }} role="alert">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "#c05a44" }} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /><circle cx="12" cy="12" r="9" />
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
      <div className="mt-6 flex items-center justify-between rounded-[16px] border px-6 py-5" style={{ borderColor: "#cfe3c8", backgroundColor: "#eef6e9" }}>
        <div className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "#3f9d54" }} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="5 12 10 17 19 7" /></svg>
          </span>
          <div>
            <div className="text-sm font-bold text-ink">Upload Successful!</div>
            <p className="text-xs text-muted">File: {vm.filename}</p>
          </div>
        </div>
        <div className="label-mono text-[10px]">{vm.rows} rows · {vm.cols} columns</div>
      </div>

      {/* Dataset overview */}
      {vm.overview && (
        <div className="card-elevated mt-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="label-mono text-[10px]">Dataset Overview</div>
              <div className="mt-1 font-display text-xl font-bold text-ink">{vm.overview.datasetName}</div>
            </div>
            {vm.overview.readiness && (
              <div className="text-right">
                <span className="inline-flex items-center rounded-pill bg-mustard px-3 py-1 text-[11px] font-bold text-ink">
                  {vm.overview.readiness.label}
                </span>
                <p className="mt-1 text-xs text-muted">{vm.overview.readiness.sublabel}</p>
              </div>
            )}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4 lg:grid-cols-6">
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
        </div>
      )}

      {/* Executive summary — 4-panel */}
      {vm.executiveSummary && (
        <>
          <SectionHeading>Executive Summary</SectionHeading>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card !p-5">
              <div className="label-mono text-[10px]">Overview</div>
              <p className="mt-2 text-sm leading-relaxed text-ink">{vm.executiveSummary.overview || "—"}</p>
            </div>
            <div className="card !p-5">
              <div className="label-mono text-[10px]">Key Findings</div>
              {vm.executiveSummary.keyFindings.length ? (
                <ul className="mt-2 space-y-1.5 text-sm text-ink">
                  {vm.executiveSummary.keyFindings.map((f, i) => <li key={i}>• {f}</li>)}
                </ul>
              ) : <p className="mt-2 text-sm text-muted">None flagged.</p>}
            </div>
            <div className="card !p-5">
              <div className="label-mono text-[10px]">Risks</div>
              {vm.executiveSummary.risks.length ? (
                <ul className="mt-2 space-y-1.5 text-sm text-ink">
                  {vm.executiveSummary.risks.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              ) : <p className="mt-2 text-sm text-muted">None flagged.</p>}
            </div>
            <div className="card !p-5">
              <div className="label-mono text-[10px]">Recommendations</div>
              {vm.executiveSummary.recommendations.length ? (
                <ul className="mt-2 space-y-1.5 text-sm text-ink">
                  {vm.executiveSummary.recommendations.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              ) : <p className="mt-2 text-sm text-muted">None flagged.</p>}
            </div>
          </div>
          {vm.executiveSummary.isFallback && (
            <p className="mt-2 text-xs text-muted">Summary shown as a single block — structured sections will populate once the backend returns them.</p>
          )}
        </>
      )}

      {/* Data quality dashboard */}
      {vm.quality && (
        <>
          <SectionHeading>Data Quality Dashboard</SectionHeading>
          <div className="card-elevated mt-5 flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
                  style={{ background: statusColor(vm.quality.score) }}
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
              <div className="grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-5">
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
        </>
      )}

      {/* Dataset health */}
      {vm.health && (
        <div className="card-elevated mt-6 flex items-center gap-5 p-6">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] text-sm font-bold text-white"
            style={{ background: statusColor(vm.health.score) }}
          >
            {vm.health.score}
          </div>
          <div>
            <div className="label-mono text-[10px]">Dataset Health</div>
            <div className="font-display text-lg font-bold text-ink">{vm.health.health}</div>
            <p className="mt-1 text-xs text-muted">{vm.health.explanation}</p>
          </div>
        </div>
      )}

      {/* Before / after cleaning */}
      {vm.beforeAfter && vm.beforeAfter.length > 0 && (
        <>
          <SectionHeading>Before vs. After Cleaning</SectionHeading>
          <p className="mt-2 text-xs text-muted">
            Outlier counts are independent IQR detections on each dataset — a different
            &ldquo;after&rdquo; count reflects re-measurement on the cleaned data, not damage from cleaning.
          </p>
          <div className="card-elevated mt-5 overflow-x-auto p-2">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="px-4 py-3 font-bold">Metric</th>
                  <th className="px-4 py-3 font-bold">Before</th>
                  <th className="px-4 py-3 font-bold">After</th>
                  <th className="px-4 py-3 font-bold">Difference</th>
                </tr>
              </thead>
              <tbody>
                {vm.beforeAfter.map((r) => (
                  <tr key={r.metric} className="border-t border-line">
                    <td className="px-4 py-3 font-bold text-ink">{r.metric}</td>
                    <td className="px-4 py-3 text-ink">{r.before}</td>
                    <td className="px-4 py-3 text-ink">{r.after}</td>
                    <td className="px-4 py-3" style={{ color: r.informational ? undefined : String(r.difference).startsWith("-") ? "#3f9d54" : r.difference === "0" ? undefined : "#c05a44" }}>{r.difference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Cleaning timeline */}
      {vm.timeline && vm.timeline.length > 0 && (
        <>
          <SectionHeading>Cleaning Timeline</SectionHeading>
          <div className="card-elevated mt-5 p-6">
            <ol className="relative space-y-5 border-l border-line pl-6">
              {vm.timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span
                    className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: "#3f9d54" }}
                  >✓</span>
                  <div className="text-sm font-bold text-ink">{t.action}</div>
                  {t.reason && <p className="mt-1 text-xs text-muted">{t.reason}</p>}
                  <span className="mt-1 inline-block label-mono text-[10px]" style={{ color: "#2f6fd6" }}>confidence: {t.confidence}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {/* AI decisions */}
      {vm.aiDecisions && vm.aiDecisions.length > 0 && (
        <>
          <SectionHeading>AI Decisions</SectionHeading>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vm.aiDecisions.map((d, i) => (
              <div key={i} className="card !p-5">
                <div className="label-mono text-[10px]" style={{ color: "#2f6fd6" }}>{d.confidence} confidence</div>
                <div className="mt-2 text-sm font-bold text-ink">{d.decision}</div>
                <p className="mt-2 text-xs text-muted">{d.reason}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Dataset insights */}
      {vm.insights && vm.insights.length > 0 && (
        <>
          <SectionHeading>Dataset Insights</SectionHeading>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vm.insights.map((ins, i) => (
              <div key={i} className="card !p-5">
                <div className="label-mono text-[10px]">{ins.title}</div>
                <div className="mt-2 font-display text-base font-bold text-ink">{ins.value}</div>
                <p className="mt-1 text-xs text-muted">{ins.detail}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Best model heading */}
      <h1 className="display-heading mt-12 text-4xl sm:text-5xl">
        Best Model for <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[8px]">Your Dataset</span>
      </h1>

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
                  <line x1="12" y1="19" x2="12" y2="6" /><polyline points="6 12 12 6 18 12" />
                </svg>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">{vm.best.scoreCaption}</p>
          </div>
          <div className="relative" role="img" aria-label={`${vm.best.scoreLabel}: ${vm.best.scoreValue}`}>
            <svg width="150" height="90" viewBox="0 0 150 90" aria-hidden="true">
              <path d="M12 82 A63 63 0 0 1 138 82" fill="none" stroke="#efe9dd" strokeWidth="16" strokeLinecap="round" />
              <path d={gaugePath(vm.best.gaugeFill)} fill="none" stroke="#f4c542" strokeWidth="16" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-x-0 bottom-1 text-center font-display text-lg font-bold text-ink">{vm.best.scoreValue}</div>
            <div className="mt-1 flex justify-between text-[9px] text-muted"><span>{vm.best.scaleLeft}</span><span>{vm.best.scaleRight}</span></div>
          </div>
        </div>
      </div>

      {/* Model comparison — enriched cards */}
      <SectionHeading>Model Comparison</SectionHeading>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vm.models.map((m) => (
          <div key={m.name} className={`card !p-5 ${m.isBest ? "!border-mustard" : ""}`} style={m.isBest ? { borderWidth: "2px" } : undefined}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-ink">{m.name}</div>
              {m.isBest && <span className="inline-flex items-center rounded-pill bg-mustard px-2.5 py-1 text-[10px] font-bold text-ink">Best Fit</span>}
            </div>
            <div className="label-mono mt-1 text-[10px]">{m.confidence} confidence</div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{m.reason}</p>
            {m.specs && Object.keys(m.specs).length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-3 text-[10.5px]">
                {Object.entries(m.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-muted"><span>{k}</span><span className="text-ink">{v}</span></div>
                ))}
              </div>
            )}
            {(m.advantages.length > 0 || m.disadvantages.length > 0) && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[10.5px]">
                <div>
                  <div className="mb-1 label-mono text-[9px]">Pros</div>
                  <ul className="space-y-0.5" style={{ color: "#3f9d54" }}>{m.advantages.map((a, i) => <li key={i}>• {a}</li>)}</ul>
                </div>
                <div>
                  <div className="mb-1 label-mono text-[9px]">Cons</div>
                  <ul className="space-y-0.5" style={{ color: "#c05a44" }}>{m.disadvantages.map((a, i) => <li key={i}>• {a}</li>)}</ul>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Why not other models */}
      {vm.whyNotOthers && vm.whyNotOthers.length > 0 && (
        <>
          <SectionHeading>Why Not Other Models</SectionHeading>
          <div className="card-elevated mt-5 divide-y divide-line p-2">
            {vm.whyNotOthers.map((w, i) => (
              <div key={i} className="px-4 py-3 text-xs leading-relaxed text-ink">
                <span className="font-bold">{w.model}</span> — {w.explanation.replace(`${w.model} `, "")}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Model readiness */}
      {vm.readinessRows && vm.readinessRows.length > 0 && (
        <>
          <SectionHeading>Model Readiness</SectionHeading>
          <div className="card-elevated mt-5 divide-y divide-line p-2">
            {vm.readinessRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-4 py-3 text-sm text-ink">
                <span>{r.label}</span>
                <span className="tracking-widest" style={{ color: "#f4c542" }}>{r.display}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Visual insights */}
      {vm.charts.length > 0 && (
        <>
          <SectionHeading>Visual Insights</SectionHeading>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {vm.charts.map((chart) => (
              <button
                key={chart.key}
                type="button"
                className="card !p-5 text-left"
                onClick={() => (chart.url || chart.description || chart.interpretation) && setChartModal(chart)}
              >
                <div className="mb-4 text-center text-xs font-bold text-ink">{chart.title}</div>
                <div className="flex items-center justify-center">
                  {chart.url ? <ChartImage title={chart.title} url={chart.url} /> : chart.node}
                </div>
                {chart.description && <p className="mt-3 text-[11px] text-muted">{chart.description}</p>}
              </button>
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

      {/* Processing metrics */}
      {vm.processingMetrics && vm.processingMetrics.length > 0 && (
        <>
          <SectionHeading>Processing Metrics</SectionHeading>
          <div className="card-elevated mt-5 space-y-3 p-6">
            {(() => {
              const max = Math.max(...vm.processingMetrics!.map((m) => m.seconds), 0.01);
              return vm.processingMetrics!.map((m) => (
                <div key={m.label} className="grid grid-cols-[120px_1fr_50px] items-center gap-3 text-xs">
                  <span className="text-muted">{m.label}</span>
                  <span className="h-2 w-full overflow-hidden rounded-pill bg-cream-sunken">
                    <span className="block h-full rounded-pill" style={{ width: `${(m.seconds / max) * 100}%`, background: "#2f6fd6" }} />
                  </span>
                  <span className="text-right font-bold text-ink">{m.seconds}s</span>
                </div>
              ));
            })()}
          </div>
        </>
      )}

      {/* Data quality issues */}
      {vm.quality && vm.quality.issues.length > 0 && (
        <>
          <SectionHeading>Data Quality Issues</SectionHeading>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {vm.quality.issues.map((iss, i) => (
              <div key={i} className="card !p-5" style={{ borderLeft: `3px solid ${severityColor(iss.severity)}` }}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-bold text-ink">{iss.issue}</span>
                  <span
                    className="shrink-0 rounded-pill px-2.5 py-0.5 text-[10px] font-bold"
                    style={{ background: `${severityColor(iss.severity)}22`, color: severityColor(iss.severity) }}
                  >
                    {iss.severity}
                  </span>
                </div>
                {iss.impact && <p className="mt-2 text-[11px] text-muted"><span className="font-bold text-ink">Impact: </span>{iss.impact}</p>}
                {iss.recommendation && <p className="mt-1 text-[11px] text-muted"><span className="font-bold text-ink">Recommendation: </span>{iss.recommendation}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Warnings */}
      {vm.warnings && vm.warnings.length > 0 && (
        <>
          <SectionHeading>Warnings</SectionHeading>
          <ul className="mt-4 flex flex-col gap-2">
            {vm.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-3 rounded-[12px] border px-4 py-3 text-sm text-ink" style={{ borderColor: "#f0dfa8", backgroundColor: "#fdf6e3" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b8860b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {w}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-8 text-center text-xs text-muted">
        AI-generated recommendations — not professional advice; verify before use.
      </p>

      {/* Download center — 5 items */}
      <SectionHeading>Download Center</SectionHeading>
      <div className="mb-16 mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { key: "cleanedCsv", label: "Cleaned CSV", sub: "Your cleaned dataset", href: vm.downloads?.cleanedCsv },
          { key: "analysisReport", label: "Analysis Report", sub: "Full write-up", href: vm.downloads?.analysisReport },
          { key: "jsonResults", label: "JSON Results", sub: "Machine-readable", href: vm.downloads?.jsonResults },
          { key: "chartsZip", label: "Charts (ZIP)", sub: "All generated charts", href: vm.downloads?.chartsZip },
          { key: "cleaningLog", label: "Cleaning Log", sub: "Timeline + decisions", href: vm.downloads?.cleaningLog },
        ].map((d) => (
          <div key={d.key} className="card !p-5 flex flex-col gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cream-sunken text-ink" aria-hidden="true">
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
        ))}
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

const PIPELINE_STAGES = ["Uploading", "Profiling", "Analyzing", "Cleaning", "Generating Charts", "Recommending Models", "Complete"];

function LoadingExperience() {
  return (
    <div className="mt-6 rounded-[16px] border border-line bg-cream-card px-6 py-10" role="status" aria-live="polite" aria-busy="true">
      <p className="label-mono text-center">Analyzing your dataset…</p>
      <ol className="mx-auto mt-6 max-w-xs space-y-3">
        {PIPELINE_STAGES.map((stage, i) => (
          <li key={stage} className="flex items-center gap-3 text-xs text-muted">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[10px]">{i + 1}</span>
            {stage}
          </li>
        ))}
      </ol>
    </div>
  );
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
    <div className="min-h-screen bg-cream">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav />

        <div className="pt-8">
          <Link href="/upload" className="label-mono transition-colors hover:text-ink">← Back to Upload</Link>
        </div>

        {error ? (
          <div className="mt-6 rounded-[16px] border border-line bg-cream-card px-6 py-10 text-center" role="alert">
            <p className="text-sm font-bold text-ink">Couldn&apos;t load results</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <div className="mt-6 flex justify-center gap-4">
              <button type="button" onClick={retry} className="btn btn-yellow">Retry</button>
              <Link href="/upload" className="btn">Upload a file</Link>
            </div>
          </div>
        ) : vm ? (
          <ResultsView vm={vm} />
        ) : (
          <LoadingExperience />
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