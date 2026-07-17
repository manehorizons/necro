---
phase: 37-baseline-suppression
id: 37-00
tier: standard
status: PENDING
---

# 37-00 — Baseline file + inline suppression

## Objective

`--fail-on medium` fails immediately on a legacy repo because every pre-existing dead-code and complexity finding gates it, with no adoption ramp — add `necro baseline` (snapshot current findings so they stop gating) and `// necro-ignore` (point suppression for one finding) so an existing repo can adopt `--fail-on` incrementally.

## Acceptance Criteria

### AC-1: `necro baseline` snapshots current findings
Given a repo with existing dead-code and/or complexity findings
When `necro baseline` is run
Then it writes a snapshot file (default `.necro-baseline.json` at the scan target root) recording a stable key for every current dead-code and complexity finding, and the command exits 0.

### AC-2: baselined findings stop gating and stop showing
Given a baseline file exists and the repo is otherwise unchanged
When `necro scan` is run again (terminal output, `--json`, and `--fail-on`)
Then every finding whose key is present in the baseline is excluded from the shown findings and from `--fail-on` gating — a freshly baselined repo passes `--fail-on medium`.

### AC-3: new findings still gate despite a baseline
Given a baseline file exists
When a dead-code or complexity finding appears that is NOT recorded in the baseline (e.g. newly introduced dead code)
Then it still appears in scan output and still triggers `--fail-on` gating — the baseline suppresses only what it recorded, never future regressions.

### AC-4: `// necro-ignore` suppresses one dead-code finding
Given a dead-code finding at a specific declaration
When a `// necro-ignore` comment is placed on the declaration line or the line directly above it
Then `necro scan` excludes that specific finding from output and from `--fail-on` gating, independent of whether a baseline file exists.

## Tasks

### T1: baseline key computation + snapshot read/write
- files: `src/baseline.ts` (new), `test/baseline.test.ts` (new)
- action: Add `src/baseline.ts` exporting: `findingKey(finding: ClassifiedFinding): string` (use `finding.node.id`, already `${file}:${line}:${name}` per `src/graph/types.ts`), `complexityKey(finding: ComplexityFinding): string` (`${detector}:${file}:${line}:${name}`), `readBaseline(path: string): Promise<Set<string> | undefined>` (returns `undefined` if the file doesn't exist — not an error), and `writeBaseline(path: string, keys: string[]): Promise<void>` (plain JSON, sorted keys for diffability: `{ "version": 1, "keys": [...] }`).
- verify: `npm run typecheck`; unit tests in `test/baseline.test.ts` cover key stability (same finding → same key across two calls) and a read/write roundtrip
- done: AC-1

### T2: `necro baseline` CLI command
- files: `src/cli.ts`
- action: Add a new `program.command("baseline")` (argument `[path]` default `.`, mirroring `scan`'s target resolution) that runs `scan()`, computes keys for every dead-code + complexity finding via T1's helpers, calls `writeBaseline` to `<target>/.necro-baseline.json`, prints a one-line summary (`baseline: N findings recorded`), and always exits 0 — this command is a snapshot writer, not a gate, so it takes no `--fail-on` option.
- verify: `npm run typecheck`; integration test in T5 confirms the file is created with expected keys and exit code 0
- done: AC-1

### T3: wire baseline subtraction into `scan`
- files: `src/cli.ts`
- action: In the `scan` command action, after `loadConfig` and before computing `full`/`shown`, attempt `readBaseline(join(target, ".necro-baseline.json"))`. If a baseline `Set` is returned, filter `findings` to drop entries whose `findingKey(...)` is in the set, and filter `complexity` to drop entries whose `complexityKey(...)` is in the set, before those arrays are used for `full`, `shown`, JSON, terminal render, SARIF, and `--fail-on` gating (i.e. filter once, upstream of all those consumers — do not filter each consumer separately).
- verify: `npm run typecheck`; integration tests in T5 cover AC-2 (baselined finding disappears, `--fail-on medium` passes) and AC-3 (a finding introduced after baselining still shows and still gates)
- done: AC-2, AC-3

### T4: `// necro-ignore` inline suppression
- files: `src/baseline.ts`, `src/cli.ts`
- action: Add `isIgnored(file: string, line: number): boolean` to `src/baseline.ts` — reads the source file (cache per-file line arrays within one `scan` invocation to avoid re-reading the same file per finding) and returns true if line `line` or line `line - 1` (1-based) contains a `// necro-ignore` comment. Wire it into the same `scan` filtering step from T3: drop a dead-code finding when `isIgnored(finding.node.file, finding.node.line)` is true, applied independently of whether a baseline file exists.
- verify: `npm run typecheck`; integration test in T5 covers AC-4 (finding suppressed with the comment present, still reported without it)
- done: AC-4

### T5: integration tests for the CLI surface
- files: `test/cli-baseline.test.ts` (new)
- action: Using the `mkdtemp` + `execFile dist/cli.js` pattern from `test/cli-verify-removal.test.ts`, add cases: (a) `necro baseline` on a fixture with one dead-code finding creates `.necro-baseline.json` and exits 0 (AC-1); (b) after baselining, `necro scan --fail-on medium` exits 0 and the finding is absent from `--json` output (AC-2); (c) after baselining, adding a second dead export and re-scanning shows only the new finding and `--fail-on medium` exits 1 (AC-3); (d) a fixture with `// necro-ignore` above a dead export's declaration is absent from scan output with no baseline file present at all (AC-4).
- verify: `npm run build && npm test`
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT extend baseline/suppression coverage to duplication or hotspot findings — both are always-advisory (`low` severity) per `src/report/severity.ts` and out of scope per the SPEC's Constraints.
- DO NOT update `website/src/content/docs/reference/cli.md` or `README.md` in this phase — this project's convention (phases 33/34) is a dedicated doc-sync phase after a feature lands, not bundled into the feature phase itself.
- DO NOT invent a new "stale baseline entry" warning (recording a key for a finding that no longer exists) — the SPEC left this as an explicit open question, not a requirement; a silent overwrite on each `necro baseline` run satisfies AC-1.
- DO NOT change `config.ignore` (file/glob-level ignore) — it already exists and is unrelated to this point-suppression feature.
