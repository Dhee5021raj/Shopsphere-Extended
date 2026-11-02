# Frontend Terminology Catalog and Replacement Analysis

**Explorer**: Milestone 3 Explorer 1 (Frontend Terminology Explorer)  
**Parent Conversation ID**: `3db740df-a683-42d2-bd42-2a3faa75405e`  
**Working Directory**: `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m3_1`  
**Target Files**:
- `client/src/pages/PtLogPage.jsx`
- `client/src/pages/ProductDiscoveryPage.jsx`

---

## 1. Executive Summary

Requirement **R1 (Terminology Update)** mandates eliminating academic reviewer confusion by replacing the legacy baseline query terminology `"naive"` with **"Standard MongoDB"** (or `"Standard"`) and the novel semi-join reduction terminology `"reduced"` with **"Optimized (mongo-pt)"** (or `"Optimized"`).

This audit catalogs **35 distinct code locations** across `client/src/pages/PtLogPage.jsx` and `client/src/pages/ProductDiscoveryPage.jsx`. No other frontend files contain occurrences of `"naive"` or `"reduced"`.

The analysis establishes:
1. **Zero Breaking Changes**: Every property access is mapped using nullish coalescing (e.g. `r.standard_ms ?? r.naive_ms`) to ensure seamless dual-compatibility with both updated and legacy backend responses.
2. **Clear UI Scoping**: Long-form labels (`Standard MongoDB`, `Optimized (mongo-pt)`) are applied to primary table headers, chart legends, and descriptive banners. Short-form labels (`Standard`, `Optimized`) are applied in space-constrained table sub-headers (`Standard avg`, `Optimized avg`, `Standard tput`, `Optimized tput`) and stat card titles.
3. **Harmonious Integration**: Synchronized with Explorer 2 (Real-Time Status Card) and Explorer 3 (Query Descriptions & Comprehensive Metrics).

---

## 2. Complete File-by-File Catalog of "naive" and "reduced"

### A. `client/src/pages/PtLogPage.jsx`

