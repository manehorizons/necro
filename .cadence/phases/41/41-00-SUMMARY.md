# SETTLE Summary — 41-00

**Completed:** 2026-07-17T03:42:14.674Z

## Acceptance Criteria

- AC-1: PASS (assertion)
- AC-2: PASS (assertion)
- AC-3: PASS (assertion)
- AC-4: PASS (assertion)
- AC-5: PASS (assertion)
- AC-6: PASS (assertion)

## Tasks

- T1: DONE — Created src/llm/client.ts (lazyAnthropic, resolveApiKey, MissingApiKeyError moved verbatim from triage/client.ts; added structuredCall<T> per AC-2). test/llm-client.test.ts: 7 tests red→green, npx tsc --noEmit clean.
- T2: DONE — triage/client.ts rewired onto src/llm/client.ts's structuredCall; createTriageClient takes optional {onUsage}. test/triage-client.test.ts: SDK-isolation tests updated to point at src/llm/client.ts, added onUsage-fires test via vi.mock(@anthropic-ai/sdk). 9/9 tests green. Remaining tsc errors (T3-T5's files still import moved symbols from triage/client.js) are expected until those tasks land.
- T3: DONE — refactor/client.ts rewired onto src/llm/client.ts's structuredCall (propose + proposeDuplicate); createRefactorClient takes optional {onUsage}. test/refactor-client.test.ts: SDK-isolation test updated to src/llm/client.ts, added onUsage tests for both propose (success path) and proposeDuplicate (malformed-response path, confirming usage reports even on parse failure). 6/6 tests green, plus refactor.test.ts/refactor-duplicate.test.ts/refactor-eval.test.ts (40 total) unaffected.
- T4: DONE — explain/client.ts rewired onto src/llm/client.ts's structuredCall; createNarrateClient takes optional {onUsage}. Refined structuredCall to only JSON-parse the text block when `schema` is given (narrate has none) so free-form prose is handed to `parse` untouched, exactly preserving narrate's original text.trim() behavior — avoided a subtle behavior change where prose that happens to be valid JSON would otherwise get mis-parsed. test/explain-narrate-client.test.ts: import fixed to src/llm/client.ts, added onUsage test via vi.mock. 3/3 + explain-narrate.test.ts (4) + mcp-explain-narrate.test.ts (2) all green.
- T5: DONE — cli.ts: both MissingApiKeyError references now use the top-level ./llm/client.js import (removed the shadowing local re-import in the triage action, removed the separate dynamic import in the refactor action). Wired onUsage on createTriageClient/createRefactorClient to accumulate a running {inputTokens,outputTokens} total; print `tokens: N in / M out` to stderr after each command's report (only when at least one call happened — res.triaged.length>0 / res.outcomes.length>0 — both god-function and extract-duplicate refactor branches covered). mcp/tools/explain.ts: import switched to ../../llm/client.js. npm run build, npx tsc --noEmit, npm test (499 passed/6 pre-existing skips), and npx vitest run --coverage (100% stmts/funcs/lines on the six tracked modules, exit 0) all green.
- T6: DONE — Final regression pass: grep -rn "triage/client" src confirms zero stray references to the moved symbols (only TriageClient/createTriageClient remain, which correctly still live in triage/client.ts). npm run build, npm run typecheck, npm test all green (499 passed, 6 pre-existing skips). Manually verified necro triage still degrades correctly with no API key (unchanged message/behavior).

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- build-test-must-pass: skipped — no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: skipped — not requested (no --deep / --interactive, not in gate set)
- code-review: skipped — not in the active tier × profile gate set
- security-audit: skipped — not in the active tier × profile gate set

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
