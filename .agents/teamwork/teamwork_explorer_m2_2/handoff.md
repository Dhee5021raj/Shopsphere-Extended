# Handoff Report: getPtMetrics Dual-Emission & Query Descriptions (M2-2)

**Agent**: `teamwork_explorer_m2_2`  
**Milestone**: M2 (Backend Terminology, Status & Metrics API)  
**Date**: 2026-10-27  

---

## 1. Observation

### 1.1 Current getPtMetrics Implementation (`server/controllers/adminController.js:206-351`)
- **Top-level Emission**:
  Lines 328–347 return:
  ```javascript
  res.json({
    totalRuns: shadows.length,
    wins,
    winRate,
    avgNaiveMs: parseFloat(avgNaiveMs.toFixed(1)),
    avgReducedMs: parseFloat(avgReducedMs.toFixed(1)),
    medNaiveMs: parseFloat(median(naiveTimes).toFixed(1)),
    medReducedMs: parseFloat(median(reducedTimes).toFixed(1)),
    throughputNaive,
    throughputReduced,
    avgSpeedup: speedups.length ? parseFloat(avg(speedups).toFixed(2)) : null,
    maxSpeedup: speedups.length ? parseFloat(Math.max(...speedups).toFixed(2)) : null,
    minSpeedup: speedups.length ? parseFloat(Math.min(...speedups).toFixed(2)) : null,
    robustnessGap,
    avgOverheadPct: overheads.length ? parseFloat(avg(overheads).toFixed(1)) : null,
    avgTransferMs: transfers.length ? parseFloat(avg(transfers).toFixed(1)) : null,
    avgMatMs: mats.length ? parseFloat(avg(mats).toFixed(1)) : null,
    perSpecStats,
    timeline,
  });
  ```
  **Direct Defect**: The response omits `avgStandardMs`, `avgOptimizedMs`, `medStandardMs`, `medOptimizedMs`, `throughputStandard`, and `throughputOptimized`.

- **Per-Spec Breakdown (`perSpecStats`, lines 288–315)**:
  Lines 296–314 return an object containing:
  ```javascript
  {
    spec,
    runs: d.naiveTimes.length,
    wins: specWins,
    winRate: specWinRate,
    avgNaiveMs: parseFloat(avg(d.naiveTimes).toFixed(1)),
    medNaiveMs: parseFloat(median(d.naiveTimes).toFixed(1)),
    avgReducedMs: parseFloat(avg(d.reducedTimes).toFixed(1)),
    medReducedMs: parseFloat(median(d.reducedTimes).toFixed(1)),
    avgSpeedup: d.speedups.length ? parseFloat(avg(d.speedups).toFixed(2)) : null,
    maxSpeedup: d.speedups.length ? parseFloat(Math.max(...d.speedups).toFixed(2)) : null,
    minSpeedup: d.speedups.length ? parseFloat(Math.min(...d.speedups).toFixed(2)) : null,
    robustnessGap: specGap,
    avgOverheadPct: d.overheads.length ? parseFloat(avg(d.overheads).toFixed(1)) : null,
    avgTransferMs: d.transfers.length ? parseFloat(avg(d.transfers).toFixed(1)) : null,
    avgMatMs: d.mats.length ? parseFloat(avg(d.mats).toFixed(1)) : null,
    throughputNaive: avg(d.naiveTimes) > 0 ? parseFloat((1000 / avg(d.naiveTimes)).toFixed(4)) : null,
    throughputReduced: avg(d.reducedTimes) > 0 ? parseFloat((1000 / avg(d.reducedTimes)).toFixed(4)) : null,
    timeline: d.timeline.slice(-20)
  }
  ```
  **Direct Defects**:
  1. The `description` property is completely absent from each `perSpecStats` entry.
  2. The updated metric keys (`avgStandardMs`, `avgOptimizedMs`, `medStandardMs`, `medOptimizedMs`, `throughputStandard`, `throughputOptimized`) are absent.
  3. `timeline` entries within `perSpecStats` only emit `naive_ms` and `reduced_ms`.

