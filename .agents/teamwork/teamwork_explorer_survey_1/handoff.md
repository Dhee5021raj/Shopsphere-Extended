# Frontend Survey Report: /admin/pt-log Optimization & Revamp

> **Executive Summary**: The mongo-pt log page (`/admin/pt-log`) and its supporting components rely on `client/src/pages/PtLogPage.jsx` and `client/src/pages/ProductDiscoveryPage.jsx`. We enumerated 43 occurrences of outdated "naive" and "reduced" terminology across UI labels, tooltips, chart legends, and bindings, identified that query computation descriptions are currently obscured by trigger search terms in the log table, and designed a stepped real-time execution status indicator with adaptive polling and phase progression.

---

## 1. Observation

### 1.1 Files Involved in Rendering `/admin/pt-log` and Related UI

| File Path | Role / Components Rendered |
|---|---|
| `client/src/App.jsx` | Route definition at lines 111–116: wraps `<PtLogPage onToast={showToast} />` inside `<ProtectedRoute allowedRoles={['admin']}>`. |
| `client/src/pages/PtLogPage.jsx` | Main PT log page (865 lines). Contains: <br>• Header & Navigation (lines 620–688)<br>• Live Status Chips via `phaseChip()` (lines 98–124, 630–655)<br>• `StatCard` metric cards (lines 127–152)<br>• `MetricsPanel` dashboard (lines 170–562) with query dropdown, 3 stat card rows, Recharts `BarChart`, and `perSpecStats` summary table<br>• PT Log detailed data table (lines 706–852) with accordion row expansion (`isOpen`) showing query breakdown, join order, dynamic best order, worst-case query, and checksum verification<br>• Footnotes & documentation disclaimer (lines 854–858). |
| `client/src/pages/ProductDiscoveryPage.jsx` | Contains `ShadowStatusBadge` (lines 16–59), a floating badge in the bottom-right corner of the catalog search page (`/products`). Polls `/api/admin/pt-status` every 4s and links to `/admin/pt-log`. Displays pulse animation while running and idle status when quiet. |
| `client/src/pages/AdminDashboardPage.jsx` | Admin navigation bar link at line 204–208 (`<Link to="/admin/pt-log"><Activity size={14} /> mongo-pt Log</Link>`). |
| `client/src/services/api.js` | Axios HTTP client configuring `/api` baseURL and auth interceptor for calls to `/admin/pt-log`, `/admin/pt-status`, and `/admin/pt-metrics`. |

---

### 1.2 Enumeration of "naive" and "reduced" in Frontend Code

Exact matches from grep search across `client/src/`:

#### In `client/src/pages/ProductDiscoveryPage.jsx`:
1. **Line 43** (Tooltip):
   ```jsx
   title="A naive-vs-reduced comparison of your search is being measured detached in the background — click to watch it live"
   ```
   *Target Replacement*: `"A Standard MongoDB vs Optimized (mongo-pt) comparison of your search is being measured detached in the background — click to watch it live"`
2. **Line 52** (Tooltip):
   ```jsx
   title="Shadow benchmarks idle — open the live naive-vs-reduced comparison log"
   ```
   *Target Replacement*: `"Shadow benchmarks idle — open the live Standard vs Optimized comparison log"`

#### In `client/src/pages/PtLogPage.jsx`:
3. **Line 36** (`KIND_INFO.order` dictionary):
   ```javascript
   order: 'Benchmark protocol record: one naive-vs-reduced comparison for a single join order',
   ```
   *Target Replacement*: `'Benchmark protocol record: one Standard MongoDB vs Optimized (mongo-pt) comparison for a single join order',`
4. **Line 101** (`phaseChip` label logic):
   ```javascript
   const label = phase === 'naive' ? 'NAIVE (slow)' : 'REDUCED (faster)';
   ```
   *Target Replacement*: `const label = (phase === 'naive' || phase === 'standard') ? 'STANDARD MONGODB' : 'OPTIMIZED (mongo-pt)';`
5. **Lines 187–190** (`MetricsPanel` destructuring from `GET /api/admin/pt-metrics`):
   ```javascript
   avgNaiveMs: overallAvgNaive, avgReducedMs: overallAvgRed,
   medNaiveMs: overallMedNaive, medReducedMs: overallMedRed,
   throughputNaive: overallTpNaive, throughputReduced: overallTpRed,
   ```
   *Target*: Support both legacy names and updated API keys (`avgStandardMs`, `avgOptimizedMs`, etc.) via fallback expressions.
