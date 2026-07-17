import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = join(repoRoot, ".github/workflows/live-accuracy.yml");

describe("scheduled live-accuracy workflow (AC-2)", () => {
  test("runs weekly and on demand, wiring both live eval files with the API key secret (AC-2)", async () => {
    const yaml = await readFile(workflowPath, "utf8");

    // Triggers: weekly cron + manual dispatch.
    expect(yaml).toMatch(/schedule:\s*\n\s*-\s*cron:\s*["']0 6 \* \* 1["']/);
    expect(yaml).toMatch(/workflow_dispatch:/);

    // Runs both existing live eval files with the secret injected.
    expect(yaml).toContain("test/triage-eval.live.test.ts");
    expect(yaml).toContain("test/refactor-eval.live.test.ts");
    expect(yaml).toContain("secrets.ANTHROPIC_API_KEY");

    // Builds before running (live tests exercise built behavior via source, but
    // keep parity with the other workflows' checkout/install/build shape).
    expect(yaml).toMatch(/actions\/checkout@/);
    expect(yaml).toMatch(/actions\/setup-node@/);
    expect(yaml).toContain("npm ci");
  });
});
