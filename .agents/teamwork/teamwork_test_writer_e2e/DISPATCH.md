# Dispatch: E2E Testing Track

Read:
- ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md

## Scope & Purpose
You are the dedicated E2E Test Writer. Your role is to design and implement an independent, opaque-box, requirement-driven test suite for the mongo-pt query optimization log revamp.

## Requirements to Cover
1. **Terminology Update (R1)**:
   - Verify that responses from `GET /api/admin/pt-log`, `GET /api/admin/pt-status`, and `GET /api/admin/pt-metrics` conform to the updated terminology:
     - `standard` and `optimized` in `/api/admin/pt-status`
     - `avgStandardMs`, `avgOptimizedMs`, `throughputStandard`, `throughputOptimized`, `perSpecStats` in `/api/admin/pt-metrics`
     - `standard_ms`, `optimized_ms` in `/api/admin/pt-log`
   - Verify that legacy aliases (`naive`, `reduced`, `naive_ms`, `reduced_ms`) are also present for backward compatibility.
2. **Real-Time Query Execution Status Indicator (R2)**:
   - Verify that `GET /api/admin/pt-status` returns valid JSON with `running` (boolean), phase progression objects (`standard` and `optimized`), and timestamps.
   - Verify active status vs idle status representation.
3. **Per-Query Descriptions and Metrics (R3)**:
   - Verify that `perSpecStats` contains a non-empty `description` string explaining what each query computes.
   - Verify that latency, throughput (q/s), speedup factor, and overhead percentage are present and mathematically valid (e.g. speedup > 0, overhead >= 0).
   - Verify result equality check: `equal: true` / `'ok'` and matching checksum.
4. **Benchmark Dataset Scaling & Optimization Gains (R4)**:
   - Verify that `shopsphere_bench` contains at least 50,000 products and 400,000 order items.
   - Verify that selective multi-relation queries demonstrate measurable speedup (>1x) under Optimized (mongo-pt) vs Standard MongoDB.
5. **Functional Integrity (R5)**:
   - Verify that existing PT test suite (`npm run test:pt`) passes.

## Test Methodology (4 Tiers)
- **Tier 1 - Feature Coverage**: >=5 tests per feature (isolated checks for endpoints, fields, descriptions, status, scaling).
- **Tier 2 - Boundary & Corner Cases**: Edge cases (empty status file, zero records, extreme query parameters, divide-by-zero prevention).
- **Tier 3 - Cross-Feature Combinations**: Pairwise interactions (status active during benchmark run, speedup calculation across various query specs).
- **Tier 4 - Real-World Application Scenarios**: Realistic end-to-end benchmark run cycle and validation.

## Outputs Required
1. `TEST_INFRA.md` at project root `C:\GEMINI\DBMS_PRJ\Shopsphere\TEST_INFRA.md` following the template in Project Pattern.
2. An executable test script (e.g. in `server/tests/e2e_pt_revamp.test.js` runnable via Node test runner `node --test tests/e2e_pt_revamp.test.js`).
3. Once the test suite is ready, publish `TEST_READY.md` at `C:\GEMINI\DBMS_PRJ\Shopsphere\TEST_READY.md`.
4. Detailed handoff report at `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_test_writer_e2e\handoff.md`.


## 2026-10-27T10:47:10Z
From: 3db740df-a683-42d2-bd42-2a3faa75405e
You are teamwork_test_writer_e2e.
Your working directory is: C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_test_writer_e2e
Your task:
1. First, read ORIGINAL_REQUEST.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\ORIGINAL_REQUEST.md, PROJECT.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\orchestrator\PROJECT.md, and DISPATCH.md at C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_test_writer_e2e\DISPATCH.md.
2. Build an opaque-box, requirement-driven test suite following the 4-tier methodology (Tiers 1-4) outlined in DISPATCH.md:
   - Tier 1: Feature Coverage (>=5 tests per feature for terminology, status, metrics, descriptions, dataset scale)
   - Tier 2: Boundary & Corner Cases
   - Tier 3: Cross-Feature Combinations
   - Tier 4: Real-World Application Scenarios
3. Create TEST_INFRA.md at C:\GEMINI\DBMS_PRJ\Shopsphere\TEST_INFRA.md documenting the test architecture, inventory, and coverage.
4. Implement the test suite in server/tests/e2e_pt_revamp.test.js (or similar runnable via node --test).
5. When the test suite is ready and structured, create TEST_READY.md at C:\GEMINI\DBMS_PRJ\Shopsphere\TEST_READY.md.
6. Write your handoff report to C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_test_writer_e2e\handoff.md and notify me via send_message.
