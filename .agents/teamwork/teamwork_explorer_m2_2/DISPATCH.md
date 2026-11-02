# Dispatch: Explorer M2-2 (Metrics API & Query Descriptions)

Read:
- ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- Survey 2 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_survey_2\handoff.md
- `server/controllers/adminController.js` (`getPtMetrics`)
- `server/pt/specs/index.js`

## Task
Investigate performance metrics computation and query descriptions:
1. Examine `getPtMetrics` in `server/controllers/adminController.js`.
2. Formulate dual-emission for aggregate metrics:
   - `avgStandardMs`, `avgOptimizedMs`, `medStandardMs`, `medOptimizedMs`, `throughputStandard`, `throughputOptimized` alongside legacy aliases `avgNaiveMs`, `avgReducedMs`, etc.
3. Formulate `perSpecStats` enhancements:
   - Include a canonical `description` string for each query spec (derived from `server/pt/specs/index.js`).
   - Include updated metric keys (`avgStandardMs`, `throughputStandard`, etc.) alongside legacy keys.
   - Include `standard_ms` and `optimized_ms` in `timeline`.
4. Formulate exact before/after code modifications for Worker M2 in handoff.md.

## 2026-10-27T11:48:11Z
You are teamwork_explorer_m2_2.
Your working directory is: C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m2_2

Read:
- ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- DISPATCH.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m2_2\DISPATCH.md
- server/controllers/adminController.js (getPtMetrics)
- server/pt/specs/index.js

Investigate getPtMetrics, updated metrics keys, and per-query descriptions:
1. Formulate dual-emission of avgStandardMs, avgOptimizedMs, throughputStandard, throughputOptimized.
2. Formulate canonical query description inclusion in perSpecStats from pt/specs.
3. Formulate handoff report in handoff.md and notify me via send_message.
