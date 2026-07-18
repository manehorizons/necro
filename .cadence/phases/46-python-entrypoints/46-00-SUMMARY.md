# SETTLE Summary — 46-00

**Completed:** 2026-07-18T02:39:07.832Z

## Acceptance Criteria

- AC-1: PASS (assertion)
- AC-2: PASS (assertion)
- AC-3: PASS (assertion)
- AC-4: PASS (assertion)
- AC-5: PASS (assertion)
- AC-6: PASS (assertion)
- AC-7: PASS (assertion)

## Tasks

- T1: DONE — src/engine/python-entries.ts scaffolded: sectioned [section] key=value scanner + resolveDottedModule lookup. Verified indirectly via T2's pyproject test (6/6 green).
- T2: DONE — pyproject.toml [project.scripts]/[gui-scripts]/[entry-points.*] extraction. test/engine-python-entries-pyproject.test.ts, 6/6 green, AC-1 tagged.
- T3: DONE — setup.cfg [options.entry_points] console_scripts extraction. test/engine-python-entries-setup-cfg.test.ts, 4/4 green, AC-2 tagged.
- T4: DONE — setup.py literal console_scripts via tree-sitter (call+attribute-call forms), dynamic entry_points skipped honestly. test/engine-python-entries-setup-py.test.ts, 5/5 green, AC-3 tagged.
- T5: DONE — __main__.py unconditional root + tree-sitter module-level if __name__=="__main__" guard (both operand orders); nested (non-module-level) guard correctly excluded. test/engine-python-entries-dunder-main.test.ts, 5/5 green, AC-4 tagged.
- T6: DONE — main.py/app.py/manage.py/wsgi.py/asgi.py -> prod entry (convention); conftest.py -> testEntries. test/engine-python-entries-conventions.test.ts, 7/7 green, AC-5 tagged.
- T7: DONE — resolvePythonEntries wired into buildReachabilityModel (src/engine/model.ts), merged into prodEntries/prodEntryRecords/testEntries. test/model-python-entries.test.ts, 3/3 green, AC-6 tagged.
- T8: DONE — End-to-end fixture in test/scan-python-entrypoints.test.ts covering all mechanisms via scan() diagnostics.entryResolution; AC-7 tagged. Full suite 637/637 green (up from 606), build+typecheck clean, zero behavior change on non-Python/existing-Python paths.

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
