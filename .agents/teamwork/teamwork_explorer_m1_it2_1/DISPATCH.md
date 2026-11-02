## 2026-10-27T11:19:25Z
# Dispatch: Explorer M1 Iteration 2 (Input Validation Architecture)

Read:
- ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- Challenger M1-1 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_challenger_m1_1\handoff.md

## Previous Failure Context (VULN-M1-01)
Challenger M1-1 rejected Milestone 1 due to VULN-M1-01:
`server/scripts/seedBench.js` argument parser permits negative integers (`--products=-50`) and arbitrary unknown options. When invoked with `--products=-50`, it connects to MongoDB, inserts partial records (categories, vendors, users) before crashing with `RangeError: Invalid array length`, leaving database state corrupted.

## Task
1. Investigate `server/scripts/seedBench.js` `parseArgs()`.
2. Propose a fail-fast input validation design:
   - Allowlist of recognized options (`products`, `orders`, `items`, `vendors`, `categories`, `users`, `reviews`, `seed`, `batch`, `drop`, `small`, `medium`).
   - Validate that numeric parameters are positive integers (`val > 0`).
   - Ensure errors are thrown immediately before any database connection or mutation occurs.
3. Formulate recommended implementation for Worker in handoff.md.
