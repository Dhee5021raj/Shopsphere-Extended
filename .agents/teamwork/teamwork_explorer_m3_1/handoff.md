# Handoff Report: Frontend Terminology Update (Milestone 3 Explorer 1)

**Explorer**: Milestone 3 Explorer 1 (Frontend Terminology Explorer)  
**Parent Conversation ID**: `3db740df-a683-42d2-bd42-2a3faa75405e`  
**Working Directory**: `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_1`  
**Target Files**:
- `client/src/pages/PtLogPage.jsx`
- `client/src/pages/ProductDiscoveryPage.jsx`

**Associated Artifacts**:
- `analysis.md`: Exhaustive 37-point catalog and mapping matrix
- `proposed_PtLogPage_terminology.patch`: Concrete unified diff for `PtLogPage.jsx`
- `proposed_ProductDiscoveryPage_terminology.patch`: Concrete unified diff for `ProductDiscoveryPage.jsx`

---

## 1. Observation

A full codebase grep across `client/src/` using `grep_search` confirmed that occurrences of `"naive"` and `"reduced"` are strictly localized to two files:
1. `client/src/pages/PtLogPage.jsx` (35 occurrences)
2. `client/src/pages/ProductDiscoveryPage.jsx` (2 occurrences)

Directly observed verbatim lines include:

1. **Table Headers and Column Labels**:
   - `client/src/pages/PtLogPage.jsx:488-491`:
     ```jsx
     <th className="px-4 py-2.5 font-bold text-right">Naive avg</th>
     <th className="px-4 py-2.5 font-bold text-right">PT avg</th>
     <th className="px-4 py-2.5 font-bold text-right">Naive tput</th>
     <th className="px-4 py-2.5 font-bold text-right">PT tput</th>
     ```
   - `client/src/pages/PtLogPage.jsx:718-720`:
     ```jsx
     <th className="px-4 py-3 font-bold text-right">Naive</th>
     <th className="px-4 py-3 font-bold text-right">Reduced</th>
     <th className="px-4 py-3 font-bold text-right" title="Median reduced time ÷ median naive time, both on the SAME (deliberately worst) pinned order.">Speedup</th>
     ```

2. **Stat Cards and Dashboard Text**:
   - `client/src/pages/PtLogPage.jsx:242`:
     ```jsx
     Query-by-Query breakdown: Naive vs Predicate-Transfer (Throughput, Latency, Speedup & Overhead)
     ```
   - `client/src/pages/PtLogPage.jsx:316-325`:
     ```jsx
     <StatCard icon={Zap} label="Naive Throughput" value={fmtThroughput(displayData.throughputNaive)} sub={`Avg latency: ${fmtMs(displayData.avgNaiveMs)}`} color="rose" />
     <StatCard icon={Zap} label="PT Throughput" value={fmtThroughput(displayData.throughputReduced)} sub={`Avg latency: ${fmtMs(displayData.avgReducedMs)}`} color="emerald" />
     ```
   - `client/src/pages/PtLogPage.jsx:332`: `sub="PT queries/sec ÷ Naive queries/sec"`
   - `client/src/pages/PtLogPage.jsx:338-346`: `label="Median Naive"` and `label="Median Reduced"`
   - `client/src/pages/PtLogPage.jsx:363`: `sub="reduced ÷ naive latency ratio"`
   - `client/src/pages/PtLogPage.jsx:393`: `sub="max naive ÷ min naive order spread"`
   - `client/src/pages/PtLogPage.jsx:407`: `sub="(transfer + mat) as % of reduced total"`

3. **Status Chips & Live Running Indicator**:
   - `client/src/pages/PtLogPage.jsx:101`:
     ```javascript
     const label = phase === 'naive' ? 'NAIVE (slow)' : 'REDUCED (faster)';
     ```
   - `client/src/pages/PtLogPage.jsx:633-636`:
     ```jsx
     {runStatus.reduced || runStatus.naive ? (
       <>
         {phaseChip('reduced', runStatus, nowTick)}
         {phaseChip('naive', runStatus, nowTick)}
       </>
     )
     ```
   - `client/src/pages/PtLogPage.jsx:653-654`:
     ```javascript
     ? 'A background benchmark is being measured right now — your request was never slowed. The reduced (fast) side finishes in seconds; the naive side keeps grinding until the log row appears (every 5 s). Each chip above shows its own phase.'
     : 'Search the Products page (e.g. type "laptop") to fire one; you\'ll get a separate chip for the naive and the reduced (faster) measurement. Last 100 records log shown below.'
     ```