- **Spec Ingestion (`adminController.js:217`)**:
  ```javascript
  if (r.kind === 'shadow' && r.naive_ms != null && (r.reduced_ms != null || r.total_ms != null))
  ```
  If future or updated records write `standard_ms` and `optimized_ms` without legacy fields, this filter will fail to ingest them.

### 1.2 Canonical Query Spec Registry (`server/pt/specs/index.js`)
- Exports `{ specs, byName, makeLiveSearchSpec }`.
- `specs` contains 7 baseline specs:
  1. `rare_category_revenue_7d`: "Revenue per vendor for the rare category over the last 7 days (selective)."
  2. `common_category_revenue_365d`: "Revenue per vendor for the common category over 365 days (unselective — expected NOT to help)."
  3. `vendor_scoped_revenue_90d`: "Revenue per product for one large vendor over 90 days (vendor-scoped)."
  4. `user_scoped_spend_30d`: "Spend per product for one user over 30 days (user-scoped)."
  5. `low_rating_reviews_by_category`: "Low-rating review counts per category (reviews)."
  6. `vendor_category_revenue_365d`: "Revenue per category for one vendor over 365 days (mixed, 5 relations)."
  7. `user_vendor_category_spend_30d`: "Spend per (vendor × category) for one user over the last 30 days — the heaviest spec (6 relations); transfer + materialization often dominate here."
- `byName[s.name]` provides direct access to the spec definition and its canonical `description`.

### 1.3 Test Suite Execution & Verbatim Failures
Running `node --test server/tests/e2e_pt_revamp.test.js`:
```
not ok 4 - T1.1.4 [R1-Metrics-UpdatedKeys] GET /api/admin/pt-metrics exposes avgStandardMs, avgOptimizedMs and throughputs
  ---
  error: 'M2 Requirement: pt-metrics must emit "avgStandardMs"'
  code: 'ERR_ASSERTION'
  location: 'server/tests/e2e_pt_revamp.test.js:254:16'

not ok 1 - T1.3.1 [R3-PerSpec-Description] GET /api/admin/pt-metrics perSpecStats contains non-empty description
  ---
  error: 'M2 Requirement: perSpecStats entry must include "description"'
  code: 'ERR_ASSERTION'
  location: 'server/tests/e2e_pt_revamp.test.js:396:16'
```

---

## 2. Logic Chain

1. **Dual-Emission for Metrics (R1 & R3)**:
   - Observation 1.1 reveals `getPtMetrics` computes means, medians, and throughputs using legacy variable names (`avgNaiveMs`, `throughputNaive`, etc.).
   - Requirement R1 and acceptance test `T1.1.4` demand `avgStandardMs`, `avgOptimizedMs`, `throughputStandard`, and `throughputOptimized` in the top-level payload.
   - Acceptance test `T1.1.5` and test `T3.2` demand retaining `avgNaiveMs`, `avgReducedMs`, `throughputNaive`, `throughputReduced` with strict equality (`assert.strictEqual(data.avgStandardMs, data.avgNaiveMs)`).
   - Therefore, computing `standardTimes = shadows.map(r => r.standard_ms ?? r.naive_ms)` and `optimizedTimes = shadows.map(r => r.optimized_ms ?? r.reduced_ms ?? r.total_ms)` enables calculating identical values for both sets of keys, satisfying both `T1.1.4` and `T1.1.5`.

2. **Canonical Query Description in perSpecStats (R3)**:
   - Acceptance test `T1.3.1` strictly asserts:
     ```javascript
     assert.ok('description' in specStat, 'M2 Requirement: perSpecStats entry must include "description"');
     assert.strictEqual(typeof specStat.description, 'string', 'description must be a string');
     assert.ok(specStat.description.trim().length > 0, 'description must not be empty');
     ```
   - Observation 1.2 demonstrates that `server/pt/specs/index.js` exports `byName` with canonical descriptions for all 7 specs.
   - For dynamic live search specs (e.g., `live_search_laptop`), records logged in `pt-log.jsonl` already contain `r.description`.
   - Establishing a resolution cascade:
     `const description = specByName[spec]?.description || d.descriptions.find(Boolean) || (spec.startsWith('live_search') ? 'Live search query (' + spec.replace(/^live_search_/, '') + ')' : 'Benchmark query spec ' + spec);`
     guarantees that every query spec receives a canonical, informative, and non-empty description string.

