/** Which syntactic detector produced a finding. */
export type Detector = "nesting" | "cyclomatic" | "cognitive" | "god-function";

/** A complexity finding — a function flagged by a syntactic detector. */
export interface ComplexityFinding {
  detector: Detector;
  file: string;
  /** 1-based line of the function declaration. */
  line: number;
  name: string;
  /** The measured metric value. */
  value: number;
  /** The threshold it exceeded. */
  threshold: number;
  message: string;
}

/** Detector thresholds (§4 defaults live in config). */
export interface ComplexityThresholds {
  nesting: number;
  cyclomatic: number;
  cognitive: number;
  godFunctionLoc: number;
  godFunctionParams: number;
}
