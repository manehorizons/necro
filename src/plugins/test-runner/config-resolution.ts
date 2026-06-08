import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RepoContext } from "../types.js";

const execFileAsync = promisify(execFile);
const SHELL_TIMEOUT_MS = 30_000;

export type Runner = "jest" | "vitest" | "unknown";

export interface ResolvedTestConfig {
  runner: Runner;
  /** Globs matching test files. */
  testMatch: string[];
  setupFiles: string[];
  globalSetup: string[];
  /** Config files that are themselves entries (consumed by the runner). */
  configFiles: string[];
}

const JEST_DEFAULT_MATCH = ["**/__tests__/**/*.[jt]s?(x)", "**/*.(spec|test).[jt]s?(x)"];
const VITEST_DEFAULT_MATCH = ["**/*.{test,spec}.?(c|m)[jt]s?(x)"];

const VITEST_CONFIG_NAMES = [
  "vitest.config.ts", "vitest.config.mts", "vitest.config.cts",
  "vitest.config.js", "vitest.config.mjs", "vitest.config.cjs",
  "vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs",
];
const JEST_CONFIG_NAMES = [
  "jest.config.ts", "jest.config.js", "jest.config.mjs",
  "jest.config.cjs", "jest.config.json",
];

export function detectRunner(ctx: RepoContext): Runner {
  if (ctx.hasDep(["vitest"]) || ctx.hasConfig(["vitest.config.*", "vite.config.*"])) {
    return "vitest";
  }
  if (ctx.hasDep(["jest", "@jest/core"]) || ctx.packageJsonHas("jest") || ctx.hasConfig(["jest.config.*"])) {
    return "jest";
  }
  return "unknown";
}

/** Static, synchronous config resolution — the fallback that works with the runner uninstalled. */
export function resolveTestConfigSync(ctx: RepoContext): ResolvedTestConfig {
  const runner = detectRunner(ctx);
  const base: ResolvedTestConfig = {
    runner,
    testMatch: [],
    setupFiles: [],
    globalSetup: [],
    configFiles: [],
  };

  if (runner === "vitest") parseVitest(ctx.root, base);
  else if (runner === "jest") parseJest(ctx.root, base);

  if (base.testMatch.length === 0) {
    base.testMatch = runner === "jest" ? JEST_DEFAULT_MATCH : VITEST_DEFAULT_MATCH;
  }
  return base;
}

export type ShellResolver = (
  runner: Runner,
  ctx: RepoContext,
) => Promise<Partial<ResolvedTestConfig> | null>;

export interface ResolveOptions {
  /** Let the runner report its own resolved config. Off by default (CI/untrusted-code safety). */
  consentToShellOut?: boolean;
  /** Injectable resolver; the default shells out to the runner. */
  shellOut?: ShellResolver;
}

const cache = new Map<string, ResolvedTestConfig>();

/**
 * Resolve test config, preferring the runner's own report (shell-out) when the
 * user consents, falling back to the static parse otherwise. Cached by the
 * hashed contents of the discovered config files.
 */
export async function resolveTestConfig(
  ctx: RepoContext,
  opts: ResolveOptions = {},
): Promise<ResolvedTestConfig> {
  const staticConfig = resolveTestConfigSync(ctx);
  const key = cacheKey(ctx.root, staticConfig);
  const cached = cache.get(key);
  if (cached) return cached;

  let resolved = staticConfig;
  if (opts.consentToShellOut) {
    const shellOut = opts.shellOut ?? defaultShellOut;
    const reported = await shellOut(staticConfig.runner, ctx);
    if (reported) resolved = { ...staticConfig, ...reported };
  }

  cache.set(key, resolved);
  return resolved;
}

/**
 * Default shell-out: let the runner report its own resolved config. Sandboxed by
 * cwd + timeout; only invoked with explicit consent. jest exposes `--showConfig`;
 * vitest has no equivalent, so it relies on the static parser above.
 */
