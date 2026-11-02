# Dispatch: Worker M2 (Backend Terminology, Status & Metrics API)

Read:
- ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- Explorer M2-1 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m2_1\handoff.md
- Explorer M2-2 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m2_2\handoff.md
- Explorer M2-3 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m2_3\handoff.md

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Write Ownership
You exclusively own:
- `server/controllers/adminController.js`
- `server/scripts/ptShadow.js`

## Tasks
1. In `server/controllers/adminController.js`:
   - Update `getPtStatus`:
     - Emit `standard` and `optimized` phase objects (`{ phase, running, done, startedAt, finishedAt, ms }`) alongside legacy aliases `naive` and `reduced`.
     - Support legacy lock fallback cleanly.
   - Update `getPtMetrics`:
     - Emit top-level `avgStandardMs`, `avgOptimizedMs`, `medStandardMs`, `medOptimizedMs`, `throughputStandard`, `throughputOptimized` alongside legacy aliases `avgNaiveMs`, `avgReducedMs`, etc.
     - In `perSpecStats`: Include `description` for each query spec resolved from `specs` (require `server/pt/specs/index.js`), emit `avgStandardMs`, `throughputStandard`, etc., and include `standard_ms`, `optimized_ms` in per-spec `timeline`.
     - In global `timeline`: Include `standard_ms`, `optimized_ms` alongside legacy fields.
   - Update `getPtLog`:
     - Map records to include `standard_ms` and `optimized_ms` (and in nested `best`/`worst_case`), preserving legacy aliases so historical records are seamlessly returned with both terminologies.
2. In `server/scripts/ptShadow.js`:
   - In `phaseState`, track `standard` and `optimized` phases alongside `naive` and `reduced`.
   - When writing `.pt-shadow-status.json`, write `standard` and `optimized` objects.
   - In `buildRow()`, log `standard_ms` and `optimized_ms` alongside legacy properties.
3. Verification:
   - Run the E2E test suite: `cd server && node --test tests/e2e_pt_revamp.test.js`
     **Verify all 54 tests pass (54/54 PASS, 0 FAIL)**!
   - Run the core PT tests: `cd server && node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js`
     **Verify all 12 core tests pass (12/12 PASS, 0 FAIL)**!
   - Run `node server/scripts/verifyBench.js` and verify all 30 checks pass.
4. Document all file changes, test outputs, and verification results in `handoff.md` and notify parent.

## 2026-10-27T11:57:43Z
[Message] sender=3db740df-a683-42d2-bd42-2a3faa75405e priority=MESSAGE_PRIORITY_HIGH
Tasks assigned:
- In server/controllers/adminController.js: update getPtStatus, getPtMetrics, getPtLog to support standard/optimized alongside naive/reduced.
- In server/scripts/ptShadow.js: track standard/optimized alongside naive/reduced in phaseState, status file, and log records.
- Run tests: e2e_pt_revamp.test.js (54/54), bloom/pt/transfer (12/12), verifyBench.js (all pass).
- Document in handoff.md and notify parent.

## 2026-10-27T12:08:12Z
[Message] sender=3db740df-a683-42d2-bd42-2a3faa75405e priority=MESSAGE_PRIORITY_HIGH
**Context**: Milestone M2 Worker status check
**Content**: Checking progress on `adminController.js` / `ptShadow.js` implementation and test suite verification.
**Action**: Please provide a brief update on your current step and when your handoff report will be ready.
