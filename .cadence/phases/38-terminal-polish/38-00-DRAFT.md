---
phase: 38-terminal-polish
id: 38-00
tier: standard
status: PENDING
---

# 38-00 — Terminal polish: relative paths, TTY color, stderr progress, merged clone windows

## Objective

`necro scan`'s human-readable output prints full absolute paths, has zero ANSI color, gives no progress feedback on large repos or during `verify-removal`'s per-symbol checks, and lists the same overlapping same-file clone location repeatedly (audit evidence: one clone group rendered as 8 overlapping `util.ts:31-33` entries) — polish the terminal-output layer only, leaving `--json` and `--sarif` byte-for-byte unaffected.

## Acceptance Criteria

### AC-1: terminal output shows paths relative to the invocation directory
Given a scan run from a directory, with findings/complexity/hotspots/duplication in files under it
When the terminal (non-`--json`) report is rendered
Then every file path shown is relative to `process.cwd()` (the same root SARIF already relativizes against), not the absolute path currently printed.

### AC-2: color is applied only when the output stream is an interactive TTY, and never when NO_COLOR is set
Given `necro scan`'s stdout is a TTY and `NO_COLOR` is unset
When the terminal report is rendered
Then tier/verdict text carries ANSI color codes; given stdout is piped/redirected (not a TTY) OR `NO_COLOR` is set, the rendered text is emitted with no ANSI codes at all.

### AC-3: `scan` and `verify-removal` emit progress on stderr, unconditionally
Given a `necro scan` run with the syntactic (complexity/duplication) axis enabled, or a `necro verify-removal` run over N symbols
When the command runs
Then progress messages are written to stderr as the run proceeds — at least one message per major scan phase, and one per symbol for `verify-removal` (e.g. `[2/5] verifying <symbol>...`) — while stdout carries only the final report/JSON, so piping stdout to a file or another process never captures progress noise.

