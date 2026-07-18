/**
 * Shapes mirror the backend's Pydantic response models in
 * backend/app/api/schemas.py -- keep these in sync if that file changes.
 */

export interface UploadResponse {
  file_id: string;
  filename: string;
  rows: number;
  columns: number;
}

export interface NumericColumnSummary {
  mean: number | null;
  median: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
}

export interface CategoricalColumnSummary {
  unique_count: number;
  frequency_table: Record<string, number>;
  truncated: boolean;
}

export interface OutlierSummary {
  count: number;
  lower_bound: number | null;
  upper_bound: number | null;
}

export interface DatasetProfile {
  shape: { rows: number; columns: number };
  columns: Record<string, string>;
  missing_values: Record<string, number>;
  missing_value_percentages?: Record<string, number>;
  duplicates: number;
  numeric_summary: Record<string, NumericColumnSummary>;
  categorical_summary: Record<string, CategoricalColumnSummary>;
  datetime_columns?: Record<string, Record<string, string | number>>;
  outliers: Record<string, OutlierSummary>;
  correlations: Record<string, Record<string, number | null>>;
}

/** Cleaning plan actually applied to the data (prompts/cleaning_prompt.py
 * produces the raw proposal; `cleaner.py` rewrites any target-column entry
 * to a "skipped" label before this reaches the frontend, since the target
 * column is never actually touched by these steps). May fall back to
 * `{ raw_plan: string }` if the LLM didn't return valid JSON. */
export interface CleaningPlan {
  missing_values?: Record<string, "median" | "mode" | "drop" | string>;
  duplicates?: "drop" | "keep";
  outliers?: Record<string, "cap" | "remove" | "keep" | string>;
  encoding?: Record<string, "one_hot" | "none" | string>;
  /** Identifier columns dropped by the cleaner (Known Bugs Issue 5), mapped
   * to the plain-English reason each was dropped. */
  dropped_columns?: Record<string, string>;
  notes?: string;
  raw_plan?: string;
}

export interface RankedModel {
  name: string;
  /** Coarse confidence label for this pick relative to the top model. */
  confidence?: string;
  reason: string;
}

/** A scored target-column candidate (CLAUDE.md §9 Stage A). */
export interface PossibleTarget {
  column: string;
  type: "classification" | "regression";
  confidence: number;
  reason: string;
}

/** Heuristic-only recommendation (CLAUDE.md §9) -- no models are trained,
 * so there are no performance metrics here, only reasoned rankings. */
export interface Recommendations {
  problem_type: "classification" | "regression" | "clustering" | "unknown" | "invalid";
  target_column: string | null;
  detection_reasoning: string;
  /** All columns scored as possible targets, highest confidence first. Most
   * useful when no single target was obvious. */
  possible_targets?: PossibleTarget[];
  ranked_models: RankedModel[];
  top_recommendation: string | null;
  /** Identifier columns excluded from feature reasoning (Known Bugs Issue 4). */
  excluded_columns?: string[];
  /** Non-blocking cautions about the recommendation, e.g. a class-imbalance
   * warning for a skewed classification target (Known Bugs Issue 10). */
  warnings?: string[];
}

/** Dataset-level validity gate result (Known Bugs Issue 6a). `valid` is
 * false only when `errors` is non-empty -- warnings never block analysis. */
export interface DataValidity {
  valid: boolean;
  errors: string[];
  warnings: string[];
  duplicate_percentage?: number;
}

/** Deterministic 0-100 data quality score (computed in Python, no LLM) plus
 * the per-component sub-scores and the ordered issues that lowered it. */
export interface QualityScore {
  quality_score: number;
  components: Record<string, number>;
  issues: string[];
}

export interface AnalyzeResponse {
  file_id: string;
  status: string;
  profile: DatasetProfile | null;
  data_validity: DataValidity | null;
  quality_score: QualityScore | null;
  report: string | null;
  cleaning_plan: CleaningPlan | null;
  cleaned_file: string | null;
  charts: string[] | null;
  recommendations: Recommendations | null;
}

// =============================================================================
// NEW: §1-§20 dashboard sections, added to ResultsResponse only (matching
// backend/app/api/schemas.py -- these fields exist on the Pydantic
// ResultsResponse model, NOT on AnalyzeResponse). That's why ResultsResponse
// below is no longer `type ResultsResponse = AnalyzeResponse` -- it's its
// own interface that extends AnalyzeResponse with the extra sections, same
// relationship as the two Pydantic models on the backend.
//
// Shapes here mirror `backend/app/services/report_adapter.py` /
// `response_builder.py` field-for-field, and match the Zod schema in
// `frontend/app/results/page.tsx` (which validates the actual HTTP response
// at runtime -- these interfaces are the compile-time contract, Zod is the
// runtime one; if they drift, Zod is the one that will actually catch it).
// =============================================================================

export interface ReadinessBadge {
  label: string;
  sublabel: string;
  score: number;
}

export interface OverviewSection {
  dataset_name: string;
  rows: number;
  columns: number;
  memory_usage?: string | null;
  numeric_features?: number | null;
  categorical_features?: number | null;
  detected_target?: string | null;
  problem_type?: string | null;
  processing_status?: string | null;
  processing_time_seconds?: number | null;
  readiness_badge?: ReadinessBadge | null;
}