3. **PerSpecStats & Timeline Parity**:
   - In `perSpecStats`, emitting both `avgStandardMs`, `avgOptimizedMs`, `medStandardMs`, `medOptimizedMs`, `throughputStandard`, `throughputOptimized` AND their legacy aliases (`avgNaiveMs`, etc.) ensures the frontend `MetricsPanel` and `All Queries Summary Table` can consume either key without friction.
   - In `timeline` (both top-level and perSpec), emitting `standard_ms`, `optimized_ms`, `naive_ms`, `reduced_ms`, `ts`, and `t` guarantees compatibility with Recharts legends, test `T3.5` (`assert.strictEqual(lastTimeline.naive_ms, r2.naive_ms)`), and the `PROJECT.md` API specification.

4. **Edge Case Safety (Zero Latency & Missing File)**:
   - Test `T2.5` checks that zero latencies return null or finite throughput without throwing `Infinity` or `NaN`.
   - Guarding throughput computations with `avgStandardMs > 0 ? parseFloat((1000 / avgStandardMs).toFixed(4)) : null` satisfies `T2.5`.
   - Guarding `robustnessGap` with `standardTimes.length >= 2 && Math.min(...standardTimes) > 0` prevents divide-by-zero errors.

---

## 3. Caveats

1. **Dynamic Specs & Custom Query Names**:
   For specs generated outside the 7 canonical specs (such as arbitrary synthetic strings in mock tests), the cascade falls back to `d.descriptions.find(Boolean)` and finally the formatted string fallback. This ensures no `perSpecStats` entry ever has an undefined or empty description.
2. **Division of Scope with Peer Explorers**:
   - Explorer M2-1 addresses `getPtStatus` and `ptShadow.js` (`T1.1.1` and `T1.1.2`).
   - Explorer M2-3 addresses `getPtLog` (`T1.1.6`).
   - Explorer M2-2 addresses `getPtMetrics` (`T1.1.4` and `T1.3.1`).
   The changes proposed here are strictly confined to `getPtMetrics` and the import of `pt/specs` in `adminController.js`, eliminating merge collision risks.

---

## 4. Conclusion

Worker M2 should implement the following modifications to `server/controllers/adminController.js`.

### 4.1 Exact Code Modification Plan

#### Edit 1: Import `specByName` (`server/controllers/adminController.js:1-7`)

**Before**:
```javascript
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Order = require('../models/Order');
```

**After**:
```javascript
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { byName: specByName } = require('../pt/specs');
```

---

#### Edit 2: Ingestion & Timing Extraction (`server/controllers/adminController.js:211-254`)

**Before**:
```javascript
    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    const shadows = [];
    for (const line of lines) {
      try {
        const r = JSON.parse(line);
        // Only count shadow records that have both timing sides measured
        if (r.kind === 'shadow' && r.naive_ms != null && (r.reduced_ms != null || r.total_ms != null)) {
          shadows.push(r);
        }
      } catch (_) { /* skip malformed */ }
    }

    if (shadows.length === 0) return res.json({ totalRuns: 0, noData: true });

    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const median = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
    };

    const naiveTimes   = shadows.map((r) => r.naive_ms);
    const reducedTimes = shadows.map((r) => r.reduced_ms ?? r.total_ms);
    const speedups     = shadows.filter((r) => r.speedup != null).map((r) => r.speedup);
    const overheads    = shadows.filter((r) => r.transfer_overhead_pct != null).map((r) => r.transfer_overhead_pct);
    const transfers    = shadows.filter((r) => r.transfer_ms != null).map((r) => r.transfer_ms);
    const mats         = shadows.filter((r) => r.materialization_ms != null).map((r) => r.materialization_ms);

    const avgNaiveMs   = avg(naiveTimes);
    const avgReducedMs = avg(reducedTimes);

    // Throughput = how many such queries can be executed per second
    const throughputNaive   = avgNaiveMs   > 0 ? parseFloat((1000 / avgNaiveMs).toFixed(4))   : null;
    const throughputReduced = avgReducedMs > 0 ? parseFloat((1000 / avgReducedMs).toFixed(4)) : null;

    // Robustness gap: measures how sensitive naive is to join order (max/min naive time)
    const robustnessGap = naiveTimes.length >= 2
      ? parseFloat((Math.max(...naiveTimes) / Math.min(...naiveTimes)).toFixed(2))
      : null;

    // Win rate: fraction of runs where PT reduced latency
    const wins    = shadows.filter((r) => (r.speedup ?? 0) > 1).length;
    const winRate = parseFloat(((wins / shadows.length) * 100).toFixed(1));
```