const defaultShellOut: ShellResolver = async (runner, ctx) => {
  if (runner !== "jest") return null;
  try {
    const { stdout } = await execFileAsync("npx", ["jest", "--showConfig"], {
      cwd: ctx.root,
      timeout: SHELL_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    return parseJestShowConfig(stdout);
  } catch {
    return null; // runner not installed / failed — fall back to static parse
  }
};

function parseJestShowConfig(stdout: string): Partial<ResolvedTestConfig> | null {
  const parsed = safeJson(stdout);
  if (!parsed || typeof parsed !== "object") return null;
  const configs = (parsed as { configs?: unknown }).configs;
  const first = Array.isArray(configs) ? configs[0] : undefined;
  if (!first || typeof first !== "object") return null;
  const c = first as Record<string, unknown>;
  return {
    testMatch: asStringArray(c.testMatch).map(normalize),
    setupFiles: [
      ...asStringArray(c.setupFiles).map(normalize),
      ...asStringArray(c.setupFilesAfterEach).map(normalize),
    ],
    globalSetup: asStringArray(c.globalSetup).map(normalize),
  };
}

function parseVitest(root: string, out: ResolvedTestConfig): void {
  const found = firstExisting(root, VITEST_CONFIG_NAMES);
  if (!found) return;
  out.configFiles.push(found.name);
  const src = found.contents;
  out.testMatch.push(...extractArray(src, "include").map(normalize));
  out.setupFiles.push(...extractArray(src, "setupFiles").map(normalize));
  out.globalSetup.push(...extractArray(src, "globalSetup").map(normalize));
}

function parseJest(root: string, out: ResolvedTestConfig): void {
  // Dedicated config file first, then package.json#jest.
  const found = firstExisting(root, JEST_CONFIG_NAMES);
  if (found) {
    out.configFiles.push(found.name);
    if (found.name.endsWith(".json")) {
      applyJestObject(safeJson(found.contents), out);
    } else {
      out.testMatch.push(...extractArray(found.contents, "testMatch").map(normalize));
      out.setupFiles.push(
        ...extractArray(found.contents, "setupFiles").map(normalize),
        ...extractArray(found.contents, "setupFilesAfterEach").map(normalize),
      );
      out.globalSetup.push(...extractArray(found.contents, "globalSetup").map(normalize));
    }
    return;
  }

  const pkgPath = join(root, "package.json");
  const pkg = safeJson(readFileSyncSafe(pkgPath));
  if (pkg && typeof pkg === "object" && "jest" in pkg) {
    out.configFiles.push("package.json");
    applyJestObject((pkg as Record<string, unknown>).jest, out);
  }
}

function applyJestObject(jest: unknown, out: ResolvedTestConfig): void {
  if (!jest || typeof jest !== "object") return;
  const j = jest as Record<string, unknown>;
  out.testMatch.push(...asStringArray(j.testMatch).map(normalize));
  out.setupFiles.push(
    ...asStringArray(j.setupFiles).map(normalize),
    ...asStringArray(j.setupFilesAfterEach).map(normalize),
  );
  out.globalSetup.push(...asStringArray(j.globalSetup).map(normalize));
}

interface FoundFile {
  name: string;
  contents: string;
}

function firstExisting(root: string, names: string[]): FoundFile | undefined {
  for (const name of names) {
    const contents = readFileSyncSafe(join(root, name));
    if (contents !== undefined) return { name, contents };
  }
  return undefined;
}

/** Extract string literals from the first `field: [ ... ]` array in source text. */
function extractArray(source: string, field: string): string[] {
  const re = new RegExp(`["']?${field}["']?\\s*:\\s*\\[([\\s\\S]*?)\\]`);
  const match = re.exec(source);
  if (!match || match[1] === undefined) return [];
  return [...match[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1] as string);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}

function normalize(p: string): string {
  return p.replace(/^\.\//, "");
}

function readFileSyncSafe(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function safeJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function cacheKey(root: string, cfg: ResolvedTestConfig): string {
  const stamp = cfg.configFiles
    .map((name) => `${name}:${(readFileSyncSafe(join(root, name)) ?? "").length}`)
    .join("|");
  return `${root}::${cfg.runner}::${stamp}`;
}