export interface QualityComponentCard {
  key: string;
  label: string;
  score: number;
  status_color?: "green" | "yellow" | "orange" | "red" | string | null;
  explanation: string;
}

export interface QualityDashboard {
  overall_score: number;
  status: string;
  sublabel: string;
  components: QualityComponentCard[];
}

export interface DatasetHealth {
  health: "Excellent" | "Good" | "Fair" | "Poor" | string;
  score: number;
  explanation: string;
}

export interface QualityIssueCard {
  issue: string;
  severity: "High" | "Medium" | string;
  impact: string;
  recommendation: string;
}

export interface QualitySection {
  score: number;
  components?: Record<string, number>;
  dashboard?: QualityDashboard | null;
  health?: DatasetHealth | null;
  issues: QualityIssueCard[];
}

export interface ExecutiveSummarySection {
  overview: string;
  key_findings: string[];
  risks: string[];
  recommendations: string[];
  source?: "structured" | "fallback_unstructured" | string;
  note?: string;
}

export interface InsightCard {
  icon?: string | null;
  title: string;
  value: string;
  detail: string;
}

export interface AnalysisSection {
  executive_summary?: ExecutiveSummarySection | null;
  dataset_insights: InsightCard[];
}

export interface TimelineItem {
  icon?: string;
  action: string;
  reason: string;
  confidence: string;
}

export interface AIDecisionCard {
  decision: string;
  reason: string;
  confidence: string;
}

export interface CleaningSummarySection {
  rows_affected?: number;
  columns_affected?: string[];
  columns_affected_count?: number;
  execution_time_seconds?: number;
  total_actions?: number;
  timeline: TimelineItem[];
  ai_decisions: AIDecisionCard[];
  /** Present when before/after data wasn't available to compute
   * rows_affected/columns_affected accurately (see report_adapter.py). */
  note?: string;
}

export interface BeforeAfterRow {
  metric: string;
  before: number;
  after: number;
  difference: string;
}

export interface BeforeAfterSection {
  rows_before: number;
  rows_after: number;
  duplicates_removed: number;
  missing_before: number;
  missing_after: number;
  outliers_before: number;
  outliers_after: number;
  columns_removed: string[];
  columns_encoded: string[];
  values_imputed: number;
  identifier_columns_removed: string[];
  table: BeforeAfterRow[];
}

export interface ChartManifestItem {
  path?: string | null;
  chart_type?: "bar" | "histogram" | "scatter" | "heatmap" | "chart" | string | null;
  title: string;
  description?: string | null;
  interpretation?: string | null;
}

export interface VisualizationsSection {
  charts: ChartManifestItem[];
}

export interface ModelCard {
  model_name: string;
  confidence: string;
  reason: string;
  advantages: string[];
  disadvantages: string[];
  interpretability?: string | null;
  training_speed?: string | null;
  inference_speed?: string | null;
  handles_missing?: string | null;
  handles_outliers?: string | null;
  scalability?: string | null;
}

export interface WhyNotOtherCard {
  model: string;
  explanation: string;
}

export interface ReadinessDimension {
  stars: number;
  display: string;
}

export interface ReadinessSection {
  business_intelligence?: ReadinessDimension | null;
  machine_learning?: ReadinessDimension | null;
  deep_learning?: ReadinessDimension | null;
  visualization?: ReadinessDimension | null;
  deployment?: ReadinessDimension | null;
}

export interface MLRecommendationSection {
  problem_type?: string | null;
  target_column?: string | null;
  detection_reasoning?: string | null;
  top_recommendation?: string | null;
  models: ModelCard[];
  why_not_others: WhyNotOtherCard[];
  readiness?: ReadinessSection | null;
  warnings: string[];
}

export interface DownloadsSection {
  cleaned_csv?: string | null;
  analysis_report?: string | null;
  json_results?: string | null;
  charts_zip?: string | null;
  cleaning_log?: string | null;
}

export interface MetadataSection {
  row_count?: number | null;
  column_count?: number | null;
  processing_metrics?: Record<string, number>;
}

/**
 * `ResultsResponse` was previously `type ResultsResponse = AnalyzeResponse`.
 * On the backend, `ResultsResponse` (schemas.py) has 9 additional optional
 * fields that `AnalyzeResponse` does NOT have -- so an alias was actually
 * incorrect (it let TypeScript believe `AnalyzeResponse` also carries these
 * fields, which it doesn't; `/analyze/{file_id}`'s response never includes
 * them, only `/results/{file_id}`'s does). This now matches that real
 * asymmetry: an interface that extends AnalyzeResponse with the extra
 * sections, same relationship as the two Pydantic models.
 */
export interface ResultsResponse extends AnalyzeResponse {
  overview?: OverviewSection | null;
  quality?: QualitySection | null;
  analysis?: AnalysisSection | null;
  cleaning_summary?: CleaningSummarySection | null;
  before_after?: BeforeAfterSection | null;
  visualizations?: VisualizationsSection | null;
  ml_recommendation?: MLRecommendationSection | null;
  downloads?: DownloadsSection | null;
  metadata?: MetadataSection | null;
}

export interface ApiErrorPayload {
  detail: string;
}