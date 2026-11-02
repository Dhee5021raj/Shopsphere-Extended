# Dispatch: Worker M1 (Benchmark Scaling & Verification)

Read:
- ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md
- Explorer M1-1 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_1\handoff.md
- Explorer M1-2 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_2\handoff.md
- Explorer M1-3 Report at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_3\handoff.md

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Write Ownership
You exclusively own:
- `server/scripts/seedBench.js`
- `server/scripts/verifyBench.js` (if creating a standalone verification script)
- `shopsphere_bench` database seeding

## Task Description
1. Update `server/scripts/seedBench.js` to natively support the `--medium` preset flag in `parseArgs()`:
   ```javascript
   } else if (raw === '--medium') {
     Object.assign(opts, { products: 50000, orders: 100000, items: 400000, vendors: 100, categories: 30, users: 20000, reviews: 100000 });
   ```
2. Verify that `shopsphere_bench` has the scaled dataset:
   - Run `node scripts/seedBench.js --medium --drop` (or with explicit parameters) if re-seeding is needed to align with current timestamp.
   - Run document count and index verification (e.g. creating/running `server/scripts/verifyBench.js` based on Explorer M1-2's turnkey check).
3. Execute `npm run test:pt` and verify all 12 tests pass cleanly.
4. Execute benchmark speedup verification (`node scripts/ptExecute.js rare_category_revenue_7d --orders=1`) and verify >1x speedup and `equal: ok`.
5. Document all commands, execution outputs, and results in `handoff.md` in your working directory.
