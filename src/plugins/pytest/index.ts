import type { EntrySpec, FrameworkPlugin, RepoContext } from "../types.js";

/**
 * pytest framework plugin (§2.3): roots pytest's test-glob conventions as
 * real test entries, so a `test_*.py`/`*_test.py`/`tests/**` file's top-level
 * declarations are test-reachable instead of relying on phase 45's `test_`
 * "exported" tier-bump stopgap. Contributes no synthetic edges or taint rules.
 */
export function createPytestPlugin(): FrameworkPlugin {
  return {
    name: "pytest",

    detect(ctx: RepoContext): boolean {
      return (
        ctx.hasDep(["pytest"]) ||
        ctx.hasConfig(["pytest.ini"]) ||
        ctx.pyprojectHas("tool.pytest.ini_options")
      );
    },

    entryPatterns(): EntrySpec[] {
      return [
        { glob: "**/test_*.py", kind: "test" },
        { glob: "**/*_test.py", kind: "test" },
        { glob: "**/tests/**", kind: "test" },
      ];
    },

    resolveEdges() {
      return [];
    },

    taintRules() {
      return [];
    },
  };
}
