---
phase: 31-checks-parsing
id: 31-01
tier: standard
status: PENDING
---

# 31-01 — Fix --checks CLI parsing: repeatable flag instead of comma-split

## Objective

Replace `--checks`'s comma-split parsing in `verify-removal` and `fix --verify` with a repeatable `--checks <cmd>` flag, so a check command containing a comma is passed through verbatim instead of being shredded into a malformed shell fragment that gets misreported as a false "removal breaks the build" verdict.

## Acceptance Criteria

### AC-1: repeated --checks flags each become one check command, in order
Given `verify-removal <symbol> --checks "npm run typecheck" --checks "npm test"`
When the CLI parses options
Then `verifyRemovals` is called with `checks: ["npm run typecheck", "npm test"]` (two distinct commands, original order preserved)

### AC-2: a comma inside a single check command is not split
Given `verify-removal <symbol> --checks "npm test -- --grep a,b"`
When the CLI parses options
Then the check is run as the single literal command `npm test -- --grep a,b` (not shredded into `npm test -- --grep a` and `b`), and a check command that legitimately fails still reports the correct verdict rather than a shell-syntax-error false positive

### AC-3: omitting --checks keeps the existing default
Given `verify-removal <symbol>` or `fix --verify` with no `--checks` flag at all
When the CLI parses options
Then `checks` is `undefined` and the callee's existing default (typecheck + tests) applies unchanged

### AC-4: fix --checks (used with --verify) shares the same fix
Given `fix <path> --verify --checks "cmd1" --checks "cmd2"`
When the CLI parses options
Then `runFix` receives `checks: ["cmd1", "cmd2"]` via the same repeatable-flag parsing as verify-removal — no duplicated comma-split bug left in the `fix` command path

## Tasks

### T1: verify-removal — repeatable --checks flag
- files: `src/cli.ts`
- action: On the `verify-removal` command (~line 164), replace `.option("--checks <list>", "comma-separated check commands (default: typecheck + tests)")` with a repeatable option using a Commander accumulator function (`(val, prev) => prev.concat([val])`, seeded `[]`), update the description to reflect "repeatable flag, one command per occurrence", update `VerifyRemovalOptions.checks` to `string[]`, and replace the `opts.checks.split(",")...` block (~line 168-170) with `opts.checks?.length ? opts.checks : undefined`.
- verify: `npm run typecheck`; new CLI tests in T3 pass
- done: AC-1, AC-2, AC-3

### T2: fix --verify — repeatable --checks flag
- files: `src/cli.ts`
- action: Apply the identical change to the `fix` command's `--checks` option (~line 199) and its `FixOptions.checks` type / parsing block (~line 204-206).
- verify: `npm run typecheck`; new CLI tests in T3 pass
- done: AC-4

### T3: tests for repeatable flag + comma passthrough
- files: `test/cli-verify-removal.test.ts`, `test/fix.test.ts` (or the CLI-level fix test file if separate)
- action: Add cases covering: (a) two `--checks` occurrences produce two distinct check runs on `verify-removal`, (b) a single `--checks` value containing a comma runs as one literal command and is not shredded, (c) no `--checks` flag still applies the default, (d) `fix --verify` with repeated `--checks` behaves the same as verify-removal.
- verify: `npm test`
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT change the MCP tool's `checks` handling (`arguments.checks`) — it already accepts a `string[]` directly and is unaffected by this CLI-only parsing bug.
- DO NOT change the signatures of `verifyRemovals` or `runFix` — both already accept `checks?: string[]`; only the CLI-layer parsing changes.
- DO NOT address rec-20260701-001 (CI workflow) or rec-20260701-004 (doc sync) in this phase — separate recs, separate phases.
