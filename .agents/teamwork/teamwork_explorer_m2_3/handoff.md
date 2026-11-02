# Handoff Report: getPtLog Mapping & E2E Test Parity Investigation

**Agent**: `teamwork_explorer_m2_3`  
**Milestone**: M2 (Backend Terminology, Status & Metrics API)  
**Date**: 2026-10-27  
**Status**: Investigation Complete — Ready for Worker M2 Implementation  

---

## 1. Observation

### 1.1 Direct Test Suite Execution
- **Command Executed**: `node --test server/tests/e2e_pt_revamp.test.js`
- **Output Summary**:
  ```text
  # tests 54
  # suites 10
  # pass 50
  # fail 4
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 7091.2258
  ```
- **Verbatim Error 1 — T1.1.1 (`server/tests/e2e_pt_revamp.test.js:184-204`)**:
  ```text
  not ok 1 - T1.1.1 [R1-Status-Standard] GET /api/admin/pt-status returns standard phase object
    ---
    duration_ms: 4.7348
    type: 'test'
    location: 'C:\\GEMINI\\DBMS_PRJ\\Shopsphere\\server\\tests\\e2e_pt_revamp.test.js:184:5'
    failureType: 'testCodeFailure'
    error: 'M2 Requirement: pt-status must expose "standard" phase object'
    code: 'ERR_ASSERTION'
    name: 'AssertionError'
    expected: true
    actual: false
    operator: '=='
    stack: |-
      C:\GEMINI\DBMS_PRJ\Shopsphere\server\tests\e2e_pt_revamp.test.js:200:16
    ...
  ```
- **Verbatim Error 2 — T1.1.2 (`server/tests/e2e_pt_revamp.test.js:206-226`)**:
  ```text
  not ok 2 - T1.1.2 [R1-Status-Optimized] GET /api/admin/pt-status returns optimized phase object
    ---
    duration_ms: 2.5018
    type: 'test'
    location: 'C:\\GEMINI\\DBMS_PRJ\\Shopsphere\\server\\tests\\e2e_pt_revamp.test.js:206:5'
    failureType: 'testCodeFailure'
    error: 'M2 Requirement: pt-status must expose "optimized" phase object'
    code: 'ERR_ASSERTION'
    name: 'AssertionError'
    expected: true
    actual: false
    operator: '=='
    stack: |-
      C:\GEMINI\DBMS_PRJ\Shopsphere\server\tests\e2e_pt_revamp.test.js:222:16
    ...
  ```
- **Verbatim Error 3 — T1.1.4 (`server/tests/e2e_pt_revamp.test.js:248-259`)**:
  ```text
  not ok 4 - T1.1.4 [R1-Metrics-UpdatedKeys] GET /api/admin/pt-metrics exposes avgStandardMs, avgOptimizedMs and throughputs
    ---
    duration_ms: 4.1264
    type: 'test'
    location: 'C:\\GEMINI\\DBMS_PRJ\\Shopsphere\\server\\tests\\e2e_pt_revamp.test.js:248:5'
    failureType: 'testCodeFailure'
    error: 'M2 Requirement: pt-metrics must emit "avgStandardMs"'
    code: 'ERR_ASSERTION'
    name: 'AssertionError'
    expected: true
    actual: false
    operator: '=='
    stack: |-
      C:\GEMINI\DBMS_PRJ\Shopsphere\server\tests\e2e_pt_revamp.test.js:254:16
    ...
  ```
- **Verbatim Error 4 — T1.3.1 (`server/tests/e2e_pt_revamp.test.js:388-400`)**:
  ```text
  not ok 1 - T1.3.1 [R3-PerSpec-Description] GET /api/admin/pt-metrics perSpecStats contains non-empty description
    ---
    duration_ms: 3.0099
    type: 'test'
    location: 'C:\\GEMINI\\DBMS_PRJ\\Shopsphere\\server\\tests\\e2e_pt_revamp.test.js:388:5'
    failureType: 'testCodeFailure'
    error: 'M2 Requirement: perSpecStats entry must include "description"'
    code: 'ERR_ASSERTION'
    name: 'AssertionError'
    expected: true
    actual: false
    operator: '=='
    stack: |-
      C:\GEMINI\DBMS_PRJ\Shopsphere\server\tests\e2e_pt_revamp.test.js:396:16
    ...
  ```

