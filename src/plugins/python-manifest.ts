import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read Python dependency package names from `pyproject.toml`'s
 * `[project.dependencies]` array (inline or multi-line) and `requirements.txt`
 * — hand-rolled, no new dependency. Version specifiers, extras (`pkg[extra]`),
 * comments, and `-r`/`-e`-style requirements-file directives are stripped;
 * only the bare leading package name is kept.
 */
export function readPythonDependencyNames(root: string): Set<string> {
  const names = new Set<string>();

  const pyproject = readIfExists(join(root, "pyproject.toml"));
  if (pyproject)
    for (const spec of extractDependenciesArray(pyproject))
      addBareName(spec, names);

  const requirements = readIfExists(join(root, "requirements.txt"));
  if (requirements) {
    for (const rawLine of requirements.split(/\r?\n/)) {
      const line = (rawLine.split("#")[0] ?? "").trim();
      if (!line || line.startsWith("-")) continue;
      addBareName(line, names);
    }
  }

  return names;
}

/** True if `pyproject.toml` has a `[header]` top-level section (exact match, e.g. `"project"`, `"build-system"`, `"tool.pytest.ini_options"`). */
export function pyprojectHasSection(root: string, header: string): boolean {
  const source = readIfExists(join(root, "pyproject.toml"));
  if (!source) return false;
  const target = `[${header}]`;
  return source.split(/\r?\n/).some((line) => line.trim() === target);
}

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function addBareName(spec: string, out: Set<string>): void {
  const match = /^[A-Za-z0-9][A-Za-z0-9._-]*/.exec(spec.trim());
  if (match) out.add(match[0]);
}

/** Extract every quoted string in `[project]`'s `dependencies = [...]` array (inline or spanning multiple lines). */
function extractDependenciesArray(source: string): string[] {
  const items: string[] = [];
  let inProject = false;
  let inArray = false;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = (rawLine.split("#")[0] ?? "").trim();

    if (!inArray) {
      const header = /^\[([^\]]+)\]$/.exec(line);
      if (header) {
        inProject = header[1] === "project";
        continue;
      }
      if (!inProject || !/^dependencies\s*=\s*\[/.test(line)) continue;
      inArray = true;
      const afterBracket = line.slice(line.indexOf("[") + 1);
      collectQuotedStrings(afterBracket, items);
      if (line.endsWith("]")) inArray = false;
      continue;
    }

    collectQuotedStrings(line, items);
    if (line.includes("]")) inArray = false;
  }

  return items;
}

function collectQuotedStrings(segment: string, out: string[]): void {
  const re = /"([^"]*)"|'([^']*)'/g;
  for (let m = re.exec(segment); m !== null; m = re.exec(segment)) {
    out.push(m[1] ?? m[2] ?? "");
  }
}