**After**:
```javascript
    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    const shadows = [];
    for (const line of lines) {
      try {
        const r = JSON.parse(line);
        // Only count shadow records that have both timing sides measured (supporting standard/optimized and naive/reduced)
        const hasStd = r.standard_ms != null || r.naive_ms != null;
        const hasOpt = r.optimized_ms != null || r.reduced_ms != null || r.total_ms != null;
        if (r.kind === 'shadow' && hasStd && hasOpt) {
          shadows.push(r);
        }
      } catch (_) { /* skip malformed */ }
    }

    if (shadows.length === 0) return res.json({ totalRuns: 0, noData: true });

    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const median = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
    };

    const standardTimes = shadows.map((r) => r.standard_ms ?? r.naive_ms);
    const optimizedTimes = shadows.map((r) => r.optimized_ms ?? r.reduced_ms ?? r.total_ms);
    const speedups      = shadows.filter((r) => r.speedup != null).map((r) => r.speedup);
    const overheads     = shadows.filter((r) => r.transfer_overhead_pct != null).map((r) => r.transfer_overhead_pct);
    const transfers     = shadows.filter((r) => r.transfer_ms != null).map((r) => r.transfer_ms);
    const mats          = shadows.filter((r) => r.materialization_ms != null).map((r) => r.materialization_ms);

    const avgStandardMs   = avg(standardTimes);
    const avgOptimizedMs = avg(optimizedTimes);
    const medStandardMs   = median(standardTimes);
    const medOptimizedMs = median(optimizedTimes);

    // Throughput = how many such queries can be executed per second
    const throughputStandard  = avgStandardMs  > 0 ? parseFloat((1000 / avgStandardMs).toFixed(4))  : null;
    const throughputOptimized = avgOptimizedMs > 0 ? parseFloat((1000 / avgOptimizedMs).toFixed(4)) : null;

    // Backward-compatible aliases
    const avgNaiveMs   = avgStandardMs;
    const avgReducedMs = avgOptimizedMs;
    const medNaiveMs   = medStandardMs;
    const medReducedMs = medOptimizedMs;
    const throughputNaive   = throughputStandard;
    const throughputReduced = throughputOptimized;

    // Robustness gap: measures how sensitive standard/naive is to join order (max/min standard time)
    const robustnessGap = standardTimes.length >= 2 && Math.min(...standardTimes) > 0
      ? parseFloat((Math.max(...standardTimes) / Math.min(...standardTimes)).toFixed(2))
      : null;

    // Win rate: fraction of runs where PT reduced latency
    const wins    = shadows.filter((r) => (r.speedup ?? 0) > 1).length;
    const winRate = parseFloat(((wins / shadows.length) * 100).toFixed(1));
```

---

#### Edit 3: perSpecStats & Timeline Construction (`server/controllers/adminController.js:256-347`)