### 1.2 Inspection of Existing Code & Logs
1. **`server/controllers/adminController.js`**:
   - `getPtLog` (lines 113–126): Directly parses raw lines from `pt-log.jsonl` and returns them reversed without any normalization or property mapping:
     ```javascript
     const records = [];
     for (const line of lines.slice(-100)) {
       try { records.push(JSON.parse(line)); } catch (_) { /* skip malformed */ }
     }
     res.json(records.reverse());
     ```
   - `getPtStatus` (lines 137–191):
     Line 159 hardcodes `phases`:
     ```javascript
     const phases = { naive: shape(rec.naive), reduced: shape(rec.reduced) };
     ```
     The keys `standard` and `optimized` are completely omitted from both the active JSON response and the fallback lock response (`{ running, startedAt, naive: null, reduced: null, ... }`).
   - `getPtMetrics` (lines 206–351):
     Emits only legacy latency/throughput keys (`avgNaiveMs`, `avgReducedMs`, `medNaiveMs`, `medReducedMs`, `throughputNaive`, `throughputReduced`).
     `perSpecStats` (lines 295–315) omits the `description` property on every spec item.
2. **`server/logs/pt-log.jsonl`**:
   - Contains 63 historical records.
   - Historical records have properties `naive_ms`, `reduced_ms`, `total_ms`, `best: { naive_ms, reduced_ms }`, `worst_case: { naive_ms, reduced_ms }`. They do NOT possess `standard_ms` or `optimized_ms`.
3. **`server/scripts/ptShadow.js`**:
   - `phaseState` (lines 92–97): Only initializes `naive` and `reduced`.
   - Log line serialization (lines 258–271): Only logs `naive_ms`, `reduced_ms`, `total_ms`.

---

## 2. Logic Chain

1. **Root Cause Analysis of the 4 Failing E2E Tests**:
   - **T1.1.1 & T1.1.2**: In `getPtStatus`, `shape()` is only applied to `rec.naive` and `rec.reduced`, producing response keys `naive` and `reduced`. The test expects `data.standard` and `data.optimized` to be objects with status properties. In addition, `rec` written by updated or test mock fixtures may supply either `{ standard, optimized }` or `{ naive, reduced }`. Therefore, bidirectional fallback mapping `standard = shape(rec.standard || rec.naive)` and `optimized = shape(rec.optimized || rec.reduced)` is necessary.
   - **T1.1.4**: In `getPtMetrics`, the response payload and `perSpecStats` items contain only `avgNaiveMs`, `avgReducedMs`, `throughputNaive`, `throughputReduced`. Adding `avgStandardMs`, `avgOptimizedMs`, `medStandardMs`, `medOptimizedMs`, `throughputStandard`, `throughputOptimized` with exact numerical equality (`avgStandardMs === avgNaiveMs`, etc.) satisfies T1.1.4 and preserves legacy parity tested in T3.2.
   - **T1.3.1**: In `getPtMetrics`, `perSpecStats` is created from `specMap`, but neither `r.description` nor `byName[spec].description` from `server/pt/specs/index.js` is included in the output object. Injecting `description` into each `perSpecStats` entry resolves T1.3.1.