4. **Recharts Latency Chart**:
   - `client/src/pages/PtLogPage.jsx:224-225`:
     ```javascript
     'Naive (ms)': Math.round(r.naive_ms),
     'Reduced (ms)': Math.round(r.reduced_ms),
     ```
   - `client/src/pages/PtLogPage.jsx:458-463`:
     ```jsx
     <Bar dataKey="Naive (ms)" fill="#f87171" radius={[4, 4, 0, 0]} />
     <Bar dataKey="Reduced (ms)" fill="#34d399" radius={[4, 4, 0, 0]} />
     ...
     Red = Naive (Full DB join) · Green = Reduced (With Predicate Transfer). Shorter bar = faster query execution.
     ```

5. **Tooltips, Accordion Detail Drawer & Badges**:
   - `client/src/pages/PtLogPage.jsx:36`: `order: 'Benchmark protocol record: one naive-vs-reduced comparison for a single join order'`
   - `client/src/pages/PtLogPage.jsx:660`: `title="Only rows fired by real site actions (search / category browse / dashboards) — the live naive-vs-reduced comparisons"`
   - `client/src/pages/PtLogPage.jsx:708`: `<span className="font-bold">Click any row</span> to see the full story: which action fired the measurement, what the benchmark query computed, and how the naive vs reduced times were produced.`
   - `client/src/pages/PtLogPage.jsx:784`: `title={r.worst_case && r.worst_case.speedup != null ? 'fixed catalog query, same pinned order — naive ${fmtMs(r.worst_case.naive_ms)} vs reduced ${fmtMs(r.worst_case.reduced_ms)}' : ''}`
   - `client/src/pages/PtLogPage.jsx:816`: `the pinned bad order is why the naive side is slow.`
   - `client/src/pages/PtLogPage.jsx:822`: `naive {fmtMs(r.best.naive_ms)} · reduced {fmtMs(r.best.reduced_ms)} ...`
   - `client/src/pages/PtLogPage.jsx:833-835`: `naive {fmtMs(r.worst_case.naive_ms)} · reduced {fmtMs(r.worst_case.reduced_ms)} ... naive side pays the full-catalog penalty, so the reduction win is large again.`
   - `client/src/pages/PtLogPage.jsx:855-856`: `already included in the reduced time; overhead = (transfer + materialization) / reduced total.`
   - `client/src/pages/ProductDiscoveryPage.jsx:43`: `title="A naive-vs-reduced comparison of your search is being measured detached in the background — click to watch it live"`
   - `client/src/pages/ProductDiscoveryPage.jsx:52`: `title="Shadow benchmarks idle — open the live naive-vs-reduced comparison log"`

6. **Backend Contract Verification**:
   - `server/controllers/adminController.js:112-147`: `mapLogRecord` maps `standard_ms`, `optimized_ms`, `naive_ms`, `reduced_ms`.
   - `server/controllers/adminController.js:187-232`: `getPtStatus` exposes both `standard`/`optimized` and `naive`/`reduced` phase objects.
   - `server/controllers/adminController.js:308-468`: `getPtMetrics` returns `avgStandardMs`, `avgOptimizedMs`, `throughputStandard`, `throughputOptimized`, plus aliases `avgNaiveMs`, `avgReducedMs`, `throughputNaive`, `throughputReduced`.

---

## 2. Logic Chain

1. **Direct Translation Requirement (R1)**:
   - *Premise*: R1 requires replacing "naive" with "Standard MongoDB" (or "Standard") and "reduced" with "Optimized (mongo-pt)" (or "Optimized") across headers, cards, tooltips, chips, and charts.
   - *Inference*: Full-length academic terminology should be prioritized in major headers (`<th>Standard MongoDB</th>`, `<th>Optimized (mongo-pt)</th>`), chart legends (`Standard MongoDB (ms)`, `Optimized (mongo-pt) (ms)`), and banner text. Concise labels (`Standard avg`, `Optimized avg`, `Standard tput`, `Optimized tput`, `Standard Throughput`, `Optimized Throughput`) should be used in stat cards and summary tables to maintain clean layout without horizontal truncation.

2. **Backend Dual-Key Compatibility**:
   - *Premise*: Backend Milestone 2 emits dual keys for status, metrics, and logs.
   - *Inference*: Frontend access must use nullish coalescing (`r.standard_ms ?? r.naive_ms`, `r.optimized_ms ?? r.reduced_ms ?? r.total_ms`). This guarantees that whether the backend is running M2, M1, or future M4 code, values always render accurately without runtime crashes or `NaN`.

