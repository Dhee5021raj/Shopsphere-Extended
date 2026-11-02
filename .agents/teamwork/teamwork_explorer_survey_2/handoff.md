# Handoff Report: Backend API Endpoints & mongo-pt Execution Pipeline Survey

**Agent**: `teamwork_explorer_survey_2`  
**Milestone**: Backend API & Execution Engine Survey  
**Date**: 2026-10-27  

---

## 1. Observation

### 1.1 Route Definitions & Controllers
- **Routes (`server/routes/adminRoutes.js:28-34`)**:
  ```javascript
  // mongo-pt shadow log (Step 7)
  router.get('/pt-log', getPtLog);
  // live measurement status for the run-indicator chip
  router.get('/pt-status', getPtStatus);
  // aggregate performance metrics for the dashboard
  router.get('/pt-metrics', getPtMetrics);
  ```
  All three endpoints are mounted on `/api/admin` and guarded by `protect` and `authorizeRoles('admin')` (`server/routes/adminRoutes.js:16-17`).

- **Controllers (`server/controllers/adminController.js`)**:
  - `getPtLog` (lines 113–126): Reads `process.env.PT_LOG || path.join(__dirname, '..', 'logs', 'pt-log.jsonl')`, parses up to the last 100 lines, reverses order (newest first), and returns JSON array.
  - `getPtStatus` (lines 137–191): Reads `server/logs/.pt-shadow-status.json`. Checks PID liveness using `process.kill(pid, 0)` and freshness within `STALE_MS` (15 minutes). Formats phases using `shape()`:
    ```javascript
    const phases = { naive: shape(rec.naive), reduced: shape(rec.reduced) };
    return res.json({
      running: anyPhase,
      startedAt: rec.startedAt || null,
      ...phases,
      staleAfterMin: STALE_MS / 60000,
      typicalRunSeconds: 60
    });
    ```
    Fallback for legacy lock returns `{ running, startedAt, naive: null, reduced: null, staleAfterMin: 15, typicalRunSeconds: 60 }`.
  - `getPtMetrics` (lines 206–351): Reads `pt-log.jsonl`. Filters `kind === 'shadow'` where `r.naive_ms != null && (r.reduced_ms != null || r.total_ms != null)`. Computes:
    - Mean and median latencies: `avgNaiveMs`, `avgReducedMs`, `medNaiveMs`, `medReducedMs`.
    - Throughput: `throughputNaive = 1000 / avgNaiveMs`, `throughputReduced = 1000 / avgReducedMs`.
    - Speedup: `avgSpeedup`, `maxSpeedup`, `minSpeedup`.
    - Join-order robustness: `robustnessGap = maxNaive / minNaive`.
    - Win rate: `winRate = (runs with speedup > 1) / totalRuns * 100`.
    - Overheads: `avgOverheadPct`, `avgTransferMs`, `avgMatMs`.
    - `perSpecStats`: Per-query breakdown of all the above metrics + last 20 timeline points.
    - `timeline`: Last 20 runs across all queries.

### 1.2 "Naive" vs "Reduced" Occurrences & Data Structures
- **Current JSON Response Keys**:
  - `GET /api/admin/pt-status`: Top-level keys `naive` and `reduced`.
  - `GET /api/admin/pt-metrics`: Keys `avgNaiveMs`, `avgReducedMs`, `medNaiveMs`, `medReducedMs`, `throughputNaive`, `throughputReduced`.
  - `perSpecStats` in `pt-metrics`: Keys `avgNaiveMs`, `medNaiveMs`, `avgReducedMs`, `medReducedMs`, `throughputNaive`, `throughputReduced`.
  - `timeline` in `pt-metrics`: Keys `naive_ms`, `reduced_ms`.
  - `GET /api/admin/pt-log`: Record properties `naive_ms`, `reduced_ms`, `total_ms`, `r.best.naive_ms`, `r.worst_case.naive_ms`.
- **Database / Internal Records (`server/logs/pt-log.jsonl`)**:
  - 63 historical records exist in `server/logs/pt-log.jsonl`.
  - Fields logged by `server/scripts/ptShadow.js:259-265`:
    `naive_ms`, `reduced_ms`, `transfer_ms`, `materialization_ms`, `total_ms`, `speedup`, `transfer_overhead_pct`, `equal`, `mismatch`, `result_rows`, `checksum`.
  - Status file `server/logs/.pt-shadow-status.json` written by `server/scripts/ptShadow.js:95-101`:
    contains `{ pid, startedAt, updatedAt, naive: { phase, ... }, reduced: { phase, ... } }`.

### 1.3 Execution Pipeline & State Tracking
- **Trigger Pipeline (`server/middleware/ptShadow.js`)**:
  - Gated by `process.env.PT_SHADOW === '1'`.
  - Hooked on Express `res.on('finish')` (detached background execution, 0 ms added to user response).
  - Matches routes via `SPEC_BY_ROUTE`:
    - `/api/analytics/vendor` → `vendor_scoped_revenue_90d`
    - `/api/analytics/admin` → `user_vendor_category_spend_30d`
    - `/api/products` (with search/category) → `rare_category_revenue_7d` with pinned order `p>cat>oi>v>o`
  - Spawns child detached: `spawn(process.execPath, [SCRIPT, '--spec=...', ...], { detached: true, stdio: 'ignore' })`.
  - Uses `LOCK_FILE` (`server/logs/.pt-shadow.lock`) for single-flight concurrency control.