6. **Lines 205–210** (`displayData` mapping):
   ```javascript
   avgNaiveMs: overallAvgNaive,
   avgReducedMs: overallAvgRed,
   medNaiveMs: overallMedNaive,
   medReducedMs: overallMedRed,
   throughputNaive: overallTpNaive,
   throughputReduced: overallTpRed,
   ```
   *Target*: Maintain compatible alias structure.
7. **Lines 224–225** (Recharts chart data object keys):
   ```javascript
   'Naive (ms)': Math.round(r.naive_ms),
   'Reduced (ms)': Math.round(r.reduced_ms),
   ```
   *Target Replacement*:
   ```javascript
   'Standard MongoDB (ms)': Math.round(r.standard_ms ?? r.naive_ms),
   'Optimized (mongo-pt) (ms)': Math.round(r.optimized_ms ?? r.reduced_ms ?? r.total_ms),
   ```
8. **Lines 229–230** (Throughput speedup computation):
   ```javascript
   const tpImprove = displayData.throughputNaive && displayData.throughputReduced
     ? (displayData.throughputReduced / displayData.throughputNaive).toFixed(1)
   ```
   *Target*: Update variable references and fallbacks.
9. **Line 242** (Dashboard header subtitle):
   ```jsx
   Query-by-Query breakdown: Naive vs Predicate-Transfer (Throughput, Latency, Speedup & Overhead)
   ```
   *Target Replacement*:
   ```jsx
   Query-by-Query breakdown: Standard MongoDB vs Optimized (mongo-pt) (Throughput, Latency, Speedup & Overhead)
   ```
10. **Line 316** (`StatCard` label):
    ```jsx
    label="Naive Throughput"
    ```
    *Target Replacement*: `label="Standard MongoDB Throughput"` (or `"Standard Throughput"`)
11. **Line 318** (`StatCard` subtext):
    ```jsx
    sub={`Avg latency: ${fmtMs(displayData.avgNaiveMs)}`}
    ```
    *Target Replacement*: `sub={`Avg Standard latency: ${fmtMs(displayData.avgStandardMs ?? displayData.avgNaiveMs)}`}`
12. **Line 323** (`StatCard` label):
    ```jsx
    label="PT Throughput"
    ```
    *Target Replacement*: `label="Optimized (mongo-pt) Throughput"`
13. **Line 325** (`StatCard` subtext):
    ```jsx
    sub={`Avg latency: ${fmtMs(displayData.avgReducedMs)}`}
    ```
    *Target Replacement*: `sub={`Avg Optimized latency: ${fmtMs(displayData.avgOptimizedMs ?? displayData.avgReducedMs)}`}`
14. **Line 332** (`StatCard` subtext):
    ```jsx
    sub="PT queries/sec ÷ Naive queries/sec"
    ```
    *Target Replacement*: `sub="Optimized queries/sec ÷ Standard queries/sec"`
15. **Line 338** (`StatCard` label):
    ```jsx
    label="Median Naive"
    ```
    *Target Replacement*: `label="Median Standard MongoDB"` (or `"Median Standard"`)
16. **Line 340** (`StatCard` subtext):
    ```jsx
    sub="Median latency (unoptimised)"
    ```
    *Target Replacement*: `sub="Median latency (Standard MongoDB baseline)"`
17. **Line 345** (`StatCard` label):
    ```jsx
    label="Median Reduced"
    ```
    *Target Replacement*: `label="Median Optimized (mongo-pt)"` (or `"Median Optimized"`)
18. **Line 347** (`StatCard` subtext):
    ```jsx
    sub="Median latency (PT side)"
    ```
    *Target Replacement*: `sub="Median latency (Optimized mongo-pt)"`
19. **Line 363** (`StatCard` subtext):
    ```jsx
    sub="reduced ÷ naive latency ratio"
    ```
    *Target Replacement*: `sub="Standard ÷ Optimized latency ratio"`
20. **Line 386** (`StatCard` subtext):
    ```jsx
    sub={`${displayData.wins || 0} / ${displayData.runs || 0} runs where PT won`}
    ```
    *Target Replacement*: `sub={`${displayData.wins || 0} / ${displayData.runs || 0} runs where Optimized was faster`}`