2. **Formulation of Property Mapping in `getPtLog`**:
   - The contract in `PROJECT.md` line 96 and Feature Inventory Feature #3 mandates that `GET /api/admin/pt-log` returns records containing:
     `spec`, `description`, `trigger`, `kind`, `standard_ms`, `optimized_ms`, `speedup`, `transfer_ms`, `materialization_ms`, `transfer_overhead_pct`, `equal`, `checksum`, `result_rows`, `best`, `worst_case`.
   - Because `pt-log.jsonl` contains 63 historical records with `naive_ms` and `reduced_ms`, `getPtLog` must map records on-the-fly during read.
   - **Mapping Specification**:
     ```javascript
     const mapLogRecord = (r) => {
       if (!r || typeof r !== 'object') return r;
       const standard_ms = r.standard_ms != null ? r.standard_ms : (r.naive_ms != null ? r.naive_ms : null);
       const naive_ms = r.naive_ms != null ? r.naive_ms : (r.standard_ms != null ? r.standard_ms : null);
       const optimized_ms = r.optimized_ms != null ? r.optimized_ms : (r.reduced_ms != null ? r.reduced_ms : (r.total_ms != null ? r.total_ms : null));
       const reduced_ms = r.reduced_ms != null ? r.reduced_ms : (r.optimized_ms != null ? r.optimized_ms : (r.total_ms != null ? r.total_ms : null));

       const best = r.best && typeof r.best === 'object' ? {
         ...r.best,
         standard_ms: r.best.standard_ms != null ? r.best.standard_ms : (r.best.naive_ms != null ? r.best.naive_ms : null),
         naive_ms: r.best.naive_ms != null ? r.best.naive_ms : (r.best.standard_ms != null ? r.best.standard_ms : null),
         optimized_ms: r.best.optimized_ms != null ? r.best.optimized_ms : (r.best.reduced_ms != null ? r.best.reduced_ms : (r.best.total_ms != null ? r.best.total_ms : null)),
         reduced_ms: r.best.reduced_ms != null ? r.best.reduced_ms : (r.best.optimized_ms != null ? r.best.optimized_ms : (r.best.total_ms != null ? r.best.total_ms : null)),
       } : r.best;

       const worst_case = r.worst_case && typeof r.worst_case === 'object' ? {
         ...r.worst_case,
         standard_ms: r.worst_case.standard_ms != null ? r.worst_case.standard_ms : (r.worst_case.naive_ms != null ? r.worst_case.naive_ms : null),
         naive_ms: r.worst_case.naive_ms != null ? r.worst_case.naive_ms : (r.worst_case.standard_ms != null ? r.worst_case.standard_ms : null),
         optimized_ms: r.worst_case.optimized_ms != null ? r.worst_case.optimized_ms : (r.worst_case.reduced_ms != null ? r.worst_case.reduced_ms : (r.worst_case.total_ms != null ? r.worst_case.total_ms : null)),
         reduced_ms: r.worst_case.reduced_ms != null ? r.worst_case.reduced_ms : (r.worst_case.optimized_ms != null ? r.worst_case.optimized_ms : (r.worst_case.total_ms != null ? r.worst_case.total_ms : null)),
       } : r.worst_case;

       const desc = r.description || (r.spec && byName && byName[r.spec] ? byName[r.spec].description : '');

       return {
         ...r,
         standard_ms,
         optimized_ms,
         naive_ms,
         reduced_ms,
         best,
         worst_case,
         ...(desc ? { description: desc } : {})
       };
     };
     ```
   - This mapping guarantees that both updated properties (`standard_ms`, `optimized_ms`) and legacy properties (`naive_ms`, `reduced_ms`) are simultaneously available, whether reading old logs, new logs, or mock fixture logs.

---

## 3. Caveats

1. **Read-Only Scope**: This agent is an explorer and did not alter any code files under `server/`. All proposed changes are documented as precise code instructions for Worker M2.
2. **Historical Log Preservation**: `server/logs/pt-log.jsonl` does NOT need to be modified or rewritten on disk. Runtime mapping in `getPtLog` completely decouples stored legacy representations from API presentation.
3. **M1 Benchmark Scale**: The benchmark verification scenario `T4.5` (`Scenario-LiveBenchEquivalence`) executes against live `shopsphere_bench` and already passed in 5.3s.

---

## 4. Conclusion & Actionable Implementation Plan for Worker M2

### 4.1 Changes Required in `server/controllers/adminController.js`

