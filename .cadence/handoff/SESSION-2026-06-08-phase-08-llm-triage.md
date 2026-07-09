---
cadence_handoff: 1
generated_at: 2026-06-08T19:25:21.961Z
label: phase-08-llm-triage
loop_position: IDLE
active_phase: 08-llm-triage
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: aaeffe5
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-08 (phase-08-llm-triage)

## TL;DR for the next session
- Phase **08-llm-triage shipped & settled** (all 7 ACs PASS) and **pushed** — `main` is now 0 ahead / 0 behind origin. necro has its first AI tier: an opt-in `necro triage` command that LLM-resolves the quarantined `maybe` findings, **advisory only** (never mutates tier, never makes anything `fix`-eligible). `scan`/`fix` stay local/free.
- Loop is **IDLE**. **154 tests + 1 skipped** (the live-eval, skipped without a key); typecheck clean; build 59.4kb (SDK dynamic-import only).
- **Single next action (decision-ish):** the recommended next slice is **phase 09 = design step 13, LLM-assisted refactors** (god-function split is the best demo) — it builds directly on the phase-08 triage integration. Run it through the full loop with the same up-front rigor.
- **Open gap, not a blocker:** the **live accuracy gate has never run against the real API** (no `ANTHROPIC_API_KEY` this session). Validate phase 08 before building more on it — see Next action's Verify.
- No active blockers. Deferred: response caching by code-hash (only the `maxFindings` spend cap landed); expand the 6-case synthetic eval set toward real-repo `maybe` output.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `aaeffe5`
- Recent commits:
```
aaeffe5 chore(08-llm-triage): settle phase
ff31184 feat(08-llm-triage): reference dataset + eval harness with gate (T7)
eae79eb feat(08-llm-triage): `necro triage` command + reporting (T6)
2cf5f51 feat(08-llm-triage): orchestration — advisory, maybe-only (T5)
ae71425 feat(08-llm-triage): mockable client + key/offline guard (T4)
f1ed68b feat(08-llm-triage): prompt contract + verdict schema (T3)
4e4f3f1 feat(08-llm-triage): re-read source snippet around findings (T2)
870a877 feat(08-llm-triage): add llm config block (T1)
```
- Loop: IDLE · phase 08-llm-triage · tier (none)

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
- New opt-in `necro triage [path]` command (commander): `--input <file>` triages a prior `scan --json`; `--json` emits results. Worst-first report (likely-dead → unsure → likely-alive).
- `src/triage/` module: `snippet.ts` (re-reads source, captures the enclosing brace block), `prompt.ts` (frozen system prompt + `VERDICT_SCHEMA` + `parseVerdict`), `client.ts` (injectable `TriageClient`, key resolution, offline guard), `index.ts` (`runTriage` — maybe-only, `maxFindings` cap, advisory), `load.ts` (reconstruct findings from scan JSON), `eval.ts` (precision/recall harness + `meetsThreshold` gate).
- `src/report/triage.ts` (render + `toTriageJson`); `scan`/`fix` JSON left byte-for-byte unchanged.
- Config: optional `llm` block on `NecroConfig` (`model` default `claude-opus-4-8`, `snippetRadius` 20, `maxFindings`, `apiKey`).
- `@anthropic-ai/sdk` added (v0.102.0), loaded via `import type` + a single dynamic `import()` — `scan`/`fix` never pull it in.
- Reference dataset `test/fixtures/triage/cases.json` (6 hand-labeled cases) + unit eval (deterministic oracle mock) + `test/triage-eval.live.test.ts` (runIf-guarded live gate).
- Full CADENCE loop: SPEC (7 ACs) → DRAFT (7 tasks) → build (TDD, atomic commits) → settle. SPEC+DRAFT approved.

## Carry-forward gotchas
- **`git_dirty: true` is only the untracked `.cadence/handoff/` + `.cadence/intelligence/` archives** — no WIP code, no stash. Working tree is otherwise clean.
- **The advisory boundary is load-bearing (the safety call for the whole AI tier):** triage must NEVER mutate `tier`/`autoFixEligible` or create a path by which LLM judgment deletes code. If step 13 (LLM refactors) adds an apply path, gate it the same way `necro fix` is gated (certain-dead only, dirty-tree guard, diff preview, y/n) — do not let a triage verdict alone authorize an edit.
- **SDK isolation is asserted by tests** (`test/triage-client.test.ts`): `src/cli.ts`/`engine`/`fix` contain no static `@anthropic-ai/sdk` import; the client uses `import type` + dynamic `import()`. Keep step-13 LLM code on the same lazy path, or those tests (AC-5) break.
- **Two distinct uses of `--json`** were split: `--json` = emit output; `--input <file>` = triage a prior scan. Don't reintroduce `--json <file>` for input.
- **CADENCE settle gate:** every AC id must appear literally in a test title — tag tests `(AC-N)` up front. (See the saved memory.)
- **Two Node versions:** CLI targets Node ≥ 20; the docs site under `website/` needs Node ≥ 22 (`nvm use 22` before any `website/` npm command). Docs link-validator is a hard build gate.
- **Headless CADENCE gates:** `draft approve … --no-approve`; `settle run --auto`. `spec approve <phase> <num>` has **no** `--no-approve`. `cadence progress` suggests a generic next *number* (it said "9-…"); draft within the intended phase slug, not literally what it prints.
- **`necro.config.json` loads from CWD, not the scan target** — a config-dependent smoke test must run with cwd = the project being scanned.
- **Live eval cost/validity:** the live gate calls the real API (opus-4-8) over the 6 fixtures at concurrency 3 — cheap, but the 6-case synthetic set is a smoke test, not a real accuracy measurement. Expand it before trusting the precision/recall numbers.

## Next action
**Action:** Start **phase 09 — design step 13: LLM-assisted refactors** (per `docs/necro-design-spec.md` §8 build order, and §lines ~321-341 fix-safety tiers). Best first refactor type = **god-function split** (the strongest demo; complexity hotspots already surface candidates). It builds on phase-08 triage: reuse `src/triage/client.ts` (the injectable `TriageClient`, lazy SDK import) and `snippet.ts`. The LLM proposes a diff; surface it through preview → y/n → git-guarded apply, exactly like `necro fix`. Run the full loop: `cadence spec new 09-llm-refactor 09 --title=…` → fill SPEC (resolve model/prompt/eval/apply-safety decisions via AskUserQuestion) → `spec approve` → `draft new` → `draft approve --no-approve` → build (TDD, tag tests `(AC-N)`, mocked client in CI) → `settle run --auto`.

**Verify:** **Before building on triage, validate phase 08 against the live model** — `ANTHROPIC_API_KEY=sk-… npx vitest run test/triage-eval.live.test.ts` should pass the 0.8 precision/recall gate; ideally expand `test/fixtures/triage/cases.json` first. Then for phase 09: `cadence status` shows the loop advancing; `npx vitest run` green + `npm run typecheck` clean before each commit; the SDK-isolation tests (AC-5) still pass.

**If it fails:** if the live gate underperforms, tune `SYSTEM_PROMPT` in `src/triage/prompt.ts` and/or raise effort — re-run the eval, don't lower the threshold to pass. For the refactor work, read the `claude-api` skill (model ids, structured outputs, tool use) before writing API code. If a `website/` command errors on Node version, `nvm use 22`. Headless CADENCE gates need the flags in Carry-forward gotchas.