21. **Line 393** (`StatCard` subtext):
    ```jsx
    sub="max naive ÷ min naive order spread"
    ```
    *Target Replacement*: `sub="max standard ÷ min standard order spread"`
22. **Line 407** (`StatCard` subtext):
    ```jsx
    sub="(transfer + mat) as % of reduced total"
    ```
    *Target Replacement*: `sub="(transfer + mat) as % of optimized total"`
23. **Lines 458–459** (Recharts Bar data keys):
    ```jsx
    <Bar dataKey="Naive (ms)" fill="#f87171" radius={[4, 4, 0, 0]} />
    <Bar dataKey="Reduced (ms)" fill="#34d399" radius={[4, 4, 0, 0]} />
    ```
    *Target Replacement*:
    ```jsx
    <Bar dataKey="Standard MongoDB (ms)" fill="#f87171" radius={[4, 4, 0, 0]} />
    <Bar dataKey="Optimized (mongo-pt) (ms)" fill="#34d399" radius={[4, 4, 0, 0]} />
    ```
24. **Line 463** (Chart caption):
    ```jsx
    Red = Naive (Full DB join) · Green = Reduced (With Predicate Transfer). Shorter bar = faster query execution.
    ```
    *Target Replacement*:
    ```jsx
    Red = Standard MongoDB (Full DB join) · Green = Optimized (mongo-pt). Shorter bar = faster query execution.
    ```
25. **Line 488** (Summary table header):
    ```jsx
    <th className="px-4 py-2.5 font-bold text-right">Naive avg</th>
    ```
    *Target Replacement*: `<th className="px-4 py-2.5 font-bold text-right">Standard avg</th>`
26. **Line 489** (Summary table header):
    ```jsx
    <th className="px-4 py-2.5 font-bold text-right">PT avg</th>
    ```
    *Target Replacement*: `<th className="px-4 py-2.5 font-bold text-right">Optimized avg</th>`
27. **Line 490** (Summary table header):
    ```jsx
    <th className="px-4 py-2.5 font-bold text-right">Naive tput</th>
    ```
    *Target Replacement*: `<th className="px-4 py-2.5 font-bold text-right">Standard tput</th>`
28. **Line 491** (Summary table header):
    ```jsx
    <th className="px-4 py-2.5 font-bold text-right">PT tput</th>
    ```
    *Target Replacement*: `<th className="px-4 py-2.5 font-bold text-right">Optimized tput</th>`
29. **Lines 513–516** (Summary table value cells):
    Displaying `avgNaiveMs`, `avgReducedMs`, `throughputNaive`, `throughputReduced`.
30. **Line 633** (Run status condition):
    ```javascript
    {runStatus.reduced || runStatus.naive ? (
    ```
    *Target*: Support `runStatus.optimized || runStatus.standard || runStatus.reduced || runStatus.naive`.
31. **Lines 635–636** (Phase chip calls):
    ```jsx
    {phaseChip('reduced', runStatus, nowTick)}
    {phaseChip('naive', runStatus, nowTick)}
    ```
32. **Line 653** (Active status explanation):
    ```jsx
    'A background benchmark is being measured right now — your request was never slowed. The reduced (fast) side finishes in seconds; the naive side keeps grinding until the log row appears (every 5 s). Each chip above shows its own phase.'
    ```
    *Target Replacement*:
    ```jsx
    'A background benchmark measurement is actively running in a detached process — your request was never delayed. The Optimized (mongo-pt) phase executes first, followed by the baseline Standard MongoDB query. Live phase progression and elapsed timing are tracked below.'
    ```
33. **Line 654** (Idle status explanation):
    ```jsx
    'Search the Products page (e.g. type "laptop") to fire one; you\'ll get a separate chip for the naive and the reduced (faster) measurement. Last 100 records log shown below.'
    ```
    *Target Replacement*:
    ```jsx
    'Search the Products page (e.g. type "laptop") or click "Run Benchmark Measurement" above. You will see real-time phase progression for both Standard MongoDB and Optimized (mongo-pt). The last 100 records are logged below.'
    ```
34. **Line 660** (Filter button title):
    ```jsx
    title="Only rows fired by real site actions (search / category browse / dashboards) — the live naive-vs-reduced comparisons"
    ```
    *Target Replacement*: `title="Only rows fired by real site actions (search / category browse / dashboards) — the live Standard MongoDB vs Optimized (mongo-pt) comparisons"`