3. **Status Chip Phase Execution Realignment**:
   - *Premise*: `ptShadow.js:156-184` executes the Optimized semi-join reduction first, and then executes the Standard MongoDB baseline left-deep query.
   - *Inference*: The UI chips must render in execution sequence: `phaseChip('optimized')` followed by `phaseChip('standard')`.
   - *Labeling*: Status chip labels are updated from `NAIVE (slow)` and `REDUCED (faster)` to `STANDARD MONGODB` and `OPTIMIZED (mongo-pt)` (with status state: `RUNNING · N s`, `FINISHED · N ms`, or `QUEUED`).

4. **Speedup Formula Clarification**:
   - *Premise*: The existing card subtitle at line 363 states `"reduced ÷ naive latency ratio"`. In database optimization, speedup is mathematically $\text{Latency}_{\text{Standard}} / \text{Latency}_{\text{Optimized}}$.
   - *Inference*: Updating the subtext to `"Standard ÷ Optimized latency ratio"` corrects the descriptive explanation for academic evaluators while matching the actual calculation `s.naive_ms / s.reduced_ms` (which is $>1\times$ when Optimized wins).

5. **Recharts Synchronization**:
   - *Premise*: Recharts `<Bar>` components bind data keys directly to `chartData` properties.
   - *Inference*: Updating both `chartData` keys and `<Bar dataKey="...">` to `'Standard MongoDB (ms)'` and `'Optimized (mongo-pt) (ms)'` updates the visual chart bars, tooltip hover text, and legend keys in a single coherent operation without requiring custom tooltip formatters.

---

## 3. Caveats

1. **Worker Scope Separation**:
   - This investigation produced concrete patches (`proposed_PtLogPage_terminology.patch` and `proposed_ProductDiscoveryPage_terminology.patch`). Because Explorer agents are strictly read-only, these patches are staged for the Worker to apply and verify.
2. **Dynamic Live Search Specs**:
   - Dynamic searches generate dynamic spec names (`live_search_<term>`). The terminology replacement safely applies to all rows regardless of whether they are canonical catalog specs or dynamic search queries.
3. **No Other Files Affected**:
   - A global grep confirmed no other frontend files (`AdminDashboardPage.jsx`, `App.jsx`, `components/`) reference "naive" or "reduced".

---

## 4. Conclusion

1. **Total Replacements Identified**: Exactly 37 locations across 2 files (35 in `PtLogPage.jsx`, 2 in `ProductDiscoveryPage.jsx`).
2. **Target Mappings**:
   - Primary Headers: `"Standard MongoDB"` & `"Optimized (mongo-pt)"`
   - Compact Metric Columns & Cards: `"Standard avg"`, `"Optimized avg"`, `"Standard tput"`, `"Optimized tput"`, `"Standard Throughput"`, `"Optimized Throughput"`
   - Chart Bars & Legends: `"Standard MongoDB (ms)"` & `"Optimized (mongo-pt) (ms)"`
   - Status Chips: `"STANDARD MONGODB"` & `"OPTIMIZED (mongo-pt)"`
   - Explanations & Tooltips: `"Standard MongoDB"` and `"Optimized (mongo-pt)"`
3. **Ready for Worker Implementation**: Complete patch files and mapping specifications are saved in this working directory.

---

## 5. Verification Method

To independently verify the implementation and terminology alignment:

1. **Verify Frontend Build & Bundle**:
   ```pwsh
   cd C:\GEMINI\DBMS_PRJ\Shopsphere\client
   npm run build
   ```
   *Expected*: Build completes with exit code 0 (`✓ built in ...`).

2. **Verify Zero Remaining Deprecated Occurrences**:
   ```pwsh
   cd C:\GEMINI\DBMS_PRJ\Shopsphere
   git grep -in "naive" client/src/
   git grep -in "reduced" client/src/
   ```
   *Expected*: Zero occurrences in user-facing UI labels, headers, cards, or tooltips.

3. **Verify E2E Terminology & Status Suite**:
   ```pwsh
   cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
   node --test tests/e2e_pt_revamp.test.js
   ```
   *Expected*: Tier 1 Terminology (T1.1.1 - T1.1.4) and Tier 3 Parity tests (T3.1, T3.2) pass with 100% success rate.