| # | Line(s) | Category | Current Text / Code | Proposed Replacement | User-Facing Display |
|---|---|---|---|---|---|
| 1 | 36 | Metadata Dictionary | `order: 'Benchmark protocol record: one naive-vs-reduced comparison for a single join order'` | `order: 'Benchmark protocol record: one Standard MongoDB vs Optimized (mongo-pt) comparison for a single join order'` | Tooltip on `order` kind badges |
| 2 | 101 | Helper / Status Chip | `const label = phase === 'naive' ? 'NAIVE (slow)' : 'REDUCED (faster)';` | `const isBaseline = phase === 'standard' \|\| phase === 'naive'; const label = isBaseline ? 'STANDARD MONGODB' : 'OPTIMIZED (mongo-pt)';` | Stepped Status Chip label |
| 3 | 104 | Helper / Status Chip | `title={`${label} side finished`}` | Retains updated `${label}` | Status Chip tooltip on completion |
| 4 | 113 | Helper / Status Chip | `title={`${label} side currently being measured`}` | Retains updated `${label}` | Status Chip tooltip during active execution |
| 5 | 147 | StatCard Good Tag | `{good ? '▲ PT wins here' : '▼ Overhead dominates'}` | `{good ? '▲ Optimized wins here' : '▼ Overhead dominates'}` | Metric card conditional performance tag |
| 6 | 187-190 | Data Extraction | Destructuring `avgNaiveMs`, `avgReducedMs`, `medNaiveMs`, `medReducedMs`, `throughputNaive`, `throughputReduced` | Extract `avgStandardMs`, `avgOptimizedMs`, `medStandardMs`, `medOptimizedMs`, `throughputStandard`, `throughputOptimized` with fallback to legacy aliases | Internal component state |
| 7 | 205-210 | displayData Object | Mapping `avgNaiveMs`, `avgReducedMs`, `medNaiveMs`, `medReducedMs`, `throughputNaive`, `throughputReduced` | Map dual keys: `avgStandardMs: overallAvgStd, avgOptimizedMs: overallAvgOpt, throughputStandard: overallTpStd, throughputOptimized: overallTpOpt` + aliases | Dashboard data binding |
| 8 | 224-225 | Chart Transformation | `'Naive (ms)': Math.round(r.naive_ms), 'Reduced (ms)': Math.round(r.reduced_ms)` | `'Standard MongoDB (ms)': Math.round(r.standard_ms ?? r.naive_ms ?? 0), 'Optimized (mongo-pt) (ms)': Math.round(r.optimized_ms ?? r.reduced_ms ?? r.total_ms ?? 0)` | Recharts bar dataKeys & tooltips |
| 9 | 229-231 | Metric Calculation | `tpImprove = displayData.throughputReduced / displayData.throughputNaive` | `tpStd = displayData.throughputStandard ?? displayData.throughputNaive; tpOpt = displayData.throughputOptimized ?? displayData.throughputReduced; tpImprove = tpOpt / tpStd` | Throughput gain multiplier ($X\times$) |
| 10 | 242 | Header Subtitle | `Query-by-Query breakdown: Naive vs Predicate-Transfer (Throughput, Latency, Speedup & Overhead)` | `Query-by-Query breakdown: Standard MongoDB vs Optimized (mongo-pt) (Throughput, Latency, Speedup & Overhead)` | Dashboard header subtitle |
| 11 | 316-318 | StatCard 1 | `label="Naive Throughput"` `value={fmtThroughput(displayData.throughputNaive)}` `sub={'Avg latency: ${fmtMs(displayData.avgNaiveMs)}'}` | `label="Standard Throughput"` `value={fmtThroughput(displayData.throughputStandard ?? displayData.throughputNaive)}` `sub={'Avg latency: ${fmtMs(displayData.avgStandardMs ?? displayData.avgNaiveMs)}'}` | Baseline Throughput Card |
| 12 | 323-325 | StatCard 2 | `label="PT Throughput"` `value={fmtThroughput(displayData.throughputReduced)}` `sub={'Avg latency: ${fmtMs(displayData.avgReducedMs)}'}` | `label="Optimized Throughput"` `value={fmtThroughput(displayData.throughputOptimized ?? displayData.throughputReduced)}` `sub={'Avg latency: ${fmtMs(displayData.avgOptimizedMs ?? displayData.avgReducedMs)}'}` | Optimized Throughput Card |
| 13 | 332 | StatCard 3 Subtext | `sub="PT queries/sec ÷ Naive queries/sec"` | `sub="Optimized queries/sec ÷ Standard queries/sec"` | Throughput gain calculation description |
| 14 | 338-340 | StatCard 4 | `label="Median Naive"` `value={fmtMs(displayData.medNaiveMs)}` `sub="Median latency (unoptimised)"` | `label="Median Standard"` `value={fmtMs(displayData.medStandardMs ?? displayData.medNaiveMs)}` `sub="Median latency (Standard MongoDB)"` | Median Baseline Latency Card |
| 15 | 345-347 | StatCard 5 | `label="Median Reduced"` `value={fmtMs(displayData.medReducedMs)}` `sub="Median latency (PT side)"` | `label="Median Optimized"` `value={fmtMs(displayData.medOptimizedMs ?? displayData.medReducedMs)}` `sub="Median latency (Optimized mongo-pt)"` | Median Optimized Latency Card |
| 16 | 363 | StatCard Speedup Sub | `sub="reduced ÷ naive latency ratio"` | `sub="Standard ÷ Optimized latency ratio"` | Speedup formula note (corrected direction) |
| 17 | 385 | StatCard Win Rate Sub | `sub={`${displayData.wins \|\| 0} / ${displayData.runs \|\| 0} runs where PT won`}` | `sub={`${displayData.wins \|\| 0} / ${displayData.runs \|\| 0} runs where Optimized won`}` | Win rate runs fraction |
| 18 | 393 | StatCard Robustness Sub| `sub="max naive ÷ min naive order spread"` | `sub="max standard ÷ min standard order spread"` | Join order sensitivity explanation |
| 19 | 407 | StatCard Overhead Sub | `sub="(transfer + mat) as % of reduced total"` | `sub="(transfer + mat) as % of Optimized total"` | Semi-join transfer/materialization cost |
| 20 | 458-459 | Recharts Bars | `<Bar dataKey="Naive (ms)" fill="#f87171" ... /> <Bar dataKey="Reduced (ms)" fill="#34d399" ... />` | `<Bar dataKey="Standard MongoDB (ms)" fill="#f87171" ... /> <Bar dataKey="Optimized (mongo-pt) (ms)" fill="#34d399" ... />` | Chart legend and bar keys |
| 21 | 463 | Chart Caption | `Red = Naive (Full DB join) · Green = Reduced (With Predicate Transfer). Shorter bar = faster query execution.` | `Red = Standard MongoDB (Full DB join) · Green = Optimized (mongo-pt with Predicate Transfer). Shorter bar = faster query execution.` | Explanatory caption beneath timeline |
| 22 | 488-491 | Summary Table Headers | `<th ...>Naive avg</th> <th ...>PT avg</th> <th ...>Naive tput</th> <th ...>PT tput</th>` | `<th ...>Standard avg</th> <th ...>Optimized avg</th> <th ...>Standard tput</th> <th ...>Optimized tput</th>` | Per-spec breakdown column headers |
| 23 | 513-516 | Summary Table Cells | `{fmtMs(s.avgNaiveMs)}` `{fmtMs(s.avgReducedMs)}` `{fmtThroughput(s.throughputNaive)}` `{fmtThroughput(s.throughputReduced)}` | `{fmtMs(s.avgStandardMs ?? s.avgNaiveMs)}` `{fmtMs(s.avgOptimizedMs ?? s.avgReducedMs)}` `{fmtThroughput(s.throughputStandard ?? s.throughputNaive)}` `{fmtThroughput(s.throughputOptimized ?? s.throughputReduced)}` | Per-spec breakdown values |
| 24 | 633-636 | Header Chip Rendering | `{runStatus.reduced \|\| runStatus.naive ? (<>{phaseChip('reduced', ...)}{phaseChip('naive', ...)}</>)}` | `{(runStatus.optimized \|\| runStatus.reduced \|\| runStatus.standard \|\| runStatus.naive) ? (<>{phaseChip('optimized', ...)}{phaseChip('standard', ...)}</>)}` | Live execution indicator chips (Optimized first) |
| 25 | 653 | Live Header Note Running | `'... The reduced (fast) side finishes in seconds; the naive side keeps grinding until the log row appears ...'` | `'... The Optimized (mongo-pt) side finishes in seconds; the Standard MongoDB side keeps executing until the log row appears ...'` | Real-time measurement explanation |
| 26 | 654 | Live Header Note Idle | `'... you\'ll get a separate chip for the naive and the reduced (faster) measurement ...'` | `'... you\'ll get a separate chip for the Standard MongoDB and Optimized (mongo-pt) measurement ...'` | Search trigger call-to-action note |
| 27 | 660 | Live Filter Button Title | `title="Only rows fired by real site actions ... — the live naive-vs-reduced comparisons"` | `title="Only rows fired by real site actions ... — the live Standard MongoDB vs Optimized (mongo-pt) comparisons"` | Tooltip on "Live comparisons" pill |
| 28 | 708 | Log Table Banner | `... what the benchmark query computed, and how the naive vs reduced times were produced.` | `... what the benchmark query computed, and how the Standard MongoDB vs Optimized (mongo-pt) times were produced.` | Instruction banner above log table |
| 29 | 718-720 | Main Log Table Headers | `<th ...>Naive</th> <th ...>Reduced</th> <th ... title="Median reduced time ÷ median naive time...">Speedup</th>` | `<th ... title="Standard MongoDB baseline execution latency">Standard MongoDB</th> <th ... title="Optimized (mongo-pt) semi-join reduction latency">Optimized (mongo-pt)</th> <th ... title="Standard MongoDB latency ÷ Optimized (mongo-pt) latency...">Speedup</th>` | Main log table column headers |
| 30 | 777-778 | Main Log Table Cells | `{fmtMs(r.naive_ms)}` `{fmtMs(r.reduced_ms ?? r.total_ms)}` | `{fmtMs(r.standard_ms ?? r.naive_ms)}` `{fmtMs(r.optimized_ms ?? r.reduced_ms ?? r.total_ms)}` | Main log table timing cells |
| 31 | 784 | Worst-Case Tooltip | `title={... ? 'fixed catalog query, same pinned order — naive ${fmtMs(r.worst_case.naive_ms)} vs reduced ${fmtMs(r.worst_case.reduced_ms)}' : ''}` | `title={... ? 'fixed catalog query, same pinned order — Standard MongoDB ${fmtMs(r.worst_case.standard_ms ?? r.worst_case.naive_ms)} vs Optimized ${fmtMs(r.worst_case.optimized_ms ?? r.worst_case.reduced_ms)}' : ''}` | Tooltip on worst-case column |
| 32 | 816 | Accordion Join Order | `... the pinned bad order is why the naive side is slow.` | `... the pinned bad order is why the Standard MongoDB baseline is slow.` | Accordion explanation of pinned join order |
| 33 | 822 | Accordion Best Order | `naive {fmtMs(r.best.naive_ms)} · reduced {fmtMs(r.best.reduced_ms)} ...` | `Standard {fmtMs(r.best.standard_ms ?? r.best.naive_ms)} · Optimized {fmtMs(r.best.optimized_ms ?? r.best.reduced_ms)} ...` | Dynamic best order comparison line |
| 34 | 833, 835 | Accordion Worst Case | `naive {fmtMs(r.worst_case.naive_ms)} · reduced {fmtMs(r.worst_case.reduced_ms)} ... naive side pays the full-catalog penalty, so the reduction win is large again.` | `Standard {fmtMs(r.worst_case.standard_ms ?? r.worst_case.naive_ms)} · Optimized {fmtMs(r.worst_case.optimized_ms ?? r.worst_case.reduced_ms)} ... Standard MongoDB baseline pays the full-catalog penalty, so the Optimized (mongo-pt) reduction win is large again.` | Worst-case spec explanation line |
| 35 | 855-856 | Page Footer Note | `... already included in the reduced time; overhead = (transfer + materialization) / reduced total.` | `... already included in the Optimized (mongo-pt) time; overhead = (transfer + materialization) / Optimized total.` | Technical methodology footer |