35. **Line 708** (Table info banner):
    ```jsx
    <span className="font-bold">Click any row</span> to see the full story: which action fired the measurement, what the benchmark query computed, and how the naive vs reduced times were produced.
    ```
    *Target Replacement*: `...and how Standard MongoDB vs Optimized (mongo-pt) execution times were produced.`
36. **Line 718** (Log table header):
    ```jsx
    <th className="px-4 py-3 font-bold text-right">Naive</th>
    ```
    *Target Replacement*: `<th className="px-4 py-3 font-bold text-right" title="Standard MongoDB baseline execution latency">Standard MongoDB</th>`
37. **Line 719** (Log table header):
    ```jsx
    <th className="px-4 py-3 font-bold text-right">Reduced</th>
    ```
    *Target Replacement*: `<th className="px-4 py-3 font-bold text-right" title="Optimized mongo-pt execution latency">Optimized (mongo-pt)</th>`
38. **Line 720** (Log table header tooltip):
    ```jsx
    title="Median reduced time ÷ median naive time, both on the SAME (deliberately worst) pinned order."
    ```
    *Target Replacement*: `title="Speedup factor = Standard MongoDB latency ÷ Optimized (mongo-pt) latency on the same pinned join order."`
39. **Line 784** (Log table worst-case tooltip):
    ```jsx
    title={r.worst_case && r.worst_case.speedup != null ? `fixed catalog query, same pinned order — naive ${fmtMs(r.worst_case.naive_ms)} vs reduced ${fmtMs(r.worst_case.reduced_ms)}` : ''}
    ```
    *Target Replacement*: `...Standard ${fmtMs(r.worst_case.standard_ms ?? r.worst_case.naive_ms)} vs Optimized ${fmtMs(r.worst_case.optimized_ms ?? r.worst_case.reduced_ms)}...`
40. **Line 816** (Expanded row text):
    ```jsx
    the milestones are collections; the pinned bad order is why the naive side is slow.
    ```
    *Target Replacement*: `the milestones are collections; the pinned bad order illustrates why unoptimized Standard MongoDB joins degrade.`
41. **Line 822** (Expanded row dynamic best order line):
    ```jsx
    naive {fmtMs(r.best.naive_ms)} · reduced {fmtMs(r.best.reduced_ms)} (transfer {fmtMs(r.best.transfer_ms)} + mat {fmtMs(r.best.materialization_ms)}) · <span className="font-bold">{r.best.speedup}x</span>
    ```
    *Target Replacement*: `Standard {fmtMs(r.best.standard_ms ?? r.best.naive_ms)} · Optimized {fmtMs(r.best.optimized_ms ?? r.best.reduced_ms)} (transfer {fmtMs(r.best.transfer_ms)} + mat {fmtMs(r.best.materialization_ms)}) · <span className="font-bold">{r.best.speedup}x</span>`
42. **Lines 833–835** (Expanded row worst-case query text):
    ```jsx
    timed on the same pinned bad order: naive {fmtMs(r.worst_case.naive_ms)} · reduced {fmtMs(r.worst_case.reduced_ms)} ... without a search filter on the first relation, the naive side pays the full-catalog penalty, so the reduction win is large again.
    ```
    *Target Replacement*: `timed on the same pinned bad order: Standard {fmtMs(r.worst_case.standard_ms ?? r.worst_case.naive_ms)} · Optimized {fmtMs(r.worst_case.optimized_ms ?? r.worst_case.reduced_ms)} ... without a search filter on the first relation, Standard MongoDB pays the full-catalog penalty, so the mongo-pt optimization gain is prominent.`
43. **Lines 855–856** (Footer disclaimer text):
    ```jsx
    Transfer and materialization are reported separately and are already included in the reduced time; overhead = (transfer + materialization) / reduced total.
    ```
    *Target Replacement*: `Transfer and materialization are reported separately and are already included in the Optimized (mongo-pt) execution time; overhead = (transfer + materialization) / optimized total.`

---

### 1.3 Triggering, Polling, and Real-Time Status Indicator