**Before**:
```javascript
    // Per-spec breakdown
    const specMap = {};
    for (const r of shadows) {
      const s = r.spec || 'unknown';
      if (!specMap[s]) {
        specMap[s] = {
          naiveTimes: [],
          reducedTimes: [],
          speedups: [],
          overheads: [],
          transfers: [],
          mats: [],
          timeline: []
        };
      }
      specMap[s].naiveTimes.push(r.naive_ms);
      const red = r.reduced_ms ?? r.total_ms;
      specMap[s].reducedTimes.push(red);
      if (r.speedup != null) specMap[s].speedups.push(r.speedup);
      if (r.transfer_overhead_pct != null) specMap[s].overheads.push(r.transfer_overhead_pct);
      if (r.transfer_ms != null) specMap[s].transfers.push(r.transfer_ms);
      if (r.materialization_ms != null) specMap[s].mats.push(r.materialization_ms);
      specMap[s].timeline.push({
        ts: r.ts,
        spec: r.spec,
        naive_ms: r.naive_ms,
        reduced_ms: red,
        speedup: r.speedup,
        transfer_ms: r.transfer_ms,
        materialization_ms: r.materialization_ms
      });
    }

    const perSpecStats = Object.entries(specMap).map(([spec, d]) => {
      const specWins = d.speedups.filter((sp) => sp > 1).length;
      const specWinRate = d.speedups.length > 0 ? parseFloat(((specWins / d.speedups.length) * 100).toFixed(1)) : 0;
      const specGap = d.naiveTimes.length >= 2 && Math.min(...d.naiveTimes) > 0
        ? parseFloat((Math.max(...d.naiveTimes) / Math.min(...d.naiveTimes)).toFixed(2))
        : null;

      return {
        spec,
        runs: d.naiveTimes.length,
        wins: specWins,
        winRate: specWinRate,
        avgNaiveMs: parseFloat(avg(d.naiveTimes).toFixed(1)),
        medNaiveMs: parseFloat(median(d.naiveTimes).toFixed(1)),
        avgReducedMs: parseFloat(avg(d.reducedTimes).toFixed(1)),
        medReducedMs: parseFloat(median(d.reducedTimes).toFixed(1)),
        avgSpeedup: d.speedups.length ? parseFloat(avg(d.speedups).toFixed(2)) : null,
        maxSpeedup: d.speedups.length ? parseFloat(Math.max(...d.speedups).toFixed(2)) : null,
        minSpeedup: d.speedups.length ? parseFloat(Math.min(...d.speedups).toFixed(2)) : null,
        robustnessGap: specGap,
        avgOverheadPct: d.overheads.length ? parseFloat(avg(d.overheads).toFixed(1)) : null,
        avgTransferMs: d.transfers.length ? parseFloat(avg(d.transfers).toFixed(1)) : null,
        avgMatMs: d.mats.length ? parseFloat(avg(d.mats).toFixed(1)) : null,
        throughputNaive: avg(d.naiveTimes) > 0 ? parseFloat((1000 / avg(d.naiveTimes)).toFixed(4)) : null,
        throughputReduced: avg(d.reducedTimes) > 0 ? parseFloat((1000 / avg(d.reducedTimes)).toFixed(4)) : null,
        timeline: d.timeline.slice(-20)
      };
    });

    // Timeline for the chart: last 20 shadow runs, oldest→newest
    const timeline = shadows.slice(-20).map((r) => ({
      ts:        r.ts,
      spec:      r.spec,
      naive_ms:  r.naive_ms,
      reduced_ms: r.reduced_ms ?? r.total_ms,
      speedup:   r.speedup,
      transfer_ms: r.transfer_ms,
      materialization_ms: r.materialization_ms,
    }));

    res.json({
      totalRuns:        shadows.length,
      wins,
      winRate,
      avgNaiveMs:       parseFloat(avgNaiveMs.toFixed(1)),
      avgReducedMs:     parseFloat(avgReducedMs.toFixed(1)),
      medNaiveMs:       parseFloat(median(naiveTimes).toFixed(1)),
      medReducedMs:     parseFloat(median(reducedTimes).toFixed(1)),
      throughputNaive,
      throughputReduced,
      avgSpeedup:       speedups.length ? parseFloat(avg(speedups).toFixed(2)) : null,
      maxSpeedup:       speedups.length ? parseFloat(Math.max(...speedups).toFixed(2)) : null,
      minSpeedup:       speedups.length ? parseFloat(Math.min(...speedups).toFixed(2)) : null,
      robustnessGap,
      avgOverheadPct:   overheads.length ? parseFloat(avg(overheads).toFixed(1)) : null,
      avgTransferMs:    transfers.length ? parseFloat(avg(transfers).toFixed(1)) : null,
      avgMatMs:         mats.length      ? parseFloat(avg(mats).toFixed(1))      : null,
      perSpecStats,
      timeline,
    });
```

