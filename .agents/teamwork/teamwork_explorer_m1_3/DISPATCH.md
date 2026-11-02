# Dispatch: Explorer M1-3 (Query Speedup & Test Verification)

Read:
- ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- Previous survey report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_survey_3\handoff.md

## Objective
Investigate benchmark query execution and speedup verification on the scaled dataset:
1. Examine `server/scripts/ptExecute.js` and `rare_category_revenue_7d` multi-relation query.
2. Confirm how Standard MongoDB vs Optimized (mongo-pt) execution times and speedup (>1x) are measured and verified for result equality.
3. Check `npm run test:pt` execution requirements and expected passing status.
4. Recommend exact execution and verification commands for Worker.
5. Output handoff.md in your working directory.

## 2026-10-27T10:48:30Z
You are teamwork_explorer_m1_3.
Your working directory is: C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_3
Your task:
1. First, read ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md, PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md, and DISPATCH.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_3\DISPATCH.md. Also review C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_survey_3\handoff.md.
2. Investigate query speedup verification and PT test suite execution:
   - Check how server/scripts/ptExecute.js measures Standard MongoDB vs Optimized (mongo-pt) execution times on rare_category_revenue_7d.
   - Check npm run test:pt execution and assertions.
   - Formulate recommended commands and expected outputs for Worker.
3. Write your handoff report to C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_3\handoff.md and notify me via send_message.
