import type { ReactNode } from "react";

/** View-model types for the Results page. Kept shared so page transforms and
 * presentational components stay in sync without circular imports. */

export interface CardVM {
  name: string;
  value: string;
  tag?: string;
  isBest: boolean;
  reason?: string;
}

export interface ChartVM {
  /** Stable React key (path for real charts, id for mock). */
  key: string;
  title: string;
  /** Mock mode: inline SVG. Real mode: omit and use `url`. */
  node?: ReactNode;
  /** Real mode: validated absolute URL for a backend chart PNG. */
  url?: string;
}

export interface BestVM {
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

export interface QualityVM {
  score: number;
  issues: string[];
}

export interface ResultsVM {
  isReal: boolean;
  filename: string;
  rows: string;
  cols: string;
  /** Set only when the backend rejected this dataset (data_validity.valid ===
   * false, or recommendations.problem_type === "invalid"). When present, the
   * page renders ONLY this message + a "Try a different file" action, and no
   * Best Model / Comparison / Visual Insights UI is rendered at all. */
  invalidMessage?: string;
  best: BestVM;
  models: CardVM[];
  charts: ChartVM[];
  downloadHref?: string;
  /** Deterministic data-quality score (0-100) + issues, when the backend
   * computed one. Rendered as a compact card above the best-model section. */
  quality?: QualityVM;
}