**After**:
```javascript
    // Per-spec breakdown
    const specMap = {};
    for (const r of shadows) {
      const s = r.spec || 'unknown';
      if (!specMap[s]) {
        specMap[s] = {
          descriptions: [],
          standardTimes: [],
          optimizedTimes: [],
          speedups: [],
          overheads: [],
          transfers: [],
          mats: [],
          timeline: []
        };
      }
      if (r.description) specMap[s].descriptions.push(r.description);
      const std = r.standard_ms ?? r.naive_ms;
      const opt = r.optimized_ms ?? r.reduced_ms ?? r.total_ms;
      specMap[s].standardTimes.push(std);
      specMap[s].optimizedTimes.push(opt);
      if (r.speedup != null) specMap[s].speedups.push(r.speedup);
      if (r.transfer_overhead_pct != null) specMap[s].overheads.push(r.transfer_overhead_pct);
      if (r.transfer_ms != null) specMap[s].transfers.push(r.transfer_ms);
      if (r.materialization_ms != null) specMap[s].mats.push(r.materialization_ms);
      specMap[s].timeline.push({
        ts: r.ts,
        t: r.ts,
        spec: r.spec,
        standard_ms: std,
        optimized_ms: opt,
        naive_ms: std,
        reduced_ms: opt,
        speedup: r.speedup,
        transfer_ms: r.transfer_ms,
        materialization_ms: r.materialization_ms
      });
    }

    const perSpecStats = Object.entries(specMap).map(([spec, d]) => {
      const specWins = d.speedups.filter((sp) => sp > 1).length;
      const specWinRate = d.speedups.length > 0 ? parseFloat(((specWins / d.speedups.length) * 100).toFixed(1)) : 0;
      const specGap = d.standardTimes.length >= 2 && Math.min(...d.standardTimes) > 0
        ? parseFloat((Math.max(...d.standardTimes) / Math.min(...d.standardTimes)).toFixed(2))
        : null;

      const avgStd = avg(d.standardTimes);
      const avgOpt = avg(d.optimizedTimes);
      const medStd = median(d.standardTimes);
      const medOpt = median(d.optimizedTimes);
      const tpStd = avgStd > 0 ? parseFloat((1000 / avgStd).toFixed(4)) : null;
      const tpOpt = avgOpt > 0 ? parseFloat((1000 / avgOpt).toFixed(4)) : null;

      const description = specByName[spec]?.description
        || d.descriptions.find(Boolean)
        || (spec.startsWith('live_search') ? `Live search query (${spec.replace(/^live_search_/, '')})` : `Benchmark query spec ${spec}`);

      return {
        spec,
        description,
        runs: d.standardTimes.length,
        wins: specWins,
        winRate: specWinRate,
        // Updated terminology
        avgStandardMs: parseFloat(avgStd.toFixed(1)),
        avgOptimizedMs: parseFloat(avgOpt.toFixed(1)),
        medStandardMs: parseFloat(medStd.toFixed(1)),
        medOptimizedMs: parseFloat(medOpt.toFixed(1)),
        throughputStandard: tpStd,
        throughputOptimized: tpOpt,
        // Legacy aliases
        avgNaiveMs: parseFloat(avgStd.toFixed(1)),
        medNaiveMs: parseFloat(medStd.toFixed(1)),
        avgReducedMs: parseFloat(avgOpt.toFixed(1)),
        medReducedMs: parseFloat(medOpt.toFixed(1)),
        throughputNaive: tpStd,
        throughputReduced: tpOpt,
        avgSpeedup: d.speedups.length ? parseFloat(avg(d.speedups).toFixed(2)) : null,
        maxSpeedup: d.speedups.length ? parseFloat(Math.max(...d.speedups).toFixed(2)) : null,
        minSpeedup: d.speedups.length ? parseFloat(Math.min(...d.speedups).toFixed(2)) : null,
        robustnessGap: specGap,
        avgOverheadPct: d.overheads.length ? parseFloat(avg(d.overheads).toFixed(1)) : null,
        avgTransferMs: d.transfers.length ? parseFloat(avg(d.transfers).toFixed(1)) : null,
        avgMatMs: d.mats.length ? parseFloat(avg(d.mats).toFixed(1)) : null,
        timeline: d.timeline.slice(-20)
      };
    });

    // Timeline for the chart: last 20 shadow runs, oldest→newest
    const timeline = shadows.slice(-20).map((r) => {
      const std = r.standard_ms ?? r.naive_ms;
      const opt = r.optimized_ms ?? r.reduced_ms ?? r.total_ms;
      return {
        ts:           r.ts,
        t:            r.ts,
        spec:         r.spec,
        standard_ms:  std,
        optimized_ms: opt,
        naive_ms:     std,
        reduced_ms:   opt,
        speedup:      r.speedup,
        transfer_ms:  r.transfer_ms,
        materialization_ms: r.materialization_ms,
      };
    });

    res.json({
      totalRuns:          shadows.length,
      wins,
      winRate,
      // Updated terminology
      avgStandardMs:      parseFloat(avgStandardMs.toFixed(1)),
      avgOptimizedMs:     parseFloat(avgOptimizedMs.toFixed(1)),
      medStandardMs:      parseFloat(medStandardMs.toFixed(1)),
      medOptimizedMs:     parseFloat(medOptimizedMs.toFixed(1)),
      throughputStandard,
      throughputOptimized,
      // Legacy aliases
      avgNaiveMs:         parseFloat(avgNaiveMs.toFixed(1)),
      avgReducedMs:       parseFloat(avgReducedMs.toFixed(1)),
      medNaiveMs:         parseFloat(medNaiveMs.toFixed(1)),
      medReducedMs:       parseFloat(medReducedMs.toFixed(1)),
      throughputNaive,
      throughputReduced,
      avgSpeedup:         speedups.length ? parseFloat(avg(speedups).toFixed(2)) : null,
      maxSpeedup:         speedups.length ? parseFloat(Math.max(...speedups).toFixed(2)) : null,
      minSpeedup:         speedups.length ? parseFloat(Math.min(...speedups).toFixed(2)) : null,
      robustnessGap,
      avgOverheadPct:     overheads.length ? parseFloat(avg(overheads).toFixed(1)) : null,
      avgTransferMs:      transfers.length ? parseFloat(avg(transfers).toFixed(1)) : null,
      avgMatMs:           mats.length      ? parseFloat(avg(mats).toFixed(1))      : null,
      perSpecStats,
      timeline,
    });
```

