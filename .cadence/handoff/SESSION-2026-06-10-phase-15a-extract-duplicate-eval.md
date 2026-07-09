---
cadence_handoff: 1
generated_at: 2026-06-10T15:17:30.393Z
label: phase-15a-extract-duplicate-eval
loop_position: IDLE
active_phase: 14-refactor-realrepo-eval
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: e23c3f9
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-10 (phase-15a-extract-duplicate-eval)

## TL;DR for the next session
- **Phase 14 (refactor real-repo eval, god-function mode) is BUILT, SETTLED, and PUSHED.** Loop is **IDLE**, tree clean, `main` in sync with origin at `e23c3f9`. AC-1..AC-4 all PASS.
- **Phase 15a is the single next job: a real-repo accuracy eval for the OTHER refactor mode — extract-duplicate.** Phase 14 deliberately deferred it. It mirrors phase 14 exactly, but for clone groups instead of god functions. No phase is drafted yet — confirm scope, then `cadence draft new`.
- **The whole pattern already exists to copy.** Phase 14 added: a capture pipeline (`src/refactor/eval-capture.ts`), a real-repo corpus (`test/fixtures/refactor-realrepo/`), a deterministic integrity guard (`test/refactor-realrepo-corpus.test.ts`), and a calibrated live block in `test/refactor-eval.live.test.ts`. 15a reproduces each for the duplicate path.
- **The duplicate eval machinery is already there too** — `DuplicateEvalCase`, `runDuplicateEval`, `evaluateDuplicateProposal`, `loadDuplicateEvalCases` in `src/refactor/eval.ts`; synthetic fixtures in `test/fixtures/refactor-duplicate/cases.json`; a live block already in `refactor-eval.live.test.ts`. 15a feeds it real, captured cases.
- **External checkouts are still on disk** at `/tmp/necro-corpus/` (hono @ `e50df01`, trpc @ `c7360d4`) with scan JSONs that already include the `duplication` findings — no re-clone needed.
- **No blockers, no WIP.** The other live candidate (phase 15b — tune the refactor prompt to lift the real-repo pass-rate off 0.5–0.69) is real but separate; this handoff targets 15a per the `/handoff` argument.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 0 ahead / 0 behind origin
- HEAD `e23c3f9`
- Recent commits:
```
e23c3f9 chore(14-refactor-realrepo-eval): settle phase
53182d9 test(14-refactor-realrepo-eval): assert real-repo eval uses the unchanged production prompt (AC-4)
ec555c7 test(14-refactor-realrepo-eval): calibrated live real-repo gate, floor 0.5 (AC-3)
28d893b test(14-refactor-realrepo-eval): deterministic corpus-integrity guard (AC-2)
0b31f7e feat(14-refactor-realrepo-eval): real-repo god-function corpus — 14 cases / 2 repos (AC-1)
016e36c feat(14-refactor-realrepo-eval): capture pipeline for real-repo god-function cases (AC-1)
ed7e9e2 chore: gitignore local CADENCE handoff + intelligence artifacts
ef65cf1 chore(13-expand-triage-corpus): settle phase
```
- Loop: IDLE · phase 14-refactor-realrepo-eval · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - (none)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - (none)

## What landed this session
- Resumed from the phase-12 SESSION doc (fully consumed — phase 13 had already shipped); gitignored the local `.cadence/handoff/` + `.cadence/intelligence/` artifacts (`ed7e9e2`).
- Scoped, drafted, approved, built, and settled **phase 14 — `14-refactor-realrepo-eval`** (god-function real-repo eval), 6 commits, pushed to origin.
- T1 (`016e36c`): `src/refactor/eval-capture.ts` (`captureRefactorSkeletons`) + optional `provenance` on `RefactorEvalCase`. Handles necro scan's **absolute** paths.
- T2 (`0b31f7e`): `test/fixtures/refactor-realrepo/cases.json` — 14 verbatim god functions (3 hono + 11 trpc, 54–169 loc) + `SOURCES.md`.
- T3 (`28d893b`): `test/refactor-realrepo-corpus.test.ts` — deterministic, network-free integrity + scoring-math guard.
- T4 (`ec555c7`): calibrated live real-repo gate. 3 runs → 0.86 / 0.64 / 0.57; `REALREPO_PASS_RATE_GATE = 0.5` (floor under the min). `httpBatchLink` fails every run; streaming/batching functions fail intermittently — a real weakness the synthetic eval (≈1.0) hid.
- T5 (`53182d9`): regression sweep + AC-4 test (real-repo eval drives the unchanged production `SYSTEM_PROMPT`). Full suite 260 passed / 5 live-skipped.

