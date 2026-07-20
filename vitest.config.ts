import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    // vitest's 5s default races cold ts-morph/tree-sitter startup under
    // coverage instrumentation on a loaded CI runner — already bypassed
    // per-test once (test/cli-baseline.test.ts, 05ef48f). A first bump to
    // 10s here still wasn't enough on one ubuntu-latest/node-22+24 run:
    // test/fix.test.ts's whole suite ran 10-18x slower than local that run
    // (individual tests that finish in ~0.5s locally took 7-9s and passed;
    // three took 11-15s and breached 10s) — genuine runner-load variance,
    // not a hang. 20s clears the observed worst case (14.9s) with margin.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "src/discover.ts",
        "src/glob.ts",
        "src/engine/prod-entries.ts",
        "src/syntactic/parse.ts",
        "src/mcp/tools/scan.ts",
        "src/mcp/tools/verify.ts",
      ],
      // Regression floors set just under the observed baseline (phase 39) —
      // not aspirational targets. A future drop below these trips CI.
      thresholds: {
        "src/discover.ts": { statements: 100, branches: 80, functions: 100, lines: 100 },
        "src/glob.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/engine/prod-entries.ts": { statements: 100, branches: 90, functions: 100, lines: 100 },
        "src/syntactic/parse.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/mcp/tools/scan.ts": { statements: 100, branches: 30, functions: 100, lines: 100 },
        "src/mcp/tools/verify.ts": { statements: 100, branches: 80, functions: 100, lines: 100 },
      },
    },
  },
});
