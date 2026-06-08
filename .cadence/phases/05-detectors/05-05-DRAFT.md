---
phase: 05-detectors
id: 05-05
tier: standard
status: PENDING
---

# 05-05 — Syntactic detectors (tree-sitter)

## Objective

Add a second analysis axis to necro: parse functions into a language-agnostic

## Acceptance Criteria

### AC-1: Language-agnostic syntactic IR via tree-sitter
Given a TypeScript source file with functions
When it is parsed
Then each function is lowered to an IR unit — `{ name, file, line, loc, params, controlNodes: { kind, depth }[] }` — produced by tree-sitter (decision #6), and the lowering (tree-sitter node kinds → IR) is the **only** code that names TS/tree-sitter constructs; the detectors that follow read the IR alone.

### AC-2: Nesting-depth detector
Given a function whose maximum block-nesting depth exceeds the threshold (default 3)
When detectors run
Then a `nesting` finding reports the function, its measured depth, and the threshold; a function at depth ≤ 3 is not flagged.

### AC-3: Cyclomatic-complexity detector
Given a function whose cyclomatic complexity (1 + branch/loop/boolean-operator count) exceeds the threshold (default 10)
When detectors run
Then a `cyclomatic` finding reports the measured value and threshold; a function at ≤ 10 is not flagged.

### AC-4: Cognitive-complexity detector (nesting-weighted)
Given two functions with the same number of branches — one flat, one deeply nested
When the cognitive detector scores them (Sonar model: increment per control structure, extra penalty per nesting level)
Then the nested function scores strictly higher than the flat one, and a function above the threshold (default 15) is flagged `cognitive` — distinguishing human-pain from raw branch count.

### AC-5: God-function detector
Given a function exceeding the LOC threshold (default 50) or the parameter-count threshold (default 5)
When detectors run
Then a `god-function` finding reports which limit was exceeded and the measured value; responsibility-cluster (distinct-callee) analysis is explicitly out of scope for this slice.

### AC-6: Multi-axis scan output
Given a project containing both dead code and over-complex functions
When `necro scan` runs
Then it prints the existing dead-code findings, then a distinct, labeled `complexity` section sorted worst-first by severity; `--json` emits a `complexity` array alongside `findings`; a simple, in-threshold function appears in neither section; and `necro fix` is unaffected (it still operates only on dead-code findings).

## Risks

- **tree-sitter binding** — RETIRED via a spike: `web-tree-sitter@0.25` + `tree-sitter-wasms` parses TS in Node 20 (ESM), exposing function name, start line, params, and branch nodes. Grammar wasm lives at `node_modules/tree-sitter-wasms/out/tree-sitter-typescript.wasm`; resolved at runtime via `createRequire(import.meta.url).resolve("tree-sitter-wasms/package.json")` + join. Deps stay external (esbuild `--packages=external`) — the wasm is never bundled. Native `node-tree-sitter` remains the fallback if a packaging issue surfaces.

## Tasks

### T1: tree-sitter parse + syntactic IR lowering
- files: `src/syntactic/ir.ts`, `src/syntactic/parse.ts`
- action: `parse.ts` lazily initializes `web-tree-sitter`, loads the TS grammar (runtime-resolved wasm path), and caches the parser. `ir.ts` defines the IR (`FunctionUnit = { name, file, line, loc, params, controlNodes: { kind, depth }[] }`) and `lower(file, source) → FunctionUnit[]`: walk function-like nodes (`function_declaration`, `method_definition`, arrow/function expressions), and for each, walk its body tracking nesting depth, recording every control node (`if`/`else-if`/`for`/`for_in`/`while`/`do`/`switch`-case/`catch`/ternary/`&&`/`||`/`??`) as `{ kind, depth }`. **This is the only file that names tree-sitter/TS node types.**
- verify: unit test — lowering a fixture yields a unit with correct name, loc, param count, and a controlNodes list whose depths match the nesting in the source.
- done: AC-1

### T2: detectors on the IR
- files: `src/syntactic/types.ts`, `src/syntactic/detectors.ts`
- action: `types.ts` — `ComplexityFinding = { detector: "nesting"|"cyclomatic"|"cognitive"|"god-function"; file; line; name; value; threshold; message }`. `detectors.ts` — pure functions reading only a `FunctionUnit` + `Thresholds`: `nesting` (max controlNode depth > t), `cyclomatic` (1 + count of branching controlNodes > t), `cognitive` (Sonar: sum of `1 + depth` per increment structure > t), `godFunction` (loc > t.loc OR params > t.params). Each returns a `ComplexityFinding | null`. No tree-sitter/TS imports.
- verify: unit tests — depth-4 fn flagged nesting / depth-3 not; >10 branches flagged cyclomatic; two fns with equal branches but different nesting → cognitive(nested) > cognitive(flat); a 60-line or 6-param fn flagged god-function; a simple fn yields nothing.
- done: AC-2, AC-3, AC-4, AC-5

### T3: complexity thresholds in config
- files: `src/config.ts`
- action: Add an optional `complexity` block to `NecroConfig` (`{ nesting?, cyclomatic?, cognitive?, godFunctionLoc?, godFunctionParams? }`) with the §4 defaults (3 / 10 / 15 / 50 / 5). Merge user overrides over defaults; unset → defaults.
- verify: unit test — defaults present with no config; a partial user `complexity` block overrides only the keys it sets.
- done: AC-2, AC-3, AC-4, AC-5

### T4: engine integration (multi-axis ScanResult)
- files: `src/engine/index.ts`
- action: Extend `ScanResult` to `{ findings, complexity: ComplexityFinding[] }`. After dead-code analysis, lower the discovered source files to IR (lazy import of `parse`/`lower` — heavy, only when scanning), run all four detectors with the resolved thresholds, collect findings, and sort worst-first by a severity rank (god-function/high-ratio first; stable by file/line). `necro fix` reads only `findings` and is untouched.
- verify: integration test — a project with a complex function and dead code returns both arrays; a clean function appears in neither; `fix` still works.
- done: AC-1, AC-6

### T5: scan output (terminal section + JSON)
- files: `src/report/complexity.ts`, `src/report/json.ts`, `src/cli.ts`
- action: `complexity.ts` renders a labeled "Complexity" section (one line per finding: `name  file:line  detector value>threshold`). `scan` prints dead-code findings, then the complexity section when non-empty. `--json` emits `{ findings, complexity }` (extend `toJson` or wrap). `--top N` continues to apply to dead-code findings; document that complexity is shown in full (or note the limit).
- verify: integration/CLI test — terminal output shows the complexity section; `--json` includes a `complexity` array with the detector/value/threshold; no complex code → no section.
- done: AC-6

### T6: docs + roadmap
- files: `website/src/content/docs/reference/cli.md`, `website/src/content/docs/guide/` (new complexity page), `website/src/content/docs/guide/roadmap.md`
- action: Document the complexity axis — the four detectors, default thresholds, the `complexity` config block, and the `--json` shape. Move "syntactic detectors" from Planned → Available today in the roadmap; keep duplication/CRAP/churn Planned. Run `nvm use 22` before any `website/` build.
- verify: `nvm use 22 && npm --prefix website run build` passes the link-validator gate.
- done: AC-6

## Boundaries

- **Detectors read the IR only** — tree-sitter/TS node types appear nowhere outside `src/syntactic/parse.ts` + `ir.ts` (lowering). A detector that special-cases a language is a leak (core invariant §3).
- **DO NOT change dead-code detection, `classify`, tiers, or `necro fix`** — complexity is purely additive; `ScanResult.complexity` is new and `fix` ignores it.
- **DO NOT implement** duplication (step 9), CRAP/churn (step 10), or god-function responsibility-clustering — out of scope.
- **DO NOT bundle the grammar wasm via esbuild** — keep tree-sitter deps external and resolve the wasm path at runtime from `node_modules`.
- **Lazy-load tree-sitter** — the dead-code/`fix` paths must not pay parser-init cost.
- No LLM (locked #3).
- **DO NOT add detector deps to `website/`'s package.json** (separate package, Node ≥ 22).