---

### B. `client/src/pages/ProductDiscoveryPage.jsx`

| # | Line | Category | Current Text | Proposed Replacement | User-Facing Display |
|---|---|---|---|---|---|
| 36 | 43 | Shadow Badge Running | `title="A naive-vs-reduced comparison of your search is being measured detached in the background — click to watch it live"` | `title="A Standard MongoDB vs Optimized (mongo-pt) comparison of your search is being measured detached in the background — click to watch it live"` | Floating badge hover tooltip during shadow query run |
| 37 | 52 | Shadow Badge Idle | `title="Shadow benchmarks idle — open the live naive-vs-reduced comparison log"` | `title="Shadow benchmarks idle — open the live Standard MongoDB vs Optimized (mongo-pt) comparison log"` | Floating badge hover tooltip when shadow query is idle |

---

## 3. Dual-Terminology Backend Compatibility Matrix

Backend Milestone 2 (`server/controllers/adminController.js` and `server/scripts/ptShadow.js`) implemented a dual-key contract. Below is the mapping verification ensuring full backward and forward compatibility:

| Endpoint | Updated Field | Legacy Alias | Frontend Resolution Pattern | Resulting Compatibility |
|---|---|---|---|---|
| `GET /api/admin/pt-log` | `r.standard_ms` | `r.naive_ms` | `r.standard_ms ?? r.naive_ms` | Safe with any past or future log record |
| `GET /api/admin/pt-log` | `r.optimized_ms` | `r.reduced_ms` | `r.optimized_ms ?? r.reduced_ms ?? r.total_ms` | Handles novel mongo-pt timings and fallback |
| `GET /api/admin/pt-status`| `st.standard` | `st.naive` | `st.standard \|\| st.naive` | Compatible with legacy status files |
| `GET /api/admin/pt-status`| `st.optimized` | `st.reduced` | `st.optimized \|\| st.reduced` | Compatible with legacy status files |
| `GET /api/admin/pt-metrics`| `avgStandardMs` | `avgNaiveMs` | `metrics.avgStandardMs ?? metrics.avgNaiveMs` | Dashboard averages always populate |
| `GET /api/admin/pt-metrics`| `avgOptimizedMs`| `avgReducedMs` | `metrics.avgOptimizedMs ?? metrics.avgReducedMs` | Dashboard averages always populate |
| `GET /api/admin/pt-metrics`| `throughputStandard`| `throughputNaive` | `metrics.throughputStandard ?? metrics.throughputNaive` | QPS metric cards always populate |
| `GET /api/admin/pt-metrics`| `throughputOptimized`| `throughputReduced` | `metrics.throughputOptimized ?? metrics.throughputReduced` | QPS metric cards always populate |

---

## 4. Architectural Coherence with M3-2 & M3-3

1. **Status Progression Order (M3-2 Alignment)**:
   - In `ptShadow.js`, Phase 1 executes `Optimized (mongo-pt)` first, followed by Phase 2 `Standard MongoDB`.
   - The UI phase chips must be rendered in execution sequence:
     ```jsx
     {phaseChip('optimized', runStatus, nowTick)}
     {phaseChip('standard', runStatus, nowTick)}
     ```
   - This prevents reviewer disorientation when the fast side finishes in 150ms while the standard left-deep pipeline takes 2.5s.

2. **Metrics & Descriptions (M3-3 Alignment)**:
   - In `perSpecStats` table and selection dropdowns, `s.description` from `adminController.js` is preferred over hardcoded static dictionaries.
   - Dual metrics (latency in ms + throughput in q/s) are rendered together in the table cells, replacing raw naive/reduced columns.

---

## 5. Artifacts Generated
- `proposed_PtLogPage_terminology.patch` — Unified diff patch for `client/src/pages/PtLogPage.jsx`
- `proposed_ProductDiscoveryPage_terminology.patch` — Unified diff patch for `client/src/pages/ProductDiscoveryPage.jsx`
