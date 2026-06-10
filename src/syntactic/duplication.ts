import type { Token } from "./tokens.js";
import type { CloneLocation, DuplicationFinding } from "./types.js";

/** A function's line span, used to keep clone windows inside one unit. */
export interface UnitRange {
  startLine: number;
  endLine: number;
}

export interface FileTokens {
  file: string;
  tokens: Token[];
  /**
   * Optional function-unit line ranges for this file. When supplied, a clone
   * window is never reported straddling two units (each location stays inside
   * one unit's range). Omitted → every token shares one implicit unit (the
   * pre-boundary behaviour).
   */
  units?: UnitRange[];
}

interface Pos {
  f: number;
  i: number;
}

const BASE = 1_000_003;
const MOD = 2_147_483_647; // a large prime, fits in a JS number

/**
 * Find Type-2 clones across and within files: any normalized token sequence of
 * at least `minTokens` shared by ≥2 locations. Rolling-hash windows are grouped,
 * verified by token equality, greedily extended to the maximal match, and their
 * covered windows marked so each clone is reported once (not as overlapping
 * sub-windows). Operates on the normalized `Token[]` only.
 */
export function findClones(files: FileTokens[], minTokens: number): DuplicationFinding[] {
  const W = minTokens;
  // Intern token strings to integer ids for fast equality + hashing.
  const ids = new Map<string, number>();
  const idOf = (s: string): number => {
    let id = ids.get(s);
    if (id === undefined) {
      id = ids.size + 1;
      ids.set(s, id);
    }
    return id;
  };
  const fileIds = files.map((ft) => ft.tokens.map((t) => idOf(t.norm)));

  // Assign each token to its innermost-enclosing function unit (smallest range
  // containing the token's line); `-1` = module-level / no units supplied. A
  // clone window may never cross a unit boundary — when `units` is omitted every
  // token is `-1`, so nothing is ever split (the pre-boundary behaviour).
  const unitIds = files.map((ft) => {
    const units = ft.units;
    if (!units || units.length === 0) return ft.tokens.map(() => -1);
    return ft.tokens.map((t) => {
      let best = -1;
      let bestSpan = Infinity;
      for (let u = 0; u < units.length; u++) {
        const { startLine, endLine } = units[u]!;
        if (t.line >= startLine && t.line <= endLine) {
          const span = endLine - startLine;
          if (span < bestSpan) {
            bestSpan = span;
            best = u;
          }
        }
      }
      return best;
    });
  });
  // runEnd[f][i] = last index j such that unitIds[f][i..j] all share one unit, so
  // token i+k stays in i's unit iff i+k <= runEnd[f][i]. Used to forbid a window
  // from starting across a boundary and to stop greedy extension at one.
  const runEnd = unitIds.map((ids) => {
    const n = ids.length;
    const re = new Array<number>(n);
    for (let i = n - 1; i >= 0; i--) re[i] = i + 1 < n && ids[i + 1] === ids[i] ? re[i + 1]! : i;
    return re;
  });
  // Does the window [i, i+W) lie entirely within one unit?
  const windowInOneUnit = (f: number, i: number): boolean => i + W - 1 <= runEnd[f]![i]!;

  // Top coefficient BASE^(W-1) mod MOD, for the rolling subtraction.
  let topCoef = 1;
  for (let k = 0; k < W - 1; k++) topCoef = (topCoef * BASE) % MOD;

  const index = new Map<number, Pos[]>();
  const windowHash: number[][] = [];
  for (let f = 0; f < fileIds.length; f++) {
    const arr = fileIds[f]!;
    windowHash[f] = [];
    if (arr.length < W) continue;
    let h = 0;
    for (let i = 0; i < W; i++) h = (h * BASE + arr[i]!) % MOD;
    for (let i = 0; i + W <= arr.length; i++) {
      windowHash[f]![i] = h;
      // Only index windows that stay inside one unit — a window straddling a
      // function boundary is never a clone start.
      if (windowInOneUnit(f, i)) {
        const bucket = index.get(h);
        if (bucket) bucket.push({ f, i });
        else index.set(h, [{ f, i }]);
      }
      // roll forward
      if (i + W < arr.length) {
        h = ((h - arr[i]! * topCoef) % MOD + MOD) % MOD;
        h = (h * BASE + arr[i + W]!) % MOD;
      }
    }
  }

  const windowEqual = (a: Pos, b: Pos): boolean => {
    const ai = fileIds[a.f]!;
    const bi = fileIds[b.f]!;
    for (let k = 0; k < W; k++) if (ai[a.i + k] !== bi[b.i + k]) return false;
    return true;
  };

  const covered = new Set<string>();
  const key = (f: number, i: number): string => `${f}:${i}`;
  const findings: DuplicationFinding[] = [];

  for (let f = 0; f < fileIds.length; f++) {
    const arr = fileIds[f]!;
    for (let i = 0; i + W <= arr.length; i++) {
      if (covered.has(key(f, i))) continue;
      if (!windowInOneUnit(f, i)) continue; // a straddling window is never a clone start
      const self: Pos = { f, i };
      const bucket = index.get(windowHash[f]![i]!) ?? [];
      const members = bucket.filter((p) => (p.f !== f || p.i !== i) && windowEqual(self, p));
      if (members.length === 0) continue;
      const group = [self, ...members];
      if (group.some((p) => covered.has(key(p.f, p.i)))) continue;

      // Greedily extend while every member shares the next token AND that token
      // stays inside the member's own unit — extension stops at the first unit
      // boundary any location would cross.
      let len = W;
      for (;;) {
        const nextId = fileIds[self.f]![self.i + len];
        if (nextId === undefined) break;
        let allMatch = true;
        for (const p of group) {
          if (fileIds[p.f]![p.i + len] !== nextId || p.i + len > runEnd[p.f]![p.i]!) {
            allMatch = false;
            break;
          }
        }
        if (!allMatch) break;
        len++;
      }

      const locations: CloneLocation[] = group.map((p) => {
        const toks = files[p.f]!.tokens;
        return {
          file: files[p.f]!.file,
          startLine: toks[p.i]!.line,
          endLine: toks[p.i + len - 1]!.line,
        };
      });
      findings.push({ tokens: len, locations });

      for (const p of group) {
        for (let k = 0; k + W <= len; k++) covered.add(key(p.f, p.i + k));
      }
    }
  }

  return findings.sort((a, b) => b.tokens - a.tokens);
}
