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

export type ResultsResponse = AnalyzeResponse;

export interface ApiErrorPayload {
  detail: string;
}
