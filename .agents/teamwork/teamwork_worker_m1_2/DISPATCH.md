# Dispatch: Worker M1 Iteration 2 (VULN-M1-01 Fix & Mutation Safety)

Read:
- ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- Challenger M1-1 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_challenger_m1_1\handoff.md
- Explorer M1-it2-1 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_it2_1\handoff.md
- Explorer M1-it2-2 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_it2_2\handoff.md
- Explorer M1-it2-3 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_it2_3\handoff.md

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Write Ownership
You exclusively own:
- `server/scripts/seedBench.js`
- `server/scripts/verifyBench.js`

## Tasks
1. In `server/scripts/seedBench.js`, implement the fail-fast input validation for `parseArgs(argv)` per Explorer 1 & 2's design:
   - Define `ALLOWED_NUMERIC_KEYS = new Set(['products', 'orders', 'items', 'vendors', 'categories', 'users', 'reviews', 'seed', 'batch'])`.
   - Standalone flags permitted: `--drop`, `--small`, `--medium`.
   - Any key/value option must match `ALLOWED_NUMERIC_KEYS`. Reject unknown flags immediately (`throw new Error('Unknown argument: ' + raw)`).
   - Validate that numeric strings are strictly integers (`/^-?\d+$/`).
   - Validate that scale options are positive integers (`val > 0`), and `seed` is a non-negative integer (`val >= 0`). Throw `Error: Value for --${key} must be a positive integer` if invalid.
   - All validation MUST happen synchronously in `parseArgs()`, before `main()` connects to MongoDB or performs any collection operations.
2. In `server/scripts/verifyBench.js`, incorporate adversarial CLI checks (e.g. executing `node server/scripts/seedBench.js --products=-50` as a child process and verifying exit code !== 0 and zero DB mutations).
3. Verify that `node server/scripts/seedBench.js --products=-50` fails with exit code 1 and leaves MongoDB untouched.
4. Verify that `node server/scripts/verifyBench.js` passes all checks (exit code 0).
5. Verify that core PT tests (`node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js`) pass 12/12.
6. Verify query speedup on `rare_category_revenue_7d` (>1x, equal: ok).
7. Document commands and verification output in `handoff.md` and notify parent.


## 2026-10-27T11:29:02Z
You are teamwork_worker_m1_2.
Your working directory is: C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_worker_m1_2

Tasks:
1. In server/scripts/seedBench.js, implement fail-fast input validation for parseArgs:
   - Allowlist: ALLOWED_NUMERIC_KEYS = new Set(['products', 'orders', 'items', 'vendors', 'categories', 'users', 'reviews', 'seed', 'batch'])
   - Standalone flags: '--drop', '--small', '--medium'
   - For all key=value args: reject unknown keys with Error('Unknown argument: ' + raw)
   - Reject non-integer strings with Error('Value for --' + key + ' must be an integer, got: ' + valStr)
   - Reject non-positive values (val <= 0) for scale keys with Error('Value for --' + key + ' must be a positive integer')
   - Reject negative seed (val < 0)
   - Ensure all validation runs before connectBench() is called.
2. In server/scripts/verifyBench.js, add adversarial checks that verify running `seedBench.js --products=-50` exits with non-zero code and does not modify the database.
3. Test `node server/scripts/seedBench.js --products=-50` directly to confirm immediate error and 0 DB changes.
4. Run `node server/scripts/verifyBench.js` and confirm ALL CHECKS PASS.
5. Run core PT tests: `cd server && node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js` and confirm 12/12 pass.
6. Run `cd server && node scripts/ptExecute.js rare_category_revenue_7d --orders=1` and confirm speedup > 1x and equal: 'ok'.
7. Document all commands, execution outputs, and verification in handoff.md and notify me via send_message.
