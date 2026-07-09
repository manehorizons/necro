---
cadence_handoff: 1
generated_at: 2026-06-12T03:07:14.875Z
label: explain-narrate-shipped
loop_position: IDLE
active_phase: 27-explain-narrate
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 8b78cdf
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-12 (explain-narrate-shipped)

## TL;DR for the next session
- **Two phases shipped + settled this session: 26 `necro verify-removal` and 27 `explain --narrate`.** Both built TDD, all ACs PASS, **everything pushed** (HEAD `8b78cdf`, 0 ahead).
- Suite **379 passed** (was 357 at session start, +22), 6 skipped; `tsc --noEmit` clean.
- Loop **IDLE**, nothing in flight. **Recommendation queue is empty** (the sole candidate `rec-20260611-001` was consumed → phase 26 and archived).
- The `explain` surface is now three layers: deterministic trace (25) → LLM "why" via `--narrate` (27) → empirical "is it safe to delete" via `verify-removal` (26).
- **Next is a strategic pick** — no queued rec, no roadmap phases. The settle advisory pointed at `cadence milestone propose` (phases 19–27 form a coherent MCP/agent-citizen arc). Other live options: a verified auto-removal loop (scan→explain→verify-removal→fix), or docs+dogfood.
- **Nothing blocking.** `.cadence/` + `.claude/` intentionally uncommitted; no source WIP, nothing stashed.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `8b78cdf`
- Recent commits:
```
8b78cdf test(27): explain --narrate coverage — prompt, client, engine, CLI, MCP (AC-1..4)
3167f6b feat(27): explain --narrate — additive LLM narrative over the deterministic verdict (T1-T5)
4b0aa27 test(26): verify-removal coverage — planner, engine, CLI, MCP (AC-1..5)
02ba2f5 feat(26): necro verify-removal — per-symbol removal safety in isolated worktrees (T1-T4)
fd94740 test(25): explain coverage — tracePath, model, engine, CLI, MCP (AC-1/2/3/4)
1e056b7 feat(25): necro explain — reachability trace explainer (CLI + MCP) (T1-T5)
931fa85 test(24): synthesized monorepo corpus + AC-1/2/3 tests (T4)
7a1e00e feat(24): cross-package alias edges + member entry rooting (T2, T3)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 4 ++--
 .cadence/state.json | 6 +++---
 2 files changed, 5 insertions(+), 5 deletions(-)
```
- Loop: IDLE · phase 27-explain-narrate · tier (none)

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
- **Phase 26 `necro verify-removal`** (commits `02ba2f5` feat, `4b0aa27` test) — one verb / 1..N symbols (CLI `verify-removal` + MCP `necro_verify_removal`): plan each symbol's deletion, verify it independently in its own throwaway git worktree, badge green/red/unresolved. N=1 is "verify-a-removal".
- T1 `planRemovalOf` (ungated removal core in `src/fix/remove.ts`; `planRemovals` delegates). T2 `src/engine/verify-removal.ts` (resolve→plan→relativize→`verifyEdits`, fresh worktree per symbol; exported `resolveQuery` from explain). T3 CLI verb + renderer. T4 MCP tool + `ServerDeps` wiring.
- **Phase 27 `explain --narrate`** (commits `3167f6b` feat, `8b78cdf` test) — additive LLM "why" over the deterministic verdict (CLI `--narrate` + `narrate:true` on `necro_explain`).
- T1 `src/explain/prompt.ts` (pure builder). T2 `src/explain/client.ts` (`NarrateClient`/`createNarrateClient`, reuses `triage/client` scaffolding). T3 `explain({narrate?})` attaches `narrative`. T4 CLI flag + `Why:` renderer + degradation. T5 MCP `narrate` param + injectable `narrateClientFactory`.
- Resumed from the phase-25 IDLE handoff; scoped both phases via Q&A + brainstorming (adapted to the CADENCE draft, not a `docs/superpowers/specs` doc).

## Carry-forward gotchas
- **The `--narrate` LLM *success* path is NOT covered by automated tests** — by design (tests stay network-free). Coverage is: prompt builder (pure), client offline-guard, engine/MCP with an **injected fake** `NarrateClient`, and the CLI **no-key degradation** path. If you change the prompt or real client, manually smoke-test with a real `ANTHROPIC_API_KEY`.
- **`--narrate` is strictly additive and never fatal** — missing key or LLM error degrades to the static trace with `narrative: null` (engine catches & returns null; CLI/MCP catch `MissingApiKeyError`). Narrative is only produced for `resolved` symbols. Don't make it throw.
- **SDK isolation is enforced by a test** (`triage-client.test.ts` AC-5): `src/cli.ts` must contain no static `@anthropic-ai/sdk` import. The narrate path reuses the lazy dynamic-import factory (`lazyAnthropic` in `triage/client.ts`) — keep it that way or that test breaks.
- **`necro_explain` parity**: a test asserts the MCP tool returns the same JSON as `explain --json`. The `narrative` field only appears when `narrate` is on, so the default path stays byte-identical — preserve that if you touch the tool.
- **CLI/MCP narrate + verify-removal tests rebuild `dist/`** (`beforeAll: npm run build`) — they're slower; the engine/unit layers are where to iterate fast.
- **The phase-27 design lives in the CADENCE draft** (`.cadence/phases/27-explain-narrate/27-27-DRAFT.md`), not under `docs/superpowers/specs/` — brainstorming was routed into the CADENCE loop per project convention.
- **Empty rec queue + empty ROADMAP.md is expected** — phases live in `.cadence/phases/`, not the roadmap; the queue emptied when rec-20260611-001 was consumed. The old duplicate-rec-id wart is now moot (that rec is archived/terminal).
- **`.cadence/` + `.claude/` intentionally uncommitted** (repo convention). No source WIP; nothing stashed. **Pushing `main` needs explicit per-action authorization** (auto-classifier blocks direct default-branch pushes even after a generic yes).

## Next action
**Action:** No work in flight — loop IDLE, phases 26 + 27 shipped/settled/pushed, rec queue empty. Next is the user's strategic pick. The strongest candidates surfaced this session:
  1. **`cadence milestone propose`** — phases 19–27 (MCP server → CI/PR citizen → accuracy/FP reduction → explain → verify-removal → narrate) form a coherent "agent/MCP citizen" milestone; the settle advisory pointed here. Consolidate before more features.
  2. **Verified auto-removal loop** — new capability phase chaining scan → explain (dead) → verify-removal → fix, turning the read-only surface into a guarded write path (the agent loop the new tools enable).
  3. **Docs + dogfood** — README the `verify-removal` + `--narrate` tools and adopt `verify-removal` in necro's own CI.
Start with a brief scope discussion, then `cadence draft new <slug> <n>` (no rec to convert from).
**Verify:** `cadence status` → IDLE · phase 27-explain-narrate; `git log origin/main..HEAD` empty (all pushed); `npm test` → 379 passed; `npx tsc --noEmit` clean.
**If it fails:** nothing is pending to recover — the session ended clean. If `--narrate` ever returns prose that contradicts the verdict, the LLM is being handed the wrong input — check `buildNarratePrompt` and the snippet assembly in `explain.ts`'s `narrate()`; the static verdict is always source of truth.
