---
phase: 07-duplication
id: 07-07
tier: standard
status: PENDING
---

# 07-07 — Duplication detector

## Objective

Detect copy-paste clones — including renamed copies — by tokenizing each file

## Acceptance Criteria

### AC-1: Normalized token stream
Given a TypeScript source file
When it is tokenized
Then it yields a stream of normalized tokens where identifiers collapse to `ID` and literals to `LIT` (Type-2), keywords/operators/punctuation keep their kind, and comments are dropped — and only the tokenizer names tree-sitter/TS constructs (core invariant §3).

### AC-2: Cross-file clone detection
Given two files that share a normalized token sequence of at least `minTokens`
When duplication runs
Then a clone group is reported listing each location (`file:startLine-endLine`) and the matched token length; a sequence that appears only once is not reported.

### AC-3: Type-2 (renamed) clones
Given two blocks that are identical except for renamed identifiers and changed literal values
When duplication runs
Then they are detected as a clone (normalization erases the names), while structurally different code of the same length is not.

### AC-4: Threshold and within-file clones
Given the `minTokens` threshold (default 50, configurable)
When duplication runs
Then sequences shorter than `minTokens` are never reported, and a block duplicated **within a single file** is detected as a clone (two locations in the same file).

### AC-5: Maximal, de-duplicated clones
Given a clone longer than `minTokens`
When it is reported
Then it appears once as a single maximal region per location — not as a swarm of overlapping sub-window matches.

### AC-6: Surfacing in scan
Given a project containing duplicated code
When `necro scan` runs
Then it prints a `Duplication` section (one entry per clone group, worst-first by token length) and `--json` includes a `duplication` array; a project with no clones shows no section; `necro fix` is unaffected.

## Tasks

### T1: normalized tokenizer
- files: `src/syntactic/tokens.ts`
- action: `tokenize(file, source): Promise<Token[]>` (`Token = { norm: string; line: number }`) using the phase-05 `getParser`. Walk the tree's leaf nodes in source order; drop `comment` nodes; map each leaf to a normalized string — identifier kinds → `"ID"`, literal kinds (number/string fragments/regex/template chars) → `"LIT"`, everything else → the leaf's `type` (keyword/operator/punctuation kind). This is the only file that names tree-sitter/TS token kinds.
- verify: unit test — a snippet tokenizes so two functions differing only in identifier/literal names produce identical token streams; comments produce no tokens; keywords/punctuation are preserved.
- done: AC-1

### T2: clone-finding algorithm
- files: `src/syntactic/duplication.ts`, `src/syntactic/types.ts`
- action: `DuplicationFinding = { tokens: number; locations: { file; startLine; endLine }[] }`. `findClones(files: { file; tokens: Token[] }[], minTokens): DuplicationFinding[]`: rolling-hash each `minTokens` window (per file, no cross-file windows); index `hash → positions`; iterate positions in order, skipping covered ones; at a fresh window with ≥2 token-equal occurrences, greedily extend to the maximal common length, emit one finding with all member locations, and mark every covered window so the clone is reported once (AC-5). Sort findings by token length desc. Pure: operates on `Token[]` only.
- verify: unit tests — identical block in two files → one finding, two locations; renamed-only copy still matches (Type-2); a < minTokens match → nothing; within-file duplicate → one finding with two same-file locations; a long clone → a single maximal finding, not many.
- done: AC-2, AC-3, AC-4, AC-5

### T3: duplication config
- files: `src/config.ts`
- action: Add a `duplication: { minTokens: number }` block to `NecroConfig` (default `{ minTokens: 50 }`), merged per-key like the others.
- verify: unit test — default present with no config; a partial `duplication` block overrides `minTokens`.
- done: AC-4

### T4: engine integration
- files: `src/engine/index.ts`
- action: In the heavy (`analyzeHeavy`) axis, tokenize the already-read sources (lazy import `tokenize`) and run `findClones(..., config.duplication.minTokens)`. Extend `ScanResult` with `duplication: DuplicationFinding[]`; gate with the existing `complexity` scan option so `fix` skips it.
- verify: integration test — a project with a duplicated block surfaces a duplication finding with both locations; a clone-free project yields `[]`; `{ complexity: false }` → `duplication: []`.
- done: AC-6

### T5: surfacing
- files: `src/report/duplication.ts`, `src/report/json.ts`, `src/cli.ts`
- action: `renderDuplication(findings): string` — a labeled `Duplication` section, one line per clone group (`N tokens duplicated: fileA:1-9, fileB:20-28`), worst-first; "" when empty. `scan` prints it after the hotspots section. `toJson` gains `duplication`. Update the existing `toJson` call sites.
- verify: report unit test (section lists token count + locations) + CLI/integration test (`--json` includes a `duplication` array; clone-free → no section).
- done: AC-6

### T6: docs
- files: `website/src/content/docs/guide/duplication.md` (new), `website/src/content/docs/reference/cli.md`, `website/src/content/docs/reference/configuration.md`, `website/src/content/docs/guide/ci-integration.md`, `website/src/content/docs/guide/roadmap.md`
- action: New guide page (what a Type-2 clone is, the `minTokens` knob, no-jscpd approach). Update scan output + `--json` shape (now also `duplication`), the `duplication` config key, the CI JSON example, and move "Duplication" from Planned → Available in the roadmap. Run `nvm use 22` before any `website/` build.
- verify: `nvm use 22 && npm --prefix website run build` passes the link-validator gate.
- done: AC-6

## Boundaries

- **Reuse the phase-05 tree-sitter parser — no jscpd, no new parser dependency.**
- **tree-sitter/TS token kinds live only in the tokenizer** (`tokens.ts`); the clone algorithm reads the normalized `Token[]` alone (core invariant §3).
- **DO NOT change dead-code detection, `classify`, tiers, or `necro fix`** — duplication is additive; `fix` passes `{ complexity: false }` and must skip it.
- **DO NOT implement** cross-language clones, Type-3 (gapped) clones, or refactor suggestions.
- **Lazy/gated** — duplication rides the existing heavy axis; the dead-code/`fix` path must not pay for it.
- No LLM (locked #3); report-only.
- **DO NOT add deps to `website/`'s package.json** (separate package, Node ≥ 22).