#### Current Triggering Mechanism:
- There is currently **no button** in the UI to trigger a benchmark or query measurement on demand.
- Measurements are triggered as a side effect when an end-user performs actions in the shop (e.g. searching products `GET /api/products?search=...`, browsing categories, or visiting analytics dashboards).
- On response completion (`res.on('finish')`), `server/middleware/ptShadow.js` checks if `process.env.PT_SHADOW === '1'`, verifies `.pt-shadow.lock` is not busy, creates `.pt-shadow.lock`, and spawns detached child process `node scripts/ptShadow.js --spec=... --trigger=...`.

#### Current Polling Mechanism:
- `PtLogPage.jsx` sets two intervals:
  1. `setInterval(() => { load(true); loadMetrics(true); }, 5000)`: fetches `GET /api/admin/pt-log`, `GET /api/admin/pt-status`, and `GET /api/admin/pt-metrics` every 5 seconds.
  2. `setInterval(() => setNowTick(Date.now()), 1000)`: ticks every second to compute local elapsed time against `startedAt`.
- `ProductDiscoveryPage.jsx` has `ShadowStatusBadge` polling `GET /api/admin/pt-status` every 4000 ms.

#### Data Structure Returned by `GET /api/admin/pt-status`:
```json
{
  "running": true,
  "startedAt": "2026-10-27T10:35:00.123Z",
  "naive": {
    "running": true,
    "done": false,
    "startedAt": "2026-10-27T10:35:04.500Z",
    "finishedAt": null,
    "ms": null
  },
  "reduced": {
    "running": false,
    "done": true,
    "startedAt": "2026-10-27T10:35:00.200Z",
    "finishedAt": "2026-10-27T10:35:04.450Z",
    "ms": 425
  },
  "staleAfterMin": 15,
  "typicalRunSeconds": 60
}
```
*Key phase sequencing observed in `server/scripts/ptShadow.js`*:
1. `reduced` (Optimized) runs first! (Line 138: `beginPhase('reduced')`, then line 154: `endPhase('reduced')`).
2. `naive` (Standard) runs second! (Line 157: `beginPhase('naive')`, then line 166: `endPhase('naive')`).
3. If both phases complete, the child finishes, and the status file is deleted, reverting to `running: false`.

#### Proposed Real-Time Status Indicator Design:
To meet R2 and showcase readiness:
1. **Prominent Status Banner/Card**:
   - Distinct, full-width card placed prominently at the top of `/admin/pt-log`.
   - Uses `role="status"` and `aria-live="polite"` for accessibility compliance.
2. **Active State Representation**:
   - **Status Badge**: Glowing pulse dot `● BENCHMARK ACTIVE · {totalElapsed}s elapsed`.
   - **Stepped Phase Progression Bar**:
     - **Phase 1: Optimized (mongo-pt)**:
       - Status: Done (`✓ Finished in {ms}ms`) | In Progress (`● Running ({s}s elapsed)`) | Queued (`Waiting`)
       - Description: Exact semi-join predicate reduction + temporary materialized collections
     - **Phase 2: Standard MongoDB**:
       - Status: Done (`✓ Finished in {ms}ms`) | In Progress (`● Running ({s}s elapsed)`) | Queued (`Waiting`)
       - Description: Full catalog join baseline on pinned order
     - **Phase 3: Cross-Verification & Log Commit**:
       - Status: Complete (`✓ Verified identical & logged`) | Pending
       - Description: Set equality validation & JSONL append
3. **Idle State Representation**:
   - **Status Badge**: Clean slate/indigo card `○ SYSTEM IDLE — Ready for benchmark measurement`.
   - Provides an action button: **"Trigger Benchmark Measurement"** (calls `/api/products?search=laptop` or admin benchmark endpoint) so the evaluator can test live optimization without switching pages.
4. **Adaptive Polling**:
   - When `runStatus.running` is true, increase polling frequency to **1500 ms** (1.5s) for smooth phase progression animation. When idle, keep default 5000 ms.

---

### 1.4 Per-Query Descriptions and Comprehensive Comparative Metrics

