import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import picomatch from "picomatch";

/** What the monorepo passes downstream: alias resolution + entry rooting. */
export interface WorkspaceInfo {
  /** pkg name → absolute entry file, for ts-morph `paths` cross-package resolution. */
  packagePaths: Map<string, string>;
  /** All member entry files (absolute), for prod-entry rooting. */
  entryFiles: string[];
}

const EMPTY: WorkspaceInfo = { packagePaths: new Map(), entryFiles: [] };

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".next"]);
const MAX_DEPTH = 6;

/**
 * Resolve workspace members for a monorepo root. Detects npm/yarn (`workspaces`
 * in the root `package.json`) and pnpm (`pnpm-workspace.yaml`), enumerates the
 * member packages, and maps each package name to its entry file. Returns empty
 * info (and never throws) when no workspaces are declared or manifests are
 * malformed.
 */
export async function resolveWorkspaces(root: string): Promise<WorkspaceInfo> {
  const globs = await workspaceGlobs(root);
  if (globs.length === 0) return EMPTY;

  const isMemberDir = picomatch(globs);
  const packagePaths = new Map<string, string>();
  const entryFiles: string[] = [];

  for (const dir of await memberDirs(root)) {
    const rel = relative(root, dir).replace(/\\/g, "/");
    if (rel === "" || !isMemberDir(rel)) continue;

    const pkg = await readJsonSafe(join(dir, "package.json"));
    if (!pkg || typeof pkg.name !== "string") continue;

    const entryRel = manifestEntry(pkg);
    if (!entryRel) continue;
    const entryAbs = join(dir, entryRel);

    packagePaths.set(pkg.name, entryAbs);
    entryFiles.push(entryAbs);
  }

  return { packagePaths, entryFiles };
}

/** Collect workspace globs from npm/yarn `workspaces` and pnpm-workspace.yaml. */
async function workspaceGlobs(root: string): Promise<string[]> {
  const globs: string[] = [];

  const pkg = await readJsonSafe(join(root, "package.json"));
  const ws = pkg?.workspaces;
  if (Array.isArray(ws)) globs.push(...ws.filter((g): g is string => typeof g === "string"));
  else if (ws && typeof ws === "object" && Array.isArray((ws as { packages?: unknown }).packages)) {
    globs.push(
      ...(ws as { packages: unknown[] }).packages.filter((g): g is string => typeof g === "string"),
    );
  }

  const pnpm = await readFileSafe(join(root, "pnpm-workspace.yaml"));
  if (pnpm) globs.push(...parsePnpmPackages(pnpm));

  return globs.map((g) => g.replace(/\/+$/, ""));
}

/** All directories under `root` that contain a `package.json` (excluding root). */
async function memberDirs(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const hasManifest = entries.some((e) => e.isFile() && e.name === "package.json");
    if (hasManifest && dir !== root) out.push(dir);
    for (const e of entries) {
      if (!e.isDirectory() || IGNORE_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      await walk(join(dir, e.name), depth + 1);
    }
  }

  await walk(root, 0);
  return out;
}

/** First entry file (rel) from `main`/`module`/`exports`, normalized of a leading `./`. */
function manifestEntry(pkg: Record<string, unknown>): string | undefined {
  const candidates: string[] = [];
  collectStrings(pkg.main, candidates);
  collectStrings(pkg.module, candidates);
  collectStrings(pkg.exports, candidates);
  const first = candidates.find((c) => /\.[cm]?[jt]sx?$/.test(c));
  return first?.replace(/^\.\//, "");
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) collectStrings(v, out);
}

/**
 * Extract globs from a `pnpm-workspace.yaml` `packages:` block list. Handles the
 * near-universal block form (`packages:` then indented `- 'glob'` items); does
 * not attempt full YAML.
 */
function parsePnpmPackages(text: string): string[] {
  const out: string[] = [];
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s+-\s*(.+?)\s*$/.exec(line);
    if (item) {
      out.push(stripQuotes(item[1] as string));
      continue;
    }
    if (line.trim() === "") continue;
    if (/^\S/.test(line)) break; // dedent → next top-level key
  }
  return out;
}

function stripQuotes(s: string): string {
  return s.replace(/^['"]|['"]$/g, "");
}

async function readJsonSafe(path: string): Promise<Record<string, unknown> | undefined> {
  const text = await readFileSafe(path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function readFileSafe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}