## Carry-forward gotchas
- **`cadence settle` over MCP takes `auto: true` (a boolean) — NOT a string `"--auto"`.** Passing the string is silently ignored: it settles WITHOUT deriving AC verdicts, leaving `acResults: []` and an empty AC section. I hit this on phase 14 and had to hand-populate `14-14-SUMMARY.{json,md}` after the fact (can't re-settle once IDLE). Pass `{auto:true}`.
- **The settle AC↔test gate still applies:** every `AC-N` must appear in a test title or the verdict can't derive. For 15a, tag the dup integrity-guard + live tests with their AC ids (same as phase 14 did).
- **necro `scan --json` emits ABSOLUTE file paths.** `captureRefactorSkeletons` already normalizes them (read absolute, store repo-relative provenance); the **duplicate** capture must do the same. The scan doc shape is `{ findings, complexity, hotspots, duplication }` — clone groups live under `duplication` (`DuplicationFinding[]`, each `{ tokens, locations: [{file,startLine,endLine}] }`).
- **`DuplicateEvalCase` is heavier than the god-function case** (`src/refactor/eval.ts` / see `test/refactor-eval.test.ts`): it carries **full file sources** (`files: [{path, source}]`), the clone `locations[]`, `tokens`, `minTokens`, and `signatures[]` (the line at each location that must survive). Provenance will need adding to it (optional, like `RefactorEvalCase` got). Prefer **same-file or small cross-file** clone groups so case `files[]` stay manageable; skip giant/multi-file groups.
- **Duplicate scoring is structural & self-judging** (`evaluateDuplicateProposal`): extracts a shared fn / collapses every clone site / preserves each call surface. So, like 14, **no human output-label is needed** — selection is the only manual step; capture the rest verbatim.
- **Live evals are billable + non-deterministic.** Key is in `.env` (gitignored; runner does NOT auto-load): `set -a; . ./.env; set +a; npx vitest run test/refactor-eval.live.test.ts -t "extract-duplicate"`. Run ≥3×, set the floor under the observed minimum, document the runs in the dup `SOURCES.md`. Confirm with the user before spending.
- **No tsx in the repo.** Run one-off capture/select scripts by bundling with esbuild (`npx esbuild x.ts --bundle --platform=node --format=esm --packages=external --outfile=./x.tmp.mjs && node ./x.tmp.mjs`) — output INSIDE the project so `--packages=external` resolves `node_modules`. Delete the temp scripts after; don't commit them.
- **Invariants in force:** lazy `import()` SDK isolation; refactor `SYSTEM_PROMPT`/`DUP_SYSTEM_PROMPT` byte-for-byte unchanged (15a measures, it does not tune — phase 15b owns tuning); synthetic dup live eval ≥0.8 must not regress; live tests must `test.runIf(ANTHROPIC_API_KEY)` (never a CI network call).

## Next action
**Action:** Scope and draft **phase 15a — extract-duplicate real-repo eval**. Confirm scope with the user (the deferred 14 candidate: real-repo accuracy gate for the duplicate refactor mode, mirroring phase 14), then `cadence draft new 15-extract-duplicate-realrepo-eval 15 --title="Real-repo accuracy eval for extract-duplicate"` (tier standard). Plan ~5 tasks mirroring phase 14: (T1) duplicate capture pipeline in `src/refactor/eval-capture.ts` turning `scan --json` `duplication` clone groups into `DuplicateEvalCase`s with verbatim file sources + provenance (+ optional `provenance` on `DuplicateEvalCase`); (T2) capture/select a real corpus (≥12 clone groups, ≥2 repos — reuse `/tmp/necro-corpus` hono+trpc scans, already have `duplication` findings) + `test/fixtures/refactor-dup-realrepo/SOURCES.md`; (T3) deterministic integrity guard `test/refactor-dup-realrepo-corpus.test.ts`; (T4) calibrated live block (≥3 runs, floor under min); (T5) regression sweep + AC tagging. Then edit the DRAFT's Objective/AC/Tasks/Boundaries and `cadence draft check`.
**Verify:** `cadence status` shows IDLE before drafting; after `cadence draft new …`, `cadence draft check 15-extract-duplicate-realrepo-eval 15` returns `{ok:true}`.
**If it fails:** if duplicate clone groups from hono/trpc are too sparse or too large/multi-file to make clean cases (check `duplication.length` in `/tmp/necro-corpus/{hono,trpc}-scan.json` first), pick a third repo or relax to same-file clones; if scope is unclear, present 15a (this) vs 15b (refactor-prompt tuning) and let the user choose — do not draft unilaterally.