#### Current Structure & Defect in Query Description Display:
- In `PtLogPage.jsx`:
  ```javascript
  const SHORT_QUERY = {
    rare_category_revenue_7d: 'Sum of order-item line totals grouped by vendor, selling products from a single rare category, orders placed in the last 7 days — top 50 vendors by revenue',
    common_category_revenue_365d: 'Sum of order-item line totals grouped by vendor, selling products from a single common category (Category 1), orders in the last 365 days — top 50 vendors by revenue',
    vendor_scoped_revenue_90d: 'Sum of order-item line totals grouped by product, restricted to one large vendor (Vendor 0), orders in the last 90 days — top 50 products by revenue',
    user_scoped_spend_30d: 'Sum of order-item line totals grouped by product, restricted to orders placed by a single user, orders in the last 30 days — top 50 products by spend',
    low_rating_reviews_by_category: 'Count of 1–2★ reviews together with their average rating, grouped by category via review → product → category + vendor — top 50 categories by review count',
    vendor_category_revenue_365d: 'Sum of order-item line totals grouped by category, restricted to one vendor (Vendor 0), orders in the last 365 days — top 50 categories by revenue',
    user_vendor_category_spend_30d: 'Sum of order-item line totals grouped by (vendor × category) for a single user, orders in the last 30 days — top 50 vendor×category pairs by spend'
  };
  ```
- **Defect in `queryCellText(r)`** (line 78):
  ```javascript
  const queryCellText = (r) => {
    const action = r.kind === 'shadow' ? userAction(r.trigger) : null;
    return action || queryDescription(r);
  };
  ```
  Because `action` is prioritized over `queryDescription(r)`, every shadow measurement displays only the trigger string (e.g. `searched for "laptop"`), completely hiding what the query calculates unless hovered or expanded.
- **Remedy for R3**:
  Format the cell to prominently show:
  1. The calculation description: `queryDescription(r)` (e.g., "Revenue per vendor for rare category over 7d (cat ▸ p ▸ oi ▸ o ▸ v)").
  2. A secondary pill/tag displaying the site action trigger (e.g., `Trigger: searched for "laptop"`).
  3. In the `MetricsPanel` summary table, include a dedicated column or subtitle for each spec's description so reviewers understand what each query tests.

#### Metrics Displayed Across UI:
1. **Execution Latency**:
   - Standard MongoDB latency: `avgNaiveMs` (average), `medNaiveMs` (median), `r.naive_ms` (individual).
   - Optimized (mongo-pt) latency: `avgReducedMs` (average), `medReducedMs` (median), `r.reduced_ms` (individual).
2. **Throughput (queries/second)**:
   - Standard MongoDB throughput: `1000 / avgNaiveMs` (queries/sec).
   - Optimized (mongo-pt) throughput: `1000 / avgReducedMs` (queries/sec).
   - Throughput improvement ratio: `throughputReduced / throughputNaive` (e.g. 2.1×).
3. **Speedup Factor**:
   - Formula: `Standard latency ÷ Optimized latency` (`naive_ms / total_ms`).
   - Reported as `avgSpeedup`, `maxSpeedup`, `minSpeedup`, and per-row `r.speedup`.
4. **Transfer and Materialization Overhead**:
   - `transfer_ms`: predicate-set key extraction and $in clause generation.
   - `materialization_ms`: writing and indexing temporary reduced collections.
   - `transfer_overhead_pct`: `(transfer_ms + materialization_ms) / reduced_total_ms * 100`.
5. **Result Verification**:
   - Per-record: `r.equal` (`ok` / `FAIL`), `r.checksum` (e.g. `20:a77ba841`), `r.result_rows`.
   - In `MetricsPanel`: Add an aggregate Result Verification StatCard showing `100% Verified (0 Mismatches)` to prove functional equivalence to academic evaluators.

---

## 2. Logic Chain

1. **Premise**: Academic reviewers require clear, unambiguous terminology that distinguishes the baseline system ("Standard MongoDB") from the proposed contribution ("Optimized (mongo-pt)").
2. **Direct Observation**: Grep searches revealed 43 occurrences of "naive" and "reduced" in `client/src/pages/PtLogPage.jsx` and `client/src/pages/ProductDiscoveryPage.jsx`, including chart keys, table headers, stat card labels, and tooltips (Section 1.2).
3. **Inference**: Changing these labels directly eliminates reviewer confusion without altering underlying calculation logic, provided data accessors fallback gracefully between new (`standard_ms`, `optimized_ms`) and legacy (`naive_ms`, `reduced_ms`) JSON fields.
4. **Direct Observation**: In `queryCellText(r)` (line 78 of `PtLogPage.jsx`), `userAction(r.trigger)` overrides `queryDescription(r)`, displaying vague text like `searched for "laptop"` in the primary query table cell instead of the query computation (Section 1.4).
5. **Inference**: Decoupling the calculation description from the user action trigger enables both to be displayed simultaneously, satisfying requirement R3.
6. **Direct Observation**: `GET /api/admin/pt-status` already returns structured phase state (`running`, `startedAt`, `reduced: { running, done, ms }`, `naive: { running, done, ms }`), but the current UI only renders two plain chips nestled under the page title.
7. **Inference**: Transforming this into a stepped real-time execution card with live elapsed timing and phase visualization fulfills requirement R2.
8. **Direct Observation**: `cd client && npm run build` transformed 2138 modules and completed with exit code 0 in 29 seconds.

