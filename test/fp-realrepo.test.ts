import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";
import { createRepoContext } from "../src/plugins/registry.js";
import { createNextjsPlugin } from "../src/plugins/nextjs/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const NEXTJS_SLICE = join(here, "fixtures/fp-realrepo/nextjs-app");

describe("fp-realrepo: Next.js false-positive corpus", () => {
  test("AC-1: Next.js App-Router entry exports are not flagged dead", async () => {
    const result = await scan(NEXTJS_SLICE, DEFAULT_CONFIG, { complexity: false });
    const dead = result.findings.map((f) => `${f.node.name} (${f.node.file})`);
    // Home/RootLayout/metadata/GET + the two transitive consts all read as dead
    // before the plugin; with it registered the slice is clean.
    expect(dead).toEqual([]);
  });
});

describe("fp-realrepo: Next.js plugin keeps genuine dead code visible", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-fp-next-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("AC-1: a genuinely-dead non-entry export in a Next.js repo is still reported", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "14.2.5" } }));
    await mkdir(join(dir, "app"), { recursive: true });
    // A real routing entry — must be alive.
    await writeFile(join(dir, "app", "page.tsx"), "export default function Page() { return null; }\n");
    // A non-entry module with an unused export — must stay dead.
    await writeFile(join(dir, "orphan.ts"), "export function neverUsed() { return 1; }\n");

    const result = await scan(dir, DEFAULT_CONFIG, { complexity: false });
    const names = result.findings.map((f) => f.node.name);
    expect(names).toContain("neverUsed");
    expect(names).not.toContain("Page");
  });
});

describe("nextjs plugin", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-fp-detect-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("detect fires on a next dependency", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "14.2.5" } }));
    const ctx = await createRepoContext(dir);
    expect(createNextjsPlugin().detect(ctx)).toBe(true);
  });

  test("detect fires on a next.config file with no dep", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({}));
    await writeFile(join(dir, "next.config.mjs"), "export default {};\n");
    const ctx = await createRepoContext(dir);
    expect(createNextjsPlugin().detect(ctx)).toBe(true);
  });

  test("detect is false for a non-Next.js repo", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { express: "4" } }));
    const ctx = await createRepoContext(dir);
    expect(createNextjsPlugin().detect(ctx)).toBe(false);
  });

  test("entryPatterns are all prod-kind and cover app/pages/middleware/instrumentation", async () => {
    const ctx = await createRepoContext(dir);
    const specs = createNextjsPlugin().entryPatterns(ctx);
    expect(specs.every((s) => s.kind === "prod")).toBe(true);
    const globs = specs.map((s) => s.glob).join("\n");
    expect(globs).toMatch(/app\/\*\*\//);
    expect(globs).toMatch(/pages\/\*\*/);
    expect(globs).toMatch(/middleware\./);
    expect(globs).toMatch(/instrumentation\./);
    expect(globs).toMatch(/src\/app\/\*\*\//); // src/ variant
  });
});

describe("fp-realrepo: no regression for non-Next.js repos", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-fp-reg-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("AC-2: a plain single-package repo still flags its unused exports", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "plain", main: "src/index.ts" }),
    );
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "src", "index.ts"),
      "export function used() { return 1; }\nexport function unused() { return 2; }\n",
    );
    const result = await scan(dir, DEFAULT_CONFIG, { complexity: false });
    // No Next.js detected → no prod-glob entries → behavior unchanged: the
    // entry file's own unused exports are still reported (file-path seeding only).
    const names = result.findings.map((f) => f.node.name);
    expect(names).toContain("unused");
    expect(names).toContain("used");
  });
});
