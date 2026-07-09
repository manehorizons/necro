---
cadence_handoff: 1
generated_at: 2026-06-08T17:50:02.937Z
label: phases-03-07
loop_position: IDLE
active_phase: 07-duplication
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: df57d3d
git_ahead: 7
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-08 (phases-03-07)

## TL;DR for the next session
- necro now does the full **deterministic** story in one `necro scan`: dead code · complexity · risk hotspots · duplication — all local/free — plus `necro fix` for safe certain-dead removal. Loop is **IDLE**.
- This session shipped **5 phases** (03-coverage, 04-fix-safe, 05-detectors, 06-hotspots, 07-duplication) + an MIT LICENSE, each via the full CADENCE loop (spec→draft→build→settle), all ACs PASS. **124 tests** green, typecheck clean, docs link-validator clean.
- `main` is **7 commits ahead of origin, unpushed** — pushing is the user's call (repo is private on `manehorizons/necro`).
- **Single next action (decision pending):** start the **LLM tier** — phase 08, triage on the `maybe` false-positive sink (design step 12), then LLM refactors (step 13). The user paused here to decide; I recommended treating AI integration with extra up-front rigor (model/prompt/eval decisions), not the quick 2-question cadence used for deterministic slices.
- No active blockers. Deferred (not active): GitHub Pages deploy still blocked (private repo needs a paid plan) — deploy workflow stays manual.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 7 ahead / 0 behind origin
- HEAD `df57d3d`
- Recent commits:
```
df57d3d feat(07-duplication): Type-2 copy-paste clone detection (no jscpd)
a53feca feat(06-hotspots): CRAP score + churn risk hotspots
713088b feat(05-detectors): add syntactic complexity detectors via tree-sitter
5236bcd feat(04-fix-safe): add `necro fix` for safe certain-dead removal
3e21965 chore(03-coverage): settle phase
6259b3e feat(03-coverage): ingest lcov coverage as a false-positive resolver
91f4e4c chore: add MIT license
05d3ba1 docs: add detailed README
```
- Loop: IDLE · phase 07-duplication · tier (none)

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
- `91f4e4c` — MIT LICENSE + `"license": "MIT"` in package.json.
- `03-coverage` (`6259b3e`, `3e21965`) — lcov ingestion as a false-positive resolver: coverage-miss keeps a candidate `certain`; runtime-hit on a 0-static-ref symbol → `maybe` ("reached dynamically"). Replaced the `coverage: not available` placeholder.
- `04-fix-safe` (`5236bcd`) — `necro fix` subcommand: removes only `certain`-dead via ts-morph `.remove()`; preview-by-default, `--write` to apply, dirty git-tree guard with `--force`.
- `05-detectors` (`713088b`) — syntactic detectors via **web-tree-sitter** (binding de-risked by a spike first): nesting/cyclomatic/cognitive/god-function over a language-agnostic IR; `--json` became `{ findings, complexity }`.
- `06-hotspots` (`a53feca`) — CRAP score (complexity²×(1−cov)³+complexity) + per-file git churn → ranked risk hotspots; `risk = (CRAP ?? complexity) × (churn ?? 1)` with graceful degrade.
- `07-duplication` (`df57d3d`) — Type-2 (renamed) clone detection on the tree-sitter parser (no jscpd): tokenize→normalize→rolling-hash→maximal-extend.
- Each phase added a docs guide page + roadmap/CLI/config/CI updates (Astro Starlight site under `website/`).
- Saved a project memory: CADENCE settle requires each AC id referenced in a test title (`.claude/projects/-home-thomas-projects-necro/memory/cadence-settle-ac-test-gate.md`).

## Carry-forward gotchas
- **`git_dirty: true` is only the untracked `.cadence/handoff/` + `.cadence/intelligence/` archives** — no WIP code, no stash. Working tree is otherwise clean; nothing to restore.
- **CADENCE settle gate:** every AC id (AC-1…) must appear literally in a test title, else `cadence settle run` refuses. Tag tests `(AC-N)` up front; verify with `for n in 1 2 3…; do grep -rl "AC-$n" test/; done`. (See the saved memory.)
- **Two Node versions:** the CLI targets Node ≥ 20 (default nvm 20.20.2). The docs site under `website/` needs **Node ≥ 22** — `nvm use 22` before any `website/` npm command or the build fails. The docs link-validator is a **hard build gate** (link to a not-yet-created page fails `astro build`).
- **Headless CADENCE gates:** `draft approve` / `settle run` need flags in this non-TTY session — `draft approve … --no-approve`; `settle run --auto`. `spec check` takes a **path**; `spec approve <phase> <num>` has no `--no-approve`.
- **Multi-axis seams:** `scan` now returns `{ findings, complexity, hotspots, duplication }`; `--json` mirrors that object (not the old findings array). The heavy axis (tree-sitter + git) is gated by the `complexity` scan option — `necro fix` passes `{ complexity: false }` so it never pays for it. tree-sitter is lazy-imported; the grammar wasm is resolved at runtime from `node_modules/tree-sitter-wasms/out/` (kept external, never bundled).
- **Core invariant (§3):** detectors read the language-agnostic IR / normalized tokens only; tree-sitter/TS node names live solely in `src/syntactic/ir.ts`, `tokens.ts`, `parse.ts`. Keep it that way for the Python adapter later.
- **`necro.config.json` loads from CWD, not the scan target** — a smoke test must run with cwd = the project being scanned for its config to apply.
- The pre-1.5 `SESSION-2026-06-08.md` (no label) is the morning's resume-source, kept as an archive; this labeled doc is now the freshest (`lastHandoff` points here).

## Next action
**Action:** Resolve the open direction with the user, then start it as CADENCE phase 08. The recommended next slice is the **LLM tier — triage on the `maybe` false-positive sink** (design step 12: an LLM resolves quarantined `maybe` dead-code findings necro refuses to guess on). This is a categorically different slice from the deterministic ones — it introduces the Anthropic API, API-key handling, prompt design, cost, and an eval harness — so do the up-front design with rigor (model choice, prompt contract, eval/reference dataset) rather than the quick 2-question cadence. Then run the loop: `cadence spec new 08-llm-triage 08 --title=…` → fill SPEC (resolve open decisions via AskUserQuestion) → `spec approve` → `draft new` → `draft approve --no-approve` → build (TDD, tag tests `(AC-N)`) → `settle run --auto`. Alternatives if the user redirects: LLM refactors (step 13, depends on the triage integration), or polish/harden the existing axes.

**Verify:** `cadence progress` / `cadence status` shows the loop advancing through phase 08; before settling, confirm every AC id appears in a test title. `npx vitest run` green + `npm run typecheck` clean before each commit; `nvm use 22 && npm --prefix website run build` for any docs change.

**If it fails:** for the LLM work, read the `claude-api` skill (model ids, SDK, tool use, token/cost) before writing API code, and consider the AI-integration workflow (`gsd-ai-integration-phase`) for the eval-harness rigor. If a `website/` command errors on Node version, `nvm use 22` first. Headless CADENCE gates need the flags noted in Carry-forward gotchas.