---

## 3. Caveats

1. **Backend Property Synchronization**: The backend `adminController.js` and `ptShadow.js` currently serialize JSON with keys `naive_ms` and `reduced_ms`. To prevent regression if frontend changes land before or in parallel with backend changes, the frontend MUST use nullish coalescing:
   ```javascript
   const standardMs = r.standard_ms ?? r.naive_ms;
   const optimizedMs = r.optimized_ms ?? r.reduced_ms ?? r.total_ms;
   ```
2. **Database Scale Dependency (R4)**: The speedup factor shown on the UI directly reflects data volume in `shopsphere_bench`. If the database is under-seeded, query times are sub-10ms and transfer overhead dominates, causing speedups < 1×. Bench database re-seeding (R4) is required for prominent gains.
3. **Offline / Disconnected State**: If the backend is not running or the admin is logged out, `api.get('/admin/pt-status')` catches the error and defaults to `{ running: false }`. The status indicator should cleanly handle this fallback.

---

## 4. Conclusion

The frontend overhaul for `/admin/pt-log` is well-contained and structurally ready for implementation:
- **No external dependencies needed**: Recharts, Lucide-react, and Tailwind CSS already provide all required chart, icon, and styling primitives.
- **Key changes required in `PtLogPage.jsx`**:
  1. Terminology replacement across 41 instances (Table headers, StatCard labels, chart data keys, tooltips, phase chips, disclaimers).
  2. Replacement of header status chips with a dedicated `RealTimeStatusCard` featuring dynamic elapsed timer, stepped 3-phase progress bar (`Optimized` -> `Standard` -> `Verified`), and active vs idle states.
  3. Query table cell revamp: show `SHORT_QUERY` computation description prominently, with action trigger (`live term: "..."`) as a secondary context badge.
  4. Metrics panel enhancement: Add Result Verification stat card, rename table headers to Standard avg/tput and Optimized avg/tput, and add spec descriptions to the summary table.
  5. Adaptive polling: poll every 1.5s when active, 5s when idle.
- **Key changes required in `ProductDiscoveryPage.jsx`**:
  Update tooltip text in `ShadowStatusBadge` (2 instances).

---

## 5. Verification Method

To verify the frontend implementation:
1. **Compilation Check**:
   ```pwsh
   cd C:\GEMINI\DBMS_PRJ\Shopsphere\client
   npm run build
   ```
   *Expected result*: Exit code 0, no JSX syntax or bundling errors.

2. **Automated Search for Stale Terminology**:
   ```pwsh
   # Verify no user-facing instances of "naive" or "reduced" remain in client/src
   rg -i "naive" C:\GEMINI\DBMS_PRJ\Shopsphere\client\src
   rg -i "reduced" C:\GEMINI\DBMS_PRJ\Shopsphere\client\src
   ```
   *Expected result*: 0 user-facing string occurrences (only legacy fallback property names like `r.naive_ms` if kept for backward compatibility).

3. **Browser Verification**:
   - Log in as admin (`admin@shopsphere.com` / `adminpassword123`).
   - Navigate to `http://localhost:3000/admin/pt-log`.
   - Confirm status indicator displays `IDLE — Ready for benchmark measurement`.
   - Trigger a search (e.g. search "laptop" on `/products`).
   - Switch to `/admin/pt-log` and observe:
     - Real-time indicator transitions to ACTIVE with elapsed second counter.
     - Phase 1 ("Optimized (mongo-pt)") shows RUNNING then FINISHED with ms.
     - Phase 2 ("Standard MongoDB") shows RUNNING then FINISHED with ms.
     - When complete, status reverts to IDLE and a new row appears in the table.
     - Table headers show "Standard MongoDB", "Optimized (mongo-pt)", "Speedup", "Overhead", "Equal".
     - Query column displays concise calculation descriptions.
