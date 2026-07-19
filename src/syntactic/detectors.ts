import type { FunctionUnit } from "./ir.js";
import { metrics } from "./metrics.js";
import type { ComplexityFinding, ComplexityThresholds } from "./types.js";

/**
 * Run all four syntactic detectors over one function. Pure: reads the IR
 * (`FunctionUnit`) and thresholds only — never tree-sitter or TS constructs.
 * Metric values come from the shared {@link metrics} — one definition each.
 */
export function detect(
  unit: FunctionUnit,
  t: ComplexityThresholds,
): ComplexityFinding[] {
  const m = metrics(unit);
  return [
    nesting(unit, m.nesting, t),
    cyclomatic(unit, m.cyclomatic, t),
    cognitive(unit, m.cognitive, t),
    godFunction(unit, t),
  ].filter((f): f is ComplexityFinding => f !== null);
}

function nesting(
  unit: FunctionUnit,
  value: number,
  t: ComplexityThresholds,
): ComplexityFinding | null {
  if (value <= t.nesting) return null;
  return finding(
    unit,
    "nesting",
    value,
    t.nesting,
    `nesting depth ${value} > ${t.nesting}`,
  );
}

function cyclomatic(
  unit: FunctionUnit,
  value: number,
  t: ComplexityThresholds,
): ComplexityFinding | null {
  if (value <= t.cyclomatic) return null;
  return finding(
    unit,
    "cyclomatic",
    value,
    t.cyclomatic,
    `cyclomatic complexity ${value} > ${t.cyclomatic}`,
  );
}

function cognitive(
  unit: FunctionUnit,
  value: number,
  t: ComplexityThresholds,
): ComplexityFinding | null {
  if (value <= t.cognitive) return null;
  return finding(
    unit,
    "cognitive",
    value,
    t.cognitive,
    `cognitive complexity ${value} > ${t.cognitive}`,
  );
}

/** God-function: too many lines or too many parameters (simple heuristic). */
function godFunction(
  unit: FunctionUnit,
  t: ComplexityThresholds,
): ComplexityFinding | null {
  const locOver = unit.loc > t.godFunctionLoc;
  const paramsOver = unit.params > t.godFunctionParams;
  if (!locOver && !paramsOver) return null;

  const reasons: string[] = [];
  if (locOver) reasons.push(`${unit.loc} lines > ${t.godFunctionLoc}`);
  if (paramsOver)
    reasons.push(`${unit.params} params > ${t.godFunctionParams}`);
  // Report the LOC overage when present, else the param overage.
  const value = locOver ? unit.loc : unit.params;
  const threshold = locOver ? t.godFunctionLoc : t.godFunctionParams;
  return finding(
    unit,
    "god-function",
    value,
    threshold,
    `god function — ${reasons.join(", ")}`,
  );
}

function finding(
  unit: FunctionUnit,
  detector: ComplexityFinding["detector"],
  value: number,
  threshold: number,
  message: string,
): ComplexityFinding {
  return {
    detector,
    file: unit.file,
    line: unit.line,
    name: unit.name,
    value,
    threshold,
    message,
  };
}
