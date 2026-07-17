# SETTLE Summary — 33-01

**Completed:** 2026-07-17T00:54:32.998Z

## Acceptance Criteria

- AC-1: PASS (assertion)
- AC-2: PASS (assertion)
- AC-3: PASS (assertion)
- AC-4: PASS (assertion)
- AC-5: PASS (assertion)

## Tasks

- T1: DONE — README.md: version line v1.0->v1.1; MCP section now lists all 4 tools (scan/verify/verify_removal/explain) with descriptions sourced from src/mcp/tools/*.ts; Roadmap moved explain/verify-removal/Next.js/monorepo into Available today, removed Next.js and monorepo from Planned table (NestJS retained in Planned).
- T2: DONE — website/src/content/docs/reference/cli.md: opt-in/cost note no longer calls explain/SARIF/--fail-on planned (both already shipped, explain now listed as free/local except --narrate); MCP tools table expanded to all 4 tools with input/return columns sourced from src/mcp/tools/*.ts. Note: this file has no standalone "## necro explain" / "## necro verify-removal" command-reference sections (only scan/fix/triage/refactor/mcp do) — out of scope for AC-3 as approved, but worth a follow-up rec since the CLI commands themselves aren't documented outside the MCP section.
- T3: DONE — website/src/content/docs/guide/roadmap.md: added necro explain (+ --narrate) and necro verify-removal bullets to Available today; MCP bullet updated to 4 tools; added Framework plugins bullet (Next.js, monorepo). Planned table's Frameworks row now only NestJS+template-plugins; Scale row (monorepo) removed entirely since nothing else was under it.
- T4: DONE — CHANGELOG.md: appended 6 bullets under the existing [1.2.0] Unreleased > Added heading covering explain, --narrate, verify-removal (+exit-code fix), fix --write --verify gate, --checks repeatable-flag fix, and ci.yml. git diff shows a single hunk touching only that section; released sections untouched.

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- build-test-must-pass: skipped — no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: skipped — not requested (no --deep / --interactive, not in gate set)
- code-review: skipped — not in the active tier × profile gate set
- security-audit: skipped — not in the active tier × profile gate set

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
