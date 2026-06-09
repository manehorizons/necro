import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ComplexityFinding, DuplicationFinding } from "../src/syntactic/types.js";
import { contextForFinding, dupContextForFinding } from "../src/refactor/context.js";

const godFinding = (file: string, line: number, name: string): ComplexityFinding => ({
  detector: "god-function",
  file,
  line,
  name,
  value: 80,
  threshold: 50,
  message: `god function — 80 lines > 50`,
});

describe("contextForFinding (AC-2)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-refctx-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("re-reads the god function body and includes its signature (AC-2)", async () => {
    const file = join(dir, "svc.ts");
    await writeFile(
      file,
      [
        'import { Client } from "./client.js";',
        "",
        "export function bigHandler(req, res) {",
        "  const a = step1(req);",
        "  const b = step2(a);",
        "  return res.send(b);",
        "}",
        "",
      ].join("\n"),
    );

    const ctx = await contextForFinding(godFinding(file, 3, "bigHandler"), 1);

    expect(ctx.finding.name).toBe("bigHandler");
    expect(ctx.snippet.file).toBe(file);
    expect(ctx.snippet.code).toContain("export function bigHandler(req, res) {");
    expect(ctx.snippet.code).toContain("return res.send(b);");
  });

  test("captures the file's import lines for call-surface preservation (AC-2)", async () => {
    const file = join(dir, "svc.ts");
    await writeFile(
      file,
      [
        'import { Client } from "./client.js";',
        'import type { Req } from "./types.js";',
        "",
        "export function bigHandler(req, res) {",
        "  return 1;",
        "}",
      ].join("\n"),
    );

    const ctx = await contextForFinding(godFinding(file, 4, "bigHandler"), 1);

    expect(ctx.imports).toContain('import { Client } from "./client.js";');
    expect(ctx.imports).toContain('import type { Req } from "./types.js";');
  });

  test("rejects a non-god-function finding (AC-2)", async () => {
    const file = join(dir, "svc.ts");
    await writeFile(file, "function f() { return 1; }\n");
    const cyclomatic = { ...godFinding(file, 1, "f"), detector: "cyclomatic" as const };

    await expect(contextForFinding(cyclomatic, 1)).rejects.toThrow(/god-function/);
  });
});

describe("dupContextForFinding (AC-2)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-dupctx-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const dup = (locations: DuplicationFinding["locations"], tokens = 30): DuplicationFinding => ({
    tokens,
    locations,
  });

  test("re-reads every clone location's slice and its file's imports (AC-2)", async () => {
    const a = join(dir, "a.ts");
    const b = join(dir, "b.ts");
    await writeFile(
      a,
      [
        'import { db } from "./db.js";',
        "export function loadA() {",
        "  const rows = db.query('a');",
        "  return rows.map((r) => r.id);",
        "}",
      ].join("\n"),
    );
    await writeFile(
      b,
      [
        'import { db } from "./db.js";',
        "export function loadB() {",
        "  const rows = db.query('b');",
        "  return rows.map((r) => r.id);",
        "}",
      ].join("\n"),
    );

    const ctx = await dupContextForFinding(
      dup([
        { file: a, startLine: 3, endLine: 4 },
        { file: b, startLine: 3, endLine: 4 },
      ]),
    );

    expect(ctx.locations).toHaveLength(2);
    expect(ctx.locations[0]?.snippet.file).toBe(a);
    expect(ctx.locations[0]?.snippet.code).toContain("const rows = db.query('a');");
    expect(ctx.locations[0]?.imports).toContain('import { db } from "./db.js";');
    expect(ctx.locations[1]?.snippet.code).toContain("const rows = db.query('b');");
  });

  test("captures multiple locations in the same file, reading it once (AC-2)", async () => {
    const f = join(dir, "dup.ts");
    await writeFile(
      f,
      [
        "function one() {",
        "  const x = compute(1);", // 2
        "  return x + 1;", // 3
        "}",
        "function two() {",
        "  const x = compute(1);", // 6
        "  return x + 1;", // 7
        "}",
      ].join("\n"),
    );

    const ctx = await dupContextForFinding(
      dup([
        { file: f, startLine: 2, endLine: 3 },
        { file: f, startLine: 6, endLine: 7 },
      ]),
    );

    expect(ctx.locations).toHaveLength(2);
    expect(ctx.locations[0]?.location.startLine).toBe(2);
    expect(ctx.locations[1]?.location.startLine).toBe(6);
    expect(ctx.locations[1]?.snippet.code).toContain("6\t  const x = compute(1);");
  });

  test("rejects a clone group with fewer than two locations (AC-2)", async () => {
    const f = join(dir, "x.ts");
    await writeFile(f, "function f() { return 1; }\n");
    await expect(dupContextForFinding(dup([{ file: f, startLine: 1, endLine: 1 }]))).rejects.toThrow(
      /≥2 locations/,
    );
  });
});
