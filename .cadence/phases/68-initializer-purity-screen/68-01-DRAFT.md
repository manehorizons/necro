---
phase: 68-initializer-purity-screen
id: 68-01
tier: standard
status: PENDING
---

# 68-01 — Import-resolved I/O denylist for initializer side-effect screen

## Objective

Replace the naive syntax-kind initializer screen (Call/New/Await/TaggedTemplate ⇒ risky, measured at 19% precision in phase 67) with `initializerEffectFor()`: an import-resolved denylist of known Node I/O builtins (`node:fs`, `node:child_process`), wired into `deadTier()` as a new optional resolver mirroring the existing `coverage` pattern — then re-measure against the phase-67 corpus to confirm it's actually sharper before shipping.

## Acceptance Criteria

### AC-1: Zero false positives, full recall on the phase-67 corpus
Given the phase-67 hand-labeled corpus (`test/fixtures/side-effect-initializer-corpus/cases.json`, 19 cases)
When the new import-resolved denylist screen is scored against it
Then it flags all 3 genuinely-risky cases (recall 3/3) with 0 false positives (precision 1.0, vs. the naive screen's 19%) — this is a narrow, precision-first denylist, so low recall on side-effect shapes outside `fs`/`child_process` is expected and acceptable, not a defect

### AC-2: Detects I/O nested one level inside an IIFE-style wrapper
Given a symbol whose initializer is `run(() => { ... fs.readFileSync(...) ... })` (the `cert` corpus case — the risky call is inside a function-expression argument, not the top-level call)
When `initializerEffectFor()` inspects the initializer
Then it is classified `effectful`, not `unknown`/`pure` — walk one level into an IIFE-shaped wrapper's function body only; do not recurse further (deeper nesting wasn't observed in the corpus and re-opens the phase-65 blast-radius failure mode)

### AC-3: `NewExpression` is never effectful
Given a symbol whose initializer is a `new X()` of any kind (e.g. `new Map()`, `new PrismaClient()`, `new KoaRouter()`)
When `initializerEffectFor()` inspects the initializer
Then it always returns `pure` for the constructor call itself — `NewExpression` is excluded from the effectful check entirely (not merely "checked and fails to resolve"), matching the corpus's 4/4 true-negative rate on constructors

### AC-4: Import-resolved, not name-substring; unresolved fails open
Given a symbol whose initializer calls an identifier that textually matches a denylisted name (e.g. a user-defined local function also named `readFileSync`) but whose binding does NOT resolve via ts-morph symbol resolution to an import from `node:fs`/`fs`/`node:fs/promises`/`fs/promises`/`node:child_process`/`child_process`
When `initializerEffectFor()` inspects the initializer
Then it is NOT flagged as effectful — any unresolved, dynamic, or re-exported binding returns `unknown` and is treated as `pure` (fail-open: this screen only stops confident demotion of call-shaped code, it doesn't try to catch every possible side effect)

## Tasks

### T1: Implement `initializerEffectFor()` resolver
- files: new `src/analyze/initializer-effect.ts`
- action: `initializerEffectFor(node: SymbolNode): 'pure' | 'effectful' | 'unknown'`. Lazily re-parse the file with a throwaway ts-morph `Project` the same way `src/fix/remove.ts:49-55` does (cache per file within one scan), locate the declaration via `collectDeclarations` by name+line, inspect `.getInitializer()`. Bounded, hardcoded denylist of actually-I/O-performing exports (readFileSync, writeFileSync, execSync, execFileSync, spawnSync, unlinkSync, etc. — deliberately narrow; e.g. exclude `existsSync`, start conservative). For each `CallExpression` found (top-level, or one level inside an IIFE-shaped wrapper's function body), resolve the callee via `getSymbol()`/`getAliasedSymbol()` to its declaring source file and check against the denylist modules. `NewExpression` is never inspected — always `pure`. Unresolved/dynamic → `unknown` (fail-open to `pure` at the call site).
- verify: unit tests with synthetic fixtures covering bare fs call, member fs call, IIFE-wrapped fs call, `new X()` (must stay pure), factory call not in the denylist (must stay pure), and a same-name/different-binding local helper (must not false-positive) — plus all 19 phase-67 corpus cases as fixtures
- done: AC-2, AC-3, AC-4

### T2: Thread resolver into `deadTier()`
- files: `src/analyze/classify.ts`, `src/engine/index.ts`
- action: add optional `initializerEffect?: (node: SymbolNode) => 'pure' | 'effectful' | 'unknown'` param to `classify()`, mirroring how `coverage` is threaded at `src/engine/index.ts:66-70`; demote `certain` → `likely` when `effectful` (mirrors the existing `cov.kind === "hit"` demotion in `deadTier()`), with evidence text `"initializer calls a known I/O API (<name>) — may have side effects"`
- verify: existing classify unit tests unaffected; new tests for the demotion path
- done: AC-3

### T3: Re-score against the phase-67 corpus and record evidence
- files: `test/fixtures/side-effect-initializer-corpus/` (reused, not regenerated)
- action: run the new screen over all 19 cases, compute TP/FP/TN/FN, compare against the naive screen's TP=3 FP=13 TN=3 FN=0 baseline; record the result as new evidence on `rec-20260719-008`
- verify: assertion test asserts TP=3, FP=0
- done: AC-1

### T4: Full verification
- files: n/a
- action: run full suite, typecheck, lint
- verify: `npm test`, `npm run typecheck`, `npm run lint` all green
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT change `remove.ts`'s mechanical removal behavior — this phase only affects `classify.ts`'s tier decision, not how removal is executed.
- DO NOT build a general dynamic-dispatch/taint resolver — that's rec-20260719-004 / phase 65 scope (already parked; two blunt heuristics failed there). This phase is scoped to a hardcoded, bounded I/O builtin denylist only.
- DO NOT expand the denylist beyond `node:fs`/`node:child_process` (e.g. network, `process.exit`, crypto-to-disk) without new corpus evidence — resist scope creep.
- DO NOT regenerate or re-source `test/fixtures/side-effect-initializer-corpus/` — reuse the existing 19 hand-labeled cases from phase 67 as-is.
- DO NOT recurse more than one level into nested function bodies when walking the initializer — matches the corpus evidence and avoids re-deriving phase 65's blast-radius failure.
