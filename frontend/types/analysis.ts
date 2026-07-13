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
  duplicates: number;
  numeric_summary: Record<string, NumericColumnSummary>;
  categorical_summary: Record<string, CategoricalColumnSummary>;
  outliers: Record<string, OutlierSummary>;
  correlations: Record<string, Record<string, number | null>>;
}

/** Cleaning plan produced by the LLM (prompts/cleaning_prompt.py); may fall
 * back to `{ raw_plan: string }` if the LLM didn't return valid JSON. */
export interface CleaningPlan {
  missing_values?: Record<string, "median" | "mode" | "drop">;
  duplicates?: "drop" | "keep";
  outliers?: Record<string, "cap" | "remove" | "keep">;
  encoding?: Record<string, "one_hot" | "none">;
  notes?: string;
  raw_plan?: string;
}

export interface RankedModel {
  name: string;
  reason: string;
}

/** Heuristic-only recommendation (CLAUDE.md §9) -- no models are trained,
 * so there are no performance metrics here, only reasoned rankings. */
export interface Recommendations {
  problem_type: "classification" | "regression" | "clustering";
  target_column: string | null;
  detection_reasoning: string;
  ranked_models: RankedModel[];
  top_recommendation: string | null;
}

export interface AnalyzeResponse {
  file_id: string;
  status: string;
  profile: DatasetProfile | null;
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
