import type { FunctionUnit } from "./ir.js";
import type { ComplexityFinding, ComplexityThresholds } from "./types.js";

/**
 * Run all four syntactic detectors over one function. Pure: reads the IR
 * (`FunctionUnit`) and thresholds only — never tree-sitter or TS constructs.
 */
export function detect(unit: FunctionUnit, t: ComplexityThresholds): ComplexityFinding[] {
  return [nesting(unit, t), cyclomatic(unit, t), cognitive(unit, t), godFunction(unit, t)].filter(
    (f): f is ComplexityFinding => f !== null,
  );
}

/** Max nesting level reached (a nesting structure at `depth` sits at level `depth + 1`). */
function nesting(unit: FunctionUnit, t: ComplexityThresholds): ComplexityFinding | null {
  let max = 0;
  for (const c of unit.controlNodes) {
    if (c.nests) max = Math.max(max, c.depth + 1);
  }
  if (max <= t.nesting) return null;
  return finding(unit, "nesting", max, t.nesting, `nesting depth ${max} > ${t.nesting}`);
}

/** Cyclomatic complexity: 1 + one per branch/loop/case/catch/ternary/boolean-op. */
function cyclomatic(unit: FunctionUnit, t: ComplexityThresholds): ComplexityFinding | null {
  const value = 1 + unit.controlNodes.length;
  if (value <= t.cyclomatic) return null;
  return finding(unit, "cyclomatic", value, t.cyclomatic, `cyclomatic complexity ${value} > ${t.cyclomatic}`);
}

/** Cognitive complexity (Sonar model): nesting structures cost `1 + depth`;
 * short-circuit operators cost a flat 1 — so nested code scores worse. */
function cognitive(unit: FunctionUnit, t: ComplexityThresholds): ComplexityFinding | null {
  let value = 0;
  for (const c of unit.controlNodes) value += c.nests ? 1 + c.depth : 1;
  if (value <= t.cognitive) return null;
  return finding(unit, "cognitive", value, t.cognitive, `cognitive complexity ${value} > ${t.cognitive}`);
}

/** God-function: too many lines or too many parameters (simple heuristic). */
function godFunction(unit: FunctionUnit, t: ComplexityThresholds): ComplexityFinding | null {
  const locOver = unit.loc > t.godFunctionLoc;
  const paramsOver = unit.params > t.godFunctionParams;
  if (!locOver && !paramsOver) return null;

  const reasons: string[] = [];
  if (locOver) reasons.push(`${unit.loc} lines > ${t.godFunctionLoc}`);
  if (paramsOver) reasons.push(`${unit.params} params > ${t.godFunctionParams}`);
  // Report the LOC overage when present, else the param overage.
  const value = locOver ? unit.loc : unit.params;
  const threshold = locOver ? t.godFunctionLoc : t.godFunctionParams;
  return finding(unit, "god-function", value, threshold, `god function — ${reasons.join(", ")}`);
}

function finding(
  unit: FunctionUnit,
  detector: ComplexityFinding["detector"],
  value: number,
  threshold: number,
  message: string,
): ComplexityFinding {
  return { detector, file: unit.file, line: unit.line, name: unit.name, value, threshold, message };
}