1. **Import Canonical Spec Descriptions**:
   At top of `server/controllers/adminController.js` (line 7):
   ```javascript
   const { byName } = require('../pt/specs');
   ```

2. **Implement `getPtLog` Normalization**:
   Replace `getPtLog` (lines 113–126) with:
   ```javascript
   const mapLogRecord = (r) => {
     if (!r || typeof r !== 'object') return r;
     const standard_ms = r.standard_ms != null ? r.standard_ms : (r.naive_ms != null ? r.naive_ms : null);
     const naive_ms = r.naive_ms != null ? r.naive_ms : (r.standard_ms != null ? r.standard_ms : null);
     const optimized_ms = r.optimized_ms != null ? r.optimized_ms : (r.reduced_ms != null ? r.reduced_ms : (r.total_ms != null ? r.total_ms : null));
     const reduced_ms = r.reduced_ms != null ? r.reduced_ms : (r.optimized_ms != null ? r.optimized_ms : (r.total_ms != null ? r.total_ms : null));

     const best = r.best && typeof r.best === 'object' ? {
       ...r.best,
       standard_ms: r.best.standard_ms != null ? r.best.standard_ms : (r.best.naive_ms != null ? r.best.naive_ms : null),
       naive_ms: r.best.naive_ms != null ? r.best.naive_ms : (r.best.standard_ms != null ? r.best.standard_ms : null),
       optimized_ms: r.best.optimized_ms != null ? r.best.optimized_ms : (r.best.reduced_ms != null ? r.best.reduced_ms : (r.best.total_ms != null ? r.best.total_ms : null)),
       reduced_ms: r.best.reduced_ms != null ? r.best.reduced_ms : (r.best.optimized_ms != null ? r.best.optimized_ms : (r.best.total_ms != null ? r.best.total_ms : null)),
     } : r.best;

     const worst_case = r.worst_case && typeof r.worst_case === 'object' ? {
       ...r.worst_case,
       standard_ms: r.worst_case.standard_ms != null ? r.worst_case.standard_ms : (r.worst_case.naive_ms != null ? r.worst_case.naive_ms : null),
       naive_ms: r.worst_case.naive_ms != null ? r.worst_case.naive_ms : (r.worst_case.standard_ms != null ? r.worst_case.standard_ms : null),
       optimized_ms: r.worst_case.optimized_ms != null ? r.worst_case.optimized_ms : (r.worst_case.reduced_ms != null ? r.worst_case.reduced_ms : (r.worst_case.total_ms != null ? r.worst_case.total_ms : null)),
       reduced_ms: r.worst_case.reduced_ms != null ? r.worst_case.reduced_ms : (r.worst_case.optimized_ms != null ? r.worst_case.optimized_ms : (r.worst_case.total_ms != null ? r.worst_case.total_ms : null)),
     } : r.worst_case;

     const desc = r.description || (r.spec && byName && byName[r.spec] ? byName[r.spec].description : '');

     return {
       ...r,
       standard_ms,
       optimized_ms,
       naive_ms,
       reduced_ms,
       best,
       worst_case,
       ...(desc ? { description: desc } : {})
     };
   };

   const getPtLog = async (req, res) => {
     try {
       const logFile = process.env.PT_LOG || path.join(__dirname, '..', 'logs', 'pt-log.jsonl');
       if (!fs.existsSync(logFile)) return res.json([]);
       const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
       const records = [];
       for (const line of lines.slice(-100)) {
         try {
           const raw = JSON.parse(line);
           records.push(mapLogRecord(raw));
         } catch (_) { /* skip malformed */ }
       }
       res.json(records.reverse()); // newest first
     } catch (error) {
       res.status(500).json({ message: error.message });
     }
   };
   ```