---

## 5. Verification Method

### 5.1 Unit & E2E Test Execution
Run the E2E test suite:
```powershell
node --test server/tests/e2e_pt_revamp.test.js
```
*Expected Result*:
- `T1.1.4 [R1-Metrics-UpdatedKeys]` passes (no assertion error on `avgStandardMs`).
- `T1.3.1 [R3-PerSpec-Description]` passes (no assertion error on `description`).
- `T1.1.5`, `T3.2`, `T3.4`, `T3.5` continue to pass.

### 5.2 PT Full Suite
Run the full PT test suite:
```powershell
npm --prefix server run test:pt
```
*Expected Result*: All 16 root subtests execute without regressions.

### 5.3 Live Endpoint Verification
```powershell
node -e "
const admin = require('./server/controllers/adminController');
const res = { json: (d) => {
  console.log('Top keys:', Object.keys(d));
  console.log('avgStandardMs:', d.avgStandardMs, 'avgNaiveMs:', d.avgNaiveMs);
  console.log('perSpecStats count:', d.perSpecStats?.length);
  if (d.perSpecStats?.length) {
    console.log('Sample spec:', d.perSpecStats[0].spec);
    console.log('Sample desc:', d.perSpecStats[0].description);
  }
}};
admin.getPtMetrics({}, res);
"
```
*Expected Result*: Valid JSON output displaying `avgStandardMs`, `avgOptimizedMs`, `throughputStandard`, `throughputOptimized`, and `perSpecStats[0].description`.
