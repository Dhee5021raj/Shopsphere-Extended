# Dispatch: Milestone 3 Reviewer 1 (UI & Terminology Reviewer)

Working Directory: `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_reviewer_m3_1`

## Mandatory Reading
1. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md` (Verbatim user request - MANDATORY)
2. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md` (Global specs and interface contracts)
3. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m3_1\handoff.md` (Worker implementation report)
4. Skill: `C:\Users\steve\.gemini\config\plugins\modern-web-guidance-plugin\skills\modern-web-guidance\SKILL.md`

## Tasks
Review `client/src/pages/PtLogPage.jsx` and `client/src/pages/ProductDiscoveryPage.jsx`.
1. Verify terminology revamp:
   - Check that all user-facing instances of "naive" and "reduced" have been replaced with "Standard MongoDB" / "Standard" and "Optimized (mongo-pt)" / "Optimized".
   - Check stat cards, table headers, table cells, chart keys, chart legends, tooltips, and status chips.
2. Verify dual-key fallbacks prevent breaking legacy API payloads.
3. Verification:
   - Run `npm run build --prefix client` (verify exit code 0).
   - Run `cd server && node --test tests/e2e_pt_revamp.test.js` (verify 54/54 PASS).
   - Run `cd server && node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js` (verify 12/12 PASS).
   - Run `node server/scripts/verifyBench.js` (verify 30/30 checks PASS).
4. Write `handoff.md` with explicit verdict `APPROVE` or `REQUEST_CHANGES`. Notify parent (`3db740df-a683-42d2-bd42-2a3faa75405e`).

## 2026-10-27T12:44:58Z
You are Milestone 3 Reviewer 1 (UI & Terminology Reviewer).
Your working directory is: C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_reviewer_m3_1
Your parent is: 3db740df-a683-42d2-bd42-2a3faa75405e

MANDATORY: Read C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.
Also read:
- C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m3_1\handoff.md
- C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_reviewer_m3_1\DISPATCH.md
- Skill: C:\Users\steve\.gemini\config\plugins\modern-web-guidance-plugin\skills\modern-web-guidance\SKILL.md

Your Tasks:
Review `client/src/pages/PtLogPage.jsx` and `client/src/pages/ProductDiscoveryPage.jsx`.
Verify terminology revamp (all user-facing instances of "naive" and "reduced" replaced with "Standard MongoDB" / "Standard" and "Optimized (mongo-pt)" / "Optimized").
Run:
- `npm run build --prefix client`
- `cd server && node --test tests/e2e_pt_revamp.test.js`
- `cd server && node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js`
- `node server/scripts/verifyBench.js`

Write handoff.md with explicit verdict APPROVE or REQUEST_CHANGES.
Send message to parent when done.
