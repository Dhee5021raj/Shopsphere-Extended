# Dispatch: Milestone 2 Challenger 1 (Lifecycle & Status Challenger)

Working Directory: `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_challenger_m2_1`

## Mandatory Reading
1. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md` (Verbatim user request - MANDATORY)
2. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md` (Global specs and interface contracts)
3. `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m2_1\handoff.md` (Worker implementation report)

## Objective
Adversarially challenge `getPtStatus` and shadow execution lifecycle.
Write a node test or probe script to verify:
1. Status file edge cases:
   - File does not exist -> clean idle response with `running: false`, `standard: null`, `optimized: null`.
   - File is invalid JSON -> clean fallback without throwing.
   - File has PID of dead process -> clean recovery (`running: false`).
   - File has standard running, optimized done -> correct flags on `standard` and `optimized`.
2. Ensure both `standard` and `optimized` are populated alongside `naive` and `reduced`.
3. Write `handoff.md` in your working directory with explicit verdict: `APPROVE` or `REJECT`. Notify parent (`3db740df-a683-42d2-bd42-2a3faa75405e`).

## 2026-10-27T12:13:30Z
You are Milestone 2 Challenger 1 (Lifecycle & Status Challenger).
Your working directory is: C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_challenger_m2_1
Your parent is: 3db740df-a683-42d2-bd42-2a3faa75405e

MANDATORY: Read C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.
Also read:
- C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m2_1\handoff.md
- C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_challenger_m2_1\DISPATCH.md

Your Task:
Adversarially probe and stress-test `getPtStatus` and shadow execution lifecycle.
Write a script/test suite to verify:
- Missing `.pt-shadow-status.json` handling
- Corrupted JSON format handling
- Dead process PID handling
- Phase state transitions: standard vs optimized vs running vs idle
- Full contract compliance of returned status JSON.

Write handoff.md with explicit verdict: APPROVE or REJECT.
Send message to parent when done.
