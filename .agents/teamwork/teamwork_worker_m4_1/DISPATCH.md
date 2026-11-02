# Dispatch: Milestone 4 Worker (Final Milestone: E2E Verification & Integration)

Working Directory: `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m4_1`

## Mandatory Reading
1. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md` (Verbatim user request - MANDATORY)
2. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md` (Global specs and interface contracts)
3. `C:\GEMINI\DBMS_PRJ\Shopsphere\TEST_READY.md` (E2E Test Suite summary)
4. `C:\GEMINI\DBMS_PRJ\Shopsphere\TEST_INFRA.md` (Test methodology and coverage thresholds)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Tasks (Phase 1)
1. Execute the entire E2E test suite:
   ```powershell
   cd server
   node --test tests/e2e_pt_revamp.test.js
   ```
   Verify 100% pass across all 4 tiers (54/54 tests PASS, 0 FAIL). Document per-tier pass counts.
2. Execute the core PT test suite:
   ```powershell
   cd server
   node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js
   ```
   Verify 12/12 tests PASS.
3. Execute the benchmark database verification:
   ```powershell
   node server/scripts/verifyBench.js
   ```
   Verify all 30 checks PASS.
4. Execute the frontend production build:
   ```powershell
   npm run build --prefix client
   ```
   Verify exit code 0 and clean build.
5. Verify live endpoint responses by testing Node invocation of `adminController` controller methods for `getPtStatus`, `getPtMetrics`, and `getPtLog`.
6. Write a comprehensive `handoff.md` with all outputs and test metrics, then notify parent (`3db740df-a683-42d2-bd42-2a3faa75405e`).


## 2026-10-27T13:01:09Z
You are Milestone 4 Worker (Final Milestone: E2E Verification & Integration).
Your working directory is: C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m4_1
Your parent is: 3db740df-a683-42d2-bd42-2a3faa75405e

MANDATORY: Read C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.
Also read:
- C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m4_1\DISPATCH.md
- C:\GEMINI\DBMS_PRJ\Shopsphere\TEST_READY.md
- C:\GEMINI\DBMS_PRJ\Shopsphere\TEST_INFRA.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. Run the full E2E test suite: `cd server && node --test tests/e2e_pt_revamp.test.js` (verify 54/54 PASS across Tiers 1-4).
2. Run the core PT tests: `cd server && node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js` (verify 12/12 PASS).
3. Run the database verification: `node server/scripts/verifyBench.js` (verify 30/30 checks PASS).
4. Run the frontend build: `npm run build --prefix client` (verify exit code 0).
5. Verify live endpoint responses for `getPtStatus`, `getPtMetrics`, `getPtLog`.
6. Write a comprehensive handoff.md and notify parent when done.
