import { execFile } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { classify, type ClassifiedFinding } from "../src/analyze/classify.js";
import { loadConfig } from "../src/config.js";
import { discoverFiles } from "../src/discover.js";
import { buildReachabilityModel } from "../src/engine/model.js";
import { resolveProdEntries } from "../src/engine/prod-entries.js";
import { fixExitCode, runFix } from "../src/fix/index.js";

const exec = promisify(execFile);

/**
 * Adversarial entry-resolution corpus harness (handoff §4/§6 step 1).
 *
 * T1 authored this against the pre-slice APIs (bare `Set<string>`, no
 * `entryCollapse`, no `refused-no-entries`) to record the red/green baseline
 * on `main` before any implementation landed (see 28-01-DRAFT.md, Baseline
 * Evidence). T2-T6 then evolved it in place, task by task, to assert against
 * the finished feature.
 */

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "entry-resolution/fixtures");

interface ExpectedEntry {
  file: string;
  source?: string;
}

interface ExpectedSymbol {
  name: string;
  file: string;
  verdict: "alive" | "dead" | "test-only";
  tier?: "certain" | "likely" | "maybe";
  autoFixEligible?: boolean;
  evidenceContains?: Array<{ ok: boolean | null; text: string }>;
}

interface ExpectedCase {
  case: string;
  baseline: "red" | "green";
  prodEntryCount: number;
  entries: ExpectedEntry[];
  symbols: ExpectedSymbol[];
  fix?: { write: boolean; status: string; exitCode: number };
}

async function listCases(): Promise<Array<{ dir: string; expected: ExpectedCase }>> {
  const names = (await readdir(FIXTURES_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const dir = join(FIXTURES_DIR, name);
      const expected = JSON.parse(
        await readFile(join(dir, "expected.json"), "utf8"),
      ) as ExpectedCase;
      return { dir, expected };
    }),
  );
}

const tmpDirs: string[] = [];
async function copyFixture(caseDir: string): Promise<string> {
  const tmp = await mkdtemp(join(tmpdir(), "necro-entryres-"));
  await cp(caseDir, tmp, { recursive: true });
  tmpDirs.push(tmp);
  return tmp;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function relFile(root: string, abs: string): string {
  return relative(root, abs).split("\\").join("/");
}

describe.each((await listCases()))("entry-resolution corpus: $expected.case ($expected.baseline)", ({ dir, expected }) => {
  test(`resolves entries and per-symbol tiers (${expected.case})`, async () => {
    const root = await copyFixture(dir);
    const config = await loadConfig(root);
    const model = await buildReachabilityModel(root, config);

    const entryFiles = [...model.prodEntries]
      .map((f) => relFile(root, f))
      .filter((f) => !f.includes(":")) // drop plugin-rooted symbol ids (none expected here)
      .sort();
    expect(entryFiles).toEqual(expected.entries.map((e) => e.file).sort());
    expect(entryFiles.length).toBe(expected.prodEntryCount);

    const findings: ClassifiedFinding[] = classify({
      nodes: model.graph.nodes,
      reachability: model.reachability,
      entryCollapse: model.entryResolution.collapsed,
    });

    for (const sym of expected.symbols) {
      const node = model.graph.nodes.find(
        (n) => n.name === sym.name && relFile(root, n.file) === sym.file,
      );
      expect(node, `expected node ${sym.name} in ${sym.file} to exist`).toBeDefined();
      const finding = findings.find((f) => f.node.id === node?.id);

      if (sym.verdict === "alive") {
        expect(finding, `expected ${sym.name} to be alive (no finding)`).toBeUndefined();
        continue;
      }

      expect(finding, `expected a finding for ${sym.name}`).toBeDefined();
      if (!finding) continue;
      expect(finding.verdict).toBe(sym.verdict);
      if (sym.tier) expect(finding.tier).toBe(sym.tier);
      if (sym.autoFixEligible !== undefined) expect(finding.autoFixEligible).toBe(sym.autoFixEligible);
      for (const ev of sym.evidenceContains ?? []) {
        expect(
          finding.evidence.some((sig) => sig.ok === ev.ok && sig.text === ev.text),
          `expected evidence signal ${JSON.stringify(ev)} in ${JSON.stringify(finding.evidence)}`,
        ).toBe(true);
      }
    }
  });

  test(`fix status + exit code (${expected.case})`, async () => {
    if (!expected.fix) return;
    const root = await copyFixture(dir);
    const config = await loadConfig(root);
    const result = await runFix(root, config, { write: expected.fix.write });
    expect(result.status as string).toBe(expected.fix.status);
    expect(fixExitCode(result.status)).toBe(expected.fix.exitCode);
  });
});

describe("dist-heuristic case 3 — both resolution paths (AC-1, AC-2)", () => {
  test("resolves normally (convention acceptable)", async () => {
    const root = await copyFixture(join(FIXTURES_DIR, "dist-heuristic"));
    const config = await loadConfig(root);
    const files = await discoverFiles(root, config);
    const { entries } = await resolveProdEntries(root, files);
    expect([...entries].map((f) => relFile(root, f))).toContain("src/index.ts");
  });

  test("still resolves via the heuristic mapping alone, with the conventional candidate removed", async () => {
    const root = await copyFixture(join(FIXTURES_DIR, "dist-heuristic"));
    const config = await loadConfig(root);
    const files = await discoverFiles(root, config);
    const { entries, records } = await resolveProdEntries(root, files, { conventions: false });
    const rel = [...entries].map((f) => relFile(root, f));
    expect(rel).toContain("src/index.ts");
    const record = records.find((r) => relFile(root, r.file) === "src/index.ts");
    expect(record?.source).toBe("mapped");
  });
});

describe("fix refusal precedence (AC-4)", () => {
  test("no-entries wins over a dirty tree", async () => {
    const caseDir = join(FIXTURES_DIR, "no-entries");
    const root = await copyFixture(caseDir);
    await exec("git", ["init", "-q"], { cwd: root });
    await exec("git", ["config", "user.email", "t@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "T"], { cwd: root });
    await exec("git", ["add", "-A"], { cwd: root });
    await exec("git", ["commit", "-q", "-m", "init"], { cwd: root });
    // dirty the tree
    await cp(join(caseDir, "package.json"), join(root, "extra.json"));

    const config = await loadConfig(root);
    const result = await runFix(root, config, { write: true });
    expect(result.status).toBe("refused-no-entries");
    expect(fixExitCode(result.status)).toBe(3);
  });
});