3. **Update `getPtStatus` for Standard / Optimized Phases**:
   Modify lines 159–174:
   ```javascript
       const standardPhase = shape(rec.standard || rec.naive);
       const optimizedPhase = shape(rec.optimized || rec.reduced);
       const naivePhase = shape(rec.naive || rec.standard);
       const reducedPhase = shape(rec.reduced || rec.optimized);
       const phases = {
         standard: standardPhase,
         optimized: optimizedPhase,
         naive: naivePhase,
         reduced: reducedPhase
       };
       if (!fresh) {
         if (phases.standard) phases.standard.running = false;
         if (phases.optimized) phases.optimized.running = false;
         if (phases.naive) phases.naive.running = false;
         if (phases.reduced) phases.reduced.running = false;
       }
       const anyPhase = fresh && Object.values(phases).some((p) => p && (p.running || p.done));
       return res.json({
         running: anyPhase,
         startedAt: rec.startedAt || null,
         ...phases,
         staleAfterMin: STALE_MS / 60000,
         typicalRunSeconds: 60
       });
   ```
   And in the fallback (line 187):
   ```javascript
   res.json({
     running,
     startedAt,
     standard: null,
     optimized: null,
     naive: null,
     reduced: null,
     staleAfterMin: STALE_MS / 60000,
     typicalRunSeconds: 60
   });
   ```

4. **Update `getPtMetrics` for Dual Keys & Descriptions**:
   In `getPtMetrics`:
   - Line 217: Filter condition:
     ```javascript
     const standard_ms = r.standard_ms ?? r.naive_ms;
     const optimized_ms = r.optimized_ms ?? r.reduced_ms ?? r.total_ms;
     if (r.kind === 'shadow' && standard_ms != null && optimized_ms != null) {
       shadows.push({
         ...r,
         standard_ms,
         optimized_ms,
         naive_ms: standard_ms,
         reduced_ms: optimized_ms
       });
     }
     ```
   - In calculations:
     ```javascript
     const naiveTimes   = shadows.map((r) => r.standard_ms);
     const reducedTimes = shadows.map((r) => r.optimized_ms);
     ...
     const avgStandardMs = avg(naiveTimes);
     const avgOptimizedMs = avg(reducedTimes);
     const avgNaiveMs   = avgStandardMs;
     const avgReducedMs = avgOptimizedMs;

     const medStandardMs = median(naiveTimes);
     const medOptimizedMs = median(reducedTimes);
     const medNaiveMs = medStandardMs;
     const medReducedMs = medOptimizedMs;

     const throughputStandard = avgStandardMs > 0 ? parseFloat((1000 / avgStandardMs).toFixed(4)) : null;
     const throughputOptimized = avgOptimizedMs > 0 ? parseFloat((1000 / avgOptimizedMs).toFixed(4)) : null;
     const throughputNaive = throughputStandard;
     const throughputReduced = throughputOptimized;
     ```
   - In `specMap` grouping loop:
     ```javascript
     if (!specMap[s]) {
       specMap[s] = {
         description: r.description || (byName[s] ? byName[s].description : ''),
         naiveTimes: [],
         reducedTimes: [],
         speedups: [],
         overheads: [],
         transfers: [],
         mats: [],
         timeline: []
       };
     }
     if (!specMap[s].description && r.description) {
       specMap[s].description = r.description;
     }
     ```
   - In `perSpecStats` mapping:
     ```javascript
     const avgStd = parseFloat(avg(d.naiveTimes).toFixed(1));
     const medStd = parseFloat(median(d.naiveTimes).toFixed(1));
     const avgOpt = parseFloat(avg(d.reducedTimes).toFixed(1));
     const medOpt = parseFloat(median(d.reducedTimes).toFixed(1));
     const tpStd = avg(d.naiveTimes) > 0 ? parseFloat((1000 / avg(d.naiveTimes)).toFixed(4)) : null;
     const tpOpt = avg(d.reducedTimes) > 0 ? parseFloat((1000 / avg(d.reducedTimes)).toFixed(4)) : null;
     const desc = d.description || (byName[spec] ? byName[spec].description : '') || `Execution benchmark for ${spec}`;

     return {
       spec,
       description: desc,
       runs: d.naiveTimes.length,
       wins: specWins,
       winRate: specWinRate,
       avgStandardMs: avgStd,
       medStandardMs: medStd,
       avgOptimizedMs: avgOpt,
       medOptimizedMs: medOpt,
       avgNaiveMs: avgStd,
       medNaiveMs: medStd,
       avgReducedMs: avgOpt,
       medReducedMs: medOpt,
       avgSpeedup: d.speedups.length ? parseFloat(avg(d.speedups).toFixed(2)) : null,
       maxSpeedup: d.speedups.length ? parseFloat(Math.max(...d.speedups).toFixed(2)) : null,
       minSpeedup: d.speedups.length ? parseFloat(Math.min(...d.speedups).toFixed(2)) : null,
       robustnessGap: specGap,
       avgOverheadPct: d.overheads.length ? parseFloat(avg(d.overheads).toFixed(1)) : null,
       avgTransferMs: d.transfers.length ? parseFloat(avg(d.transfers).toFixed(1)) : null,
       avgMatMs: d.mats.length ? parseFloat(avg(d.mats).toFixed(1)) : null,
       throughputStandard: tpStd,
       throughputOptimized: tpOpt,
       throughputNaive: tpStd,
       throughputReduced: tpOpt,
       timeline: d.timeline.slice(-20)
     };
     ```
   - In top-level return object:
     Include both `avgStandardMs`, `avgOptimizedMs`, `medStandardMs`, `medOptimizedMs`, `throughputStandard`, `throughputOptimized` alongside the legacy keys.
   - In `timeline` mapping:
     Include `standard_ms: r.standard_ms`, `optimized_ms: r.optimized_ms`, `naive_ms: r.standard_ms`, `reduced_ms: r.optimized_ms`, and `t: r.ts`.

