# Dispatch: Milestone 3 Worker (Frontend PT Log Page Revamp)

Working Directory: `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m3_1`

## Mandatory Reading
1. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md` (Verbatim user request - MANDATORY)
2. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md` (Global specs and interface contracts)
3. Explorer M3-1 Handoff & Patches:
   - `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_1\handoff.md`
   - `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_1\analysis.md`
   - `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_1\proposed_PtLogPage_terminology.patch`
   - `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_1\proposed_ProductDiscoveryPage_terminology.patch`
4. Explorer M3-2 Handoff & Status Card Design:
   - `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_2\handoff.md`
   - `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_2\analysis.md`
5. Explorer M3-3 Handoff & Metrics/Descriptions Design:
   - `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_3\handoff.md`
   - `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_3\proposed_components.jsx`
   - `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_3\proposed_code_snippets.md`
6. Skill: `C:\Users\steve\.gemini\config\plugins\modern-web-guidance-plugin\skills\modern-web-guidance\SKILL.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Write Ownership
You exclusively own:
- `client/src/pages/PtLogPage.jsx`
- `client/src/pages/ProductDiscoveryPage.jsx`

## Tasks
1. **Terminology Revamp**:
   - In `client/src/pages/PtLogPage.jsx` and `client/src/pages/ProductDiscoveryPage.jsx`, replace all instances of "naive" and "reduced" with "Standard MongoDB" / "Standard" and "Optimized (mongo-pt)" / "Optimized".
   - Follow the 37-point catalog in Explorer M3-1's `analysis.md` and patches.
   - Use safe dual-key fallbacks (e.g., `r.standard_ms ?? r.naive_ms`, `avgStandardMs ?? avgNaiveMs`).
2. **Real-Time Status Indicator (`RealTimeStatusCard`)**:
   - Integrate the prominent, stepped `RealTimeStatusCard` designed by Explorer M3-2 into `PtLogPage.jsx`.
   - Include:
     - Active vs. Idle indicator with pulsing radar dot (`motion-safe:animate-ping` / `motion-safe:animate-pulse`), high-contrast elapsed timer, and live trigger attribution.
     - Stepped 3-phase progression:
       - Phase 1: `Optimized (mongo-pt)` (running / done / ms)
       - Phase 2: `Standard MongoDB` (running / done / ms)
       - Phase 3: `Verification & Materialization` (done / checksum parity)
     - Dynamic elapsed timer updating at 200ms intervals during active execution, rendering tenths of a second (`4.2s`), and pausing when idle.
     - Adaptive polling: 1500ms when active (`running: true`), 5000ms when idle, with immediate refresh on completion.
     - Full accessibility: `role="status"`, `aria-live="polite"`.
3. **Per-Query Descriptions & Comprehensive Metrics Display**:
   - Integrate the components and data model from Explorer M3-3 (`proposed_components.jsx` / `proposed_code_snippets.md`):
     - Display canonical per-query descriptions in both the query summary table and the main log table / details drawer.
     - Decouple user search triggers (e.g. search keywords in live queries) from canonical relational query calculus descriptions.
     - Display comprehensive metrics:
       - Dual Latency & Instantaneous Throughput ($q/s$)
       - Speedup acceleration badge ($>1.0\times$ highlighted)
       - Transfer & materialization overhead breakdown
       - Result verification badge (`equal: 'ok'`, checksum)
4. **Verification**:
   - Run `npm run build --prefix client` to verify clean React compilation (0 errors, 0 warnings).
   - Run `cd server && node --test tests/e2e_pt_revamp.test.js` (verify 54/54 PASS).
   - Run `cd server && node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js` (verify 12/12 PASS).
   - Run `node server/scripts/verifyBench.js` (verify 30/30 checks PASS).
5. Document all changes, component structures, and test results in `handoff.md` and notify parent.

## 2026-10-27T12:34:41Z
You are Milestone 3 Worker (Frontend PT Log Page Revamp).
Your working directory is: C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m3_1
Your parent is: 3db740df-a683-42d2-bd42-2a3faa75405e
MANDATORY: Read C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.