- **Execution Engine (`server/scripts/ptShadow.js`)**:
  - Connects to `shopsphere_bench` via `connectBench()` (`server/pt/benchDb.js`).
  - **Phase Progression**:
    1. Writes `.pt-shadow-status.json`: `naive: idle`, `reduced: idle`.
    2. **Reduced (Optimized) phase runs FIRST** (`ptShadow.js:138`):
       - Sets `phaseState.reduced = { phase: 'running', startedAt, ... }`.
       - Measures `runReduced()` for `runs` iterations.
       - Sets `phaseState.reduced = { phase: 'done', finishedAt, ms }`.
    3. **Naive (Standard) phase runs SECOND** (`ptShadow.js:157`):
       - Sets `phaseState.naive = { phase: 'running', startedAt, ... }`.
       - Measures `runNaive()` for `runs` iterations.
       - Sets `phaseState.naive = { phase: 'done', finishedAt, ms }`.
    4. Evaluates secondary lines: dynamic greedy best order (`pt/bestOrder.js`) and unconstrained worst case (catalog query).
    5. Verifies results equality via `resultsEqual(naiveResult, reducedResult)`.
    6. Writes record to `pt-log.jsonl`.
    7. `finally` block unlinks `.pt-shadow-status.json` and `.pt-shadow.lock`.
- **Status Lifecycle**:
  - Running: `GET /api/admin/pt-status` returns `running: true` with active phase and elapsed timestamp.
  - Idle: Once child exits and cleans up status file, `GET /api/admin/pt-status` returns `running: false`.

### 1.4 Query Descriptions, Metrics & Verification
- **Specs (`server/pt/specs/index.js`)**:
  - Contains 7 base specs (`rare_category_revenue_7d`, `common_category_revenue_365d`, `vendor_scoped_revenue_90d`, `user_scoped_spend_30d`, `low_rating_reviews_by_category`, `vendor_category_revenue_365d`, `user_vendor_category_spend_30d`).
  - Each spec defines `description` explaining the business calculation.
  - `makeLiveSearchSpec` dynamically generates descriptions for live search splices (e.g., `Live search "laptop" — revenue per vendor...`).
- **Result Verification (`server/pt/execute.js:308-337`)**:
  - `normalizeRows()`: Rounds numbers to 2 decimal places, normalizes ObjectId strings, stringifies and sorts rows.
  - `resultsEqual()`: Compares normalized array lengths and every individual row. Returns `{ equal: true, rows }` or `{ equal: false, reason }`.
  - `checksum()`: Computes polynomial hash `length:hex` over normalized rows.

### 1.5 Benchmark Database State
- Output of `npm run db:show` (`server/scripts/showDb.js`):
  - `shopsphere` (demo DB): 530 products, 8 categories, 5 vendors, 1 order.
  - `shopsphere_bench` (bench DB): Currently has **0 documents** across all 7 collections (`users`, `products`, `order_items`, `orders`, `categories`, `vendors`, `reviews`).
  - Pre-configured scale presets in `server/scripts/repro.js:19`:
    - `medium`: `--products=50000 --orders=100000 --items=400000 --vendors=100 --categories=30 --users=20000 --reviews=100000` (matches requirement R4).

---

## 2. Logic Chain

1. **Terminology Transition (R1)**:
   - Existing frontend (`client/src/pages/PtLogPage.jsx`) and backend (`adminController.js`) use the terms `naive` and `reduced`.
   - R1 and Acceptance Criteria require labeling baseline as "Standard MongoDB" (replacing "naive") and the novel approach as "Optimized (mongo-pt)" (replacing "reduced").
   - Acceptance Criteria #44 explicitly mandates:
     > "Backend API endpoints `GET /api/admin/pt-log`, `GET /api/admin/pt-status`, and `GET /api/admin/pt-metrics` return 200 OK with valid JSON matching the updated terminology."
   - 63 historical records exist in `server/logs/pt-log.jsonl` with keys `naive_ms` and `reduced_ms`.
   - Modifying backend endpoints to emit **both** updated naming conventions (`standard_ms`, `optimized_ms`, `avgStandardMs`, `avgOptimizedMs`, `throughputStandard`, `throughputOptimized`, `standard`, `optimized`) and legacy aliases (`naive_ms`, `reduced_ms`, etc.) guarantees zero breaking changes, complete backward-compatibility, and full conformance with updated terminology.