### 4.2 Changes Recommended in `server/scripts/ptShadow.js`
- Lines 92–97: In `phaseState`, add `standard: { phase: 'idle', ... }` and `optimized: { phase: 'idle', ... }`.
- In `beginPhase(name)` & `endPhase(name, ms)`:
  - If `name === 'reduced'`, update both `phaseState.reduced` and `phaseState.optimized`.
  - If `name === 'naive'`, update both `phaseState.naive` and `phaseState.standard`.
- Lines 258–265: In `rec`, add:
  ```javascript
  standard_ms: +naiveMs.toFixed(1),
  optimized_ms: +reducedMs.toFixed(1),
  ```

---

## 5. Verification Method

To verify these changes turn all 54 E2E tests green:

1. **Run Full E2E Test Suite**:
   ```powershell
   node --test server/tests/e2e_pt_revamp.test.js
   ```
   **Pass Condition**:
   - `# tests 54`
   - `# suites 10`
   - `# pass 54`
   - `# fail 0`
   - Exit code: 0

2. **Run Existing PT Test Suite**:
   ```powershell
   npm run test:pt --prefix server
   ```
   **Pass Condition**:
   - `# tests 66`
   - `# pass 66`
   - `# fail 0`
   - Exit code: 0

3. **Direct Endpoint Parity Check via Node Evaluation**:
   ```powershell
   node -e "
   const { getPtStatus, getPtMetrics, getPtLog } = require('./server/controllers/adminController');
   const mock = (name) => ({ json: (d) => console.log(name, Object.keys(d).slice(0, 8)) });
   getPtStatus({}, mock('pt-status:'));
   getPtMetrics({}, mock('pt-metrics:'));
   getPtLog({}, { json: (d) => console.log('pt-log count:', d.length, 'sample keys:', Object.keys(d[0] || {})) });
   "
   ```
   **Pass Condition**:
   - `pt-status` exposes `standard`, `optimized`, `naive`, `reduced`.
   - `pt-metrics` exposes `avgStandardMs`, `avgOptimizedMs`, `throughputStandard`, `throughputOptimized`, `perSpecStats` with descriptions.
   - `pt-log` exposes `standard_ms`, `optimized_ms` on every record.
