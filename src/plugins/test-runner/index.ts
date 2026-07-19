import type { SymbolGraph } from "../../graph/types.js";
import type {
  EntrySpec,
  FrameworkPlugin,
  RepoContext,
  SyntheticEdge,
  TaintRule,
} from "../types.js";
import {
  type ResolvedTestConfig,
  resolveTestConfigSync,
} from "./config-resolution.js";

export interface TestRunnerOptions {
  /** Pre-resolved config (e.g. from the async shell-out path); falls back to a sync static parse. */
  resolved?: ResolvedTestConfig;
}

/**
 * First framework plugin (§6). Does two opposite jobs: keep test infrastructure
 * from being flagged dead (entries), and keep test-only production code from
 * being flagged alive (test-kind edges feed two-color reachability in T5).
 */
export function createTestRunnerPlugin(
  opts: TestRunnerOptions = {},
): FrameworkPlugin {
  return {
    name: "test-runner",

    detect(ctx) {
      return (
        ctx.hasDep([
          "vitest",
          "jest",
          "@jest/core",
          "mocha",
          "@playwright/test",
        ]) ||
        ctx.hasConfig(["vitest.config.*", "jest.config.*"]) ||
        ctx.packageJsonHas("jest")
      );
    },

    entryPatterns(ctx): EntrySpec[] {
      const cfg = opts.resolved ?? resolveTestConfigSync(ctx);
      const globs = [
        ...cfg.testMatch,
        ...cfg.setupFiles,
        ...cfg.globalSetup,
        ...cfg.configFiles,
        "**/__mocks__/**", // jest auto-mock convention
      ];
      return globs.map((glob) => ({ glob, kind: "test" }));
    },

    resolveEdges(_ctx: RepoContext, graph: SymbolGraph): SyntheticEdge[] {
      return matchAutoMocks(graph);
    },

    taintRules(): TaintRule[] {
      return [{ pattern: "jest.mock(<non-literal>)", action: "taint-scope" }];
    },
  };
}

/** Link each `__mocks__/<name>` file to its sibling module — jest loads it implicitly. */
function matchAutoMocks(graph: SymbolGraph): SyntheticEdge[] {
  const files = new Set(graph.nodes.map((n) => n.file));
  const edges: SyntheticEdge[] = [];

  for (const file of files) {
    const posix = file.replace(/\\/g, "/");
    const match = /(.*)\/__mocks__\/([^/]+)$/.exec(posix);
    if (!match) continue;
    const realPosix = `${match[1]}/${match[2]}`;
    for (const candidate of files) {
      if (candidate.replace(/\\/g, "/") === realPosix) {
        edges.push({
          from: candidate,
          to: file,
          kind: "test",
          reason: "jest __mocks__ auto-mock",
        });
      }
    }
  }
  return edges;
}