2. **Real-Time Status Indicator (R2)**:
   - The status tracking architecture is already implemented via `.pt-shadow-status.json` and exposed by `GET /api/admin/pt-status`.
   - The child script (`scripts/ptShadow.js`) records phases in real time (`phaseState.naive`, `phaseState.reduced`).
   - However, `adminController.js` only exposes `naive` and `reduced` in the JSON response, and `PtLogPage.jsx:101` hardcodes:
     `const label = phase === 'naive' ? 'NAIVE (slow)' : 'REDUCED (faster)';`
   - Updating `adminController.js` to return `standard` and `optimized` alongside `naive` and `reduced`, updating `ptShadow.js` to write `standard` and `optimized` phases, and updating `PtLogPage.jsx` chip labels to `"Standard MongoDB"` and `"Optimized (mongo-pt)"` directly fulfills R2 without altering the reliable PID-liveness mechanism.

3. **Per-Query Descriptions & Metrics (R3)**:
   - In `PtLogPage.jsx:78`, query table cells currently display `userAction(r.trigger)` instead of what the query computes for shadow records.
   - Acceptance criteria require each query entry to display a short description stating what the query computes.
   - In `server/controllers/adminController.js`, `perSpecStats` currently omits a `description` property.
   - Adding a canonical `description` to each `perSpecStats` element (sourced from `pt/specs`) and displaying the query calculation description prominently in the PT log table ensures clear presentation for reviewers.
   - Comparative metrics (latency, throughput, speedup ratio, overhead percentage, and result equality check) are already computed in `adminController.js`; adding dual-field aliases makes them accessible under both old and new terminology.

4. **Benchmark Scaling (R4)**:
   - `shopsphere_bench` currently has 0 records. Without seeded data, recent runs on 2026-10-23 yielded 0 rows and artificial 0.01× speedups (naive executed in 4 ms on empty collections while PT paid overhead).
   - Historical records from 2026-10-05 and 2026-10-16 when `shopsphere_bench` had 50k products and 400k order items demonstrated genuine speedups (e.g., 9.67× to 22.96× on `rare_category_revenue_7d`).
   - Seeding `shopsphere_bench` using `node scripts/seedBench.js --products=50000 --items=400000 --orders=100000 --vendors=100 --categories=30 --users=20000 --reviews=100000 --drop` will instantly restore visible optimization gains.

---

## 3. Caveats

1. **Historical Records in `pt-log.jsonl`**: The file contains 63 records written with `naive_ms` and `reduced_ms`. Rewriting the file is unnecessary if `adminController.js` maps legacy properties (`standard_ms = r.standard_ms ?? r.naive_ms`).
2. **MongoDB Port**: The project requires `mongod` running on port 27018. `mongod` is verified active (PID 14016).
3. **Adaptive and Bloom Modes**: `pt-metrics` derives metrics from `kind === 'shadow'` records which measure exact-set reduction. Non-shadow records (`kind === 'order'`, `'summary'`) contain cap and adaptive sweeps; these should remain categorized under the "All records" filter.

---

## 4. Conclusion

1. **Backend Endpoints**:
   - `GET /api/admin/pt-log`, `GET /api/admin/pt-status`, and `GET /api/admin/pt-metrics` in `server/controllers/adminController.js` require dual-naming support (`standard`/`optimized` alongside `naive`/`reduced`).
   - `perSpecStats` in `getPtMetrics` should include `description` for each query specification.
2. **Execution Pipeline**:
   - `server/scripts/ptShadow.js` should write `standard` and `optimized` in `.pt-shadow-status.json` and in logged records alongside legacy keys.
3. **Frontend Display**:
   - `client/src/pages/PtLogPage.jsx` requires updating all text, chips, table headers, stat cards, tooltips, and bar charts from "Naive" to "Standard MongoDB" (or "Standard") and "Reduced" to "Optimized (mongo-pt)" (or "Optimized").
   - The query table cell should display the query calculation description.
4. **Dataset Scaling**:
   - `shopsphere_bench` needs to be re-seeded with 50,000 products and 400,000 order items (`node scripts/seedBench.js --products=50000 --items=400000 --orders=100000 --vendors=100 --categories=30 --users=20000 --reviews=100000 --drop`).

---

## 5. Verification Method

1. **Automated PT Tests**:
   ```powershell
   cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
   npm run test:pt
   ```
   *Expected*: All 12 test assertions pass (`pass 12, fail 0, skipped 0`). Verified working on port 27018.

2. **Endpoint JSON Verification**:
   ```powershell
   node -e "
   const { getPtStatus, getPtMetrics, getPtLog } = require('./server/controllers/adminController');
   const mock = (name) => ({ json: (d) => console.log(name, Object.keys(d)) });
   getPtStatus({}, mock('pt-status:'));
   getPtMetrics({}, mock('pt-metrics:'));
   getPtLog({}, { json: (d) => console.log('pt-log count:', d.length, 'keys:', Object.keys(d[0])) });
   "
   ```
   *Expected*: `pt-status` exposes `standard` and `optimized`; `pt-metrics` exposes `avgStandardMs`, `avgOptimizedMs`, `throughputStandard`, `throughputOptimized`, `perSpecStats`, and `timeline`; `pt-log` returns records containing `standard_ms` and `optimized_ms`.

3. **Database Population Check**:
   ```powershell
   cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
   npm run db:show
   ```
   *Expected*: `shopsphere_bench` displays 50k products, 400k order items, and >0 orders in last 7 days.