### AC-4: overlapping same-file clone locations are merged before display
Given a single duplication finding whose `locations` include two or more entries in the same file with overlapping or touching line ranges (the audit's observed case: 8 near-identical `util.ts:31-33` entries from one clone group)
When the duplication section of the terminal report is rendered
Then those same-file overlapping/touching locations are merged into one displayed range per file, so the 8-entry case above renders as a single `util.ts:<merged-range>` line — the underlying `DuplicationFinding[]` data (and `--json`/`--sarif` output derived from it) is unchanged; only the terminal rendering merges.

## Tasks

### T1: shared relative-path helper, extracted from SARIF's existing logic
- files: `src/report/paths.ts` (new), `src/report/sarif.ts`, `test/report-paths.test.ts` (new)
- action: Add `toRelativePath(file: string, root: string): string` to a new `src/report/paths.ts` — identical logic to the `toUri` helper currently inlined in `src/report/sarif.ts:67-70` (absolute paths become `relative(root, file)`, backslashes normalized to `/`; an already-relative path passes through unchanged). Replace `sarif.ts`'s local `toUri` body with a call to the shared helper — `--sarif` output must stay byte-for-byte identical (verified by the existing `test/scan-ci.test.ts` SARIF schema test).
- verify: `npm run typecheck`; new unit tests for `toRelativePath`; `test/scan-ci.test.ts`'s SARIF test still passes unchanged
- done: AC-1

### T2: thread relative paths through the terminal renderers
- files: `src/report/terminal.ts`, `src/report/evidence.ts`, `src/report/complexity.ts`, `src/report/duplication.ts`, `src/report/hotspots.ts`, `src/cli.ts`
- action: Add a required `root: string` parameter to `renderTerminal`, `renderEvidenceChain`/`renderFindings`, `renderComplexity`, `renderHotspots`, and `renderDuplication`, and use T1's `toRelativePath(file, root)` everywhere a file path is currently interpolated raw (`node.file`, `f.file`, `e.file`, `l.file`). `root` is required (not defaulted) so every call site states its root explicitly, matching how `toSarif` already requires `srcRoot`. Wire the `scan` command in `cli.ts` to pass `root: process.cwd()` — the same value it already passes as `srcRoot` to `toSarif`.
- verify: `npm run typecheck`; existing report unit tests updated to pass an explicit `root` (no behavior change to their assertions beyond the new required param)
- done: AC-1

### T3: TTY-aware color helper, wired into evidence-chain rendering
- files: `src/report/color.ts` (new), `src/report/evidence.ts`, `src/report/terminal.ts`, `src/cli.ts`, `test/report-color.test.ts` (new)
- action: Add `src/report/color.ts` exporting `supportsColor(stream: NodeJS.WriteStream): boolean` (`Boolean(stream.isTTY) && !process.env.NO_COLOR`) and small ANSI wrapper functions (`red`, `yellow`, `dim`, `green`) each taking `(text: string, enabled: boolean)` and returning the text unchanged when `enabled` is `false`. Add a required `color: boolean` parameter to `renderEvidenceChain`/`renderFindings`/`renderTerminal`, applying it to: the tier word in the evidence-chain header (`certain`=red, `likely`=yellow, `maybe`=dim) and the ✓/✗ glyphs (green/red respectively; `•` stays uncolored). Wire `cli.ts`'s `scan` command to pass `color: supportsColor(process.stdout)`.
- verify: `npm run typecheck`; new unit tests cover `supportsColor`'s TTY×NO_COLOR matrix and that wrapper functions no-op when `enabled` is `false`; existing `test/evidence.test.ts` assertions keep passing by passing `color: false` explicitly
- done: AC-2

### T4: stderr progress for `scan` and `verify-removal`
- files: `src/engine/index.ts`, `src/engine/verify-removal.ts`, `src/cli.ts`
- action: Add optional `onProgress?: (message: string) => void` to `ScanOptions` (`src/engine/index.ts`), called once before `buildReachabilityModel` (`"resolving reachability..."`) and, only when the heavy axis runs, once before `analyzeHeavy` (`"analyzing complexity + duplication..."`). Add optional `onProgress?: (symbol: string, index: number, total: number) => void` to `VerifyRemovalOptions` (`src/engine/verify-removal.ts`), called at the top of each iteration of the `for (const symbol of symbols)` loop in `verifyRemovals`. Wire both from `cli.ts`: the `scan` and `verify-removal` command actions pass callbacks that `process.stderr.write` one line per call (`[i/total] verifying <symbol>...\n` for the latter) — unconditional, not gated on TTY (stderr progress must survive a piped/redirected stdout). Omitting `onProgress` (every existing test and library caller) keeps today's behavior exactly — no stderr writes, no new required params on either function's existing signature.
- verify: `npm run typecheck`; existing `scan()`/`verifyRemovals()` unit tests pass unchanged (they don't pass `onProgress`)
- done: AC-3

### T5: merge overlapping same-file clone locations at the report layer
- files: `src/report/duplication.ts`, `test/duplication-report.test.ts`
- action: In `renderDuplication`, before formatting each finding's `locations` into a display line, group that finding's own `locations` by `file` and merge any two same-file entries whose `[startLine, endLine]` ranges overlap or touch (`a.endLine + 1 >= b.startLine`, after sorting by `startLine`) into one `{file, startLine: min(...), endLine: max(...)}`, repeating the sweep until no more merges apply within the group. Render one line per merged location instead of one per raw location — the 8-overlapping-`util.ts:31-33`-entries audit case collapses to a single `util.ts:<merged-range>` line. `DuplicationFinding[]` itself (and everything derived from it in `--json`/`--sarif`) is untouched — only the array passed into the terminal line-formatting step changes.
- verify: `npm run typecheck`; `test/duplication-report.test.ts` covers: the audit's 8-overlapping-locations case merges to one line; two locations in different files are never merged; two non-overlapping, non-adjacent same-file ranges stay as two separate lines; the existing two-different-files case is unaffected
- done: AC-4

### T6: CLI wiring + end-to-end integration tests
- files: `src/cli.ts`, `test/cli-terminal-polish.test.ts` (new)
- action: Finish wiring T1-T5 into the `scan` and `verify-removal` command actions in `cli.ts` (root/color into the terminal render calls; `onProgress` stderr callbacks into `scan()`'s `ScanOptions` and `verifyRemovals()`'s options). Add integration tests, mirroring the `mkdtemp` + `execFile dist/cli.js` pattern already used in `test/cli-verify-removal.test.ts`: (a) a scan on a fixture prints a relative path (not the absolute temp-dir path) in terminal output (AC-1); (b) `--json` output on the same fixture still contains the absolute path, unchanged (Constraints); (c) piping a `verify-removal` run's stdout to a file/buffer while capturing stderr separately shows stderr non-empty and stdout still valid JSON when `--json` is passed (AC-3).
- verify: `npm run build && npm test`
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT change `--json` or `--sarif` output shape or values — verified explicitly in T1 and T6, not just assumed.
- DO NOT touch `src/syntactic/duplication.ts`'s clone-detection algorithm — only the report-layer rendering of its already-produced `DuplicationFinding[]`.
- DO NOT add a general logging/telemetry framework for progress — plain `process.stderr.write` lines only, no new dependency.
- DO NOT read `process.stdout`/`process.env` (TTY/NO_COLOR detection) or write to `process.stderr` from inside `src/report/*` render functions — those stay pure functions of their arguments; only `src/cli.ts` inspects the environment and decides what to pass in.
