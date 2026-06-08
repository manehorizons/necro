import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FrameworkPlugin, RepoContext } from "./types.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
}

/** Build a {@link RepoContext} by reading `package.json` and listing the root once. */
export async function createRepoContext(root: string): Promise<RepoContext> {
  const pkg = await readPackageJson(join(root, "package.json"));
  const rootEntries = await readDirSafe(root);

  const allDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);

  return {
    root,
    hasDep: (names) => names.some((n) => allDeps.has(n)),
    hasConfig: (globs) => {
      const matchers = globs.map(globToRegExp);
      return rootEntries.some((entry) => matchers.some((re) => re.test(entry)));
    },
    packageJsonHas: (key) => Object.prototype.hasOwnProperty.call(pkg, key),
  };
}

/** Return the plugins whose `detect()` reports the framework present. */
export function detectPlugins(
  plugins: FrameworkPlugin[],
  ctx: RepoContext,
): FrameworkPlugin[] {
  return plugins.filter((p) => p.detect(ctx));
}

async function readPackageJson(path: string): Promise<PackageJson> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PackageJson;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function readDirSafe(root: string): Promise<string[]> {
  try {
    return await readdir(root);
  } catch {
    return [];
  }
}

/** Minimal glob → RegExp for root-level config patterns (`*` and `?` only). */
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
