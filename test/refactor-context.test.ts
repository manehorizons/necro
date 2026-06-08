import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ComplexityFinding } from "../src/syntactic/types.js";
import { contextForFinding } from "../src/refactor/context.js";

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
