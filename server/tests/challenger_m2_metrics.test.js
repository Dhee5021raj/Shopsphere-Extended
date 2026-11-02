'use strict';

/**
 * challenger_m2_metrics.test.js
 *
 * Milestone 2 Challenger 2 Test Suite:
 * Empirical adversarial stress-testing of `getPtMetrics` and `getPtLog`
 * covering mathematical correctness, query descriptions, edge cases,
 * key migrations, and unusual/malformed payloads.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  getPtLog,
  getPtMetrics
} = require('../controllers/adminController');
const { specs, byName: specByName } = require('../pt/specs');

// Helper to capture Express res.json / res.status
function createMockRes() {
  const state = {
    statusCode: 200,
    data: null,
    ended: false
  };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(obj) {
      state.data = obj;
      state.ended = true;
      return res;
    }
  };
  return { res, getState: () => state };
}

// Temporary log file isolation helper
async function withTempLog(records, fn) {
  const tempFile = path.join(os.tmpdir(), `challenger-pt-log-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const content = records.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + (records.length ? '\n' : '');
  fs.writeFileSync(tempFile, content, 'utf8');

  const oldEnv = process.env.PT_LOG;
  process.env.PT_LOG = tempFile;

  try {
    return await fn(tempFile);
  } finally {
    if (oldEnv !== undefined) {
      process.env.PT_LOG = oldEnv;
    } else {
      delete process.env.PT_LOG;
    }
    try { fs.unlinkSync(tempFile); } catch (_) {}
  }
}

// Independent Math Oracle for Cross-Verification
function oracleMath(records) {
  const valid = records.filter(
    (r) => r.kind === 'shadow' &&
      (r.standard_ms != null || r.naive_ms != null) &&
      (r.optimized_ms != null || r.reduced_ms != null || r.total_ms != null)
  );

  if (valid.length === 0) return { totalRuns: 0, noData: true };

  const stdTimes = valid.map((r) => (r.naive_ms != null ? r.naive_ms : r.standard_ms));
  const optTimes = valid.map((r) => (r.reduced_ms != null ? r.reduced_ms : (r.optimized_ms ?? r.total_ms)));

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr) => sum(arr) / arr.length;
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
  };

  const avgStd = avg(stdTimes);
  const avgOpt = avg(optTimes);
  const medStd = median(stdTimes);
  const medOpt = median(optTimes);

  const tpStd = avgStd > 0 ? parseFloat((1000 / avgStd).toFixed(4)) : null;
  const tpOpt = avgOpt > 0 ? parseFloat((1000 / avgOpt).toFixed(4)) : null;

  const speedups = valid.filter((r) => r.speedup != null).map((r) => r.speedup);
  const wins = valid.filter((r) => (r.speedup ?? 0) > 1).length;
  const winRate = parseFloat(((wins / valid.length) * 100).toFixed(1));

  const gap = stdTimes.length >= 2 && Math.min(...stdTimes) > 0
    ? parseFloat((Math.max(...stdTimes) / Math.min(...stdTimes)).toFixed(2))
    : null;

  return {
    totalRuns: valid.length,
    wins,
    winRate,
    avgStandardMs: parseFloat(avgStd.toFixed(1)),
    avgOptimizedMs: parseFloat(avgOpt.toFixed(1)),
    medStandardMs: parseFloat(medStd.toFixed(1)),
    medOptimizedMs: parseFloat(medOpt.toFixed(1)),
    throughputStandard: tpStd,
    throughputOptimized: tpOpt,
    avgSpeedup: speedups.length ? parseFloat(avg(speedups).toFixed(2)) : null,
    maxSpeedup: speedups.length ? parseFloat(Math.max(...speedups).toFixed(2)) : null,
    minSpeedup: speedups.length ? parseFloat(Math.min(...speedups).toFixed(2)) : null,
    robustnessGap: gap
  };
}

describe('Challenger M2-2: Math & Metrics Empirical Tests', () => {

  describe('Suite 1: Mathematical Accuracy of getPtMetrics', () => {
    test('1.1 Odd record count: exact median, average, throughput, and speedup match oracle', async () => {
      const records = [
        { kind: 'shadow', spec: 'rare_category_revenue_7d', standard_ms: 100, optimized_ms: 20, speedup: 5.0, transfer_ms: 2, materialization_ms: 3, transfer_overhead_pct: 25.0 },
        { kind: 'shadow', spec: 'rare_category_revenue_7d', standard_ms: 200, optimized_ms: 50, speedup: 4.0, transfer_ms: 5, materialization_ms: 5, transfer_overhead_pct: 20.0 },
        { kind: 'shadow', spec: 'rare_category_revenue_7d', standard_ms: 600, optimized_ms: 50, speedup: 12.0, transfer_ms: 5, materialization_ms: 5, transfer_overhead_pct: 20.0 }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;
        const expected = oracleMath(records);

        assert.equal(data.totalRuns, 3);
        assert.equal(data.avgStandardMs, 300.0);
        assert.equal(data.medStandardMs, 200.0);
        assert.equal(data.avgOptimizedMs, 40.0);
        assert.equal(data.medOptimizedMs, 50.0);
        assert.equal(data.throughputStandard, 3.3333);
        assert.equal(data.throughputOptimized, 25.0);
        assert.equal(data.avgSpeedup, 7.0);
        assert.equal(data.maxSpeedup, 12.0);
        assert.equal(data.minSpeedup, 4.0);
        assert.equal(data.winRate, 100.0);
        assert.equal(data.robustnessGap, 6.0); // 600 / 100

        // Parity with legacy keys
        assert.equal(data.avgNaiveMs, data.avgStandardMs);
        assert.equal(data.avgReducedMs, data.avgOptimizedMs);
        assert.equal(data.medNaiveMs, data.medStandardMs);
        assert.equal(data.medReducedMs, data.medOptimizedMs);
        assert.equal(data.throughputNaive, data.throughputStandard);
        assert.equal(data.throughputReduced, data.throughputOptimized);
      });
    });

    test('1.2 Even record count: median interpolation (s[m-1] + s[m]) / 2', async () => {
      const records = [
        { kind: 'shadow', spec: 's1', standard_ms: 10, optimized_ms: 2 },
        { kind: 'shadow', spec: 's1', standard_ms: 20, optimized_ms: 4 },
        { kind: 'shadow', spec: 's1', standard_ms: 30, optimized_ms: 6 },
        { kind: 'shadow', spec: 's1', standard_ms: 40, optimized_ms: 8 }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        // Medians: (20 + 30)/2 = 25.0, (4 + 6)/2 = 5.0
        assert.equal(data.medStandardMs, 25.0);
        assert.equal(data.medOptimizedMs, 5.0);
        assert.equal(data.avgStandardMs, 25.0);
        assert.equal(data.avgOptimizedMs, 5.0);
      });
    });

    test('1.3 Throughput calculation matches 1000 / avgMs to 4 decimal places', async () => {
      const records = [
        { kind: 'shadow', spec: 's1', standard_ms: 333.333, optimized_ms: 12.5 },
        { kind: 'shadow', spec: 's1', standard_ms: 333.333, optimized_ms: 12.5 }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        // avgStandardMs = 333.333 -> 1000 / 333.333 = 3.00003... -> 3.0000
        assert.equal(data.throughputStandard, 3.0);
        // avgOptimizedMs = 12.5 -> 1000 / 12.5 = 80.0
        assert.equal(data.throughputOptimized, 80.0);
      });
    });

    test('1.4 Per-spec math matches per-spec aggregate statistics', async () => {
      const records = [
        { kind: 'shadow', spec: 'specA', standard_ms: 100, optimized_ms: 20, speedup: 5.0, transfer_overhead_pct: 10, transfer_ms: 1, materialization_ms: 1 },
        { kind: 'shadow', spec: 'specA', standard_ms: 300, optimized_ms: 30, speedup: 10.0, transfer_overhead_pct: 20, transfer_ms: 3, materialization_ms: 3 },
        { kind: 'shadow', spec: 'specB', standard_ms: 50, optimized_ms: 50, speedup: 1.0, transfer_overhead_pct: 5, transfer_ms: 1, materialization_ms: 1 }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        const specA = data.perSpecStats.find((p) => p.spec === 'specA');
        const specB = data.perSpecStats.find((p) => p.spec === 'specB');

        assert(specA, 'specA exists');
        assert(specB, 'specB exists');

        assert.equal(specA.runs, 2);
        assert.equal(specA.avgStandardMs, 200.0);
        assert.equal(specA.medStandardMs, 200.0);
        assert.equal(specA.avgOptimizedMs, 25.0);
        assert.equal(specA.medOptimizedMs, 25.0);
        assert.equal(specA.throughputStandard, 5.0); // 1000 / 200
        assert.equal(specA.throughputOptimized, 40.0); // 1000 / 25
        assert.equal(specA.avgSpeedup, 7.5);
        assert.equal(specA.maxSpeedup, 10.0);
        assert.equal(specA.minSpeedup, 5.0);
        assert.equal(specA.wins, 2);
        assert.equal(specA.winRate, 100.0);
        assert.equal(specA.robustnessGap, 3.0); // 300 / 100
        assert.equal(specA.avgOverheadPct, 15.0);
        assert.equal(specA.avgTransferMs, 2.0);
        assert.equal(specA.avgMatMs, 2.0);

        assert.equal(specB.runs, 1);
        assert.equal(specB.wins, 0); // speedup 1.0 is not > 1
        assert.equal(specB.winRate, 0.0);
        assert.equal(specB.robustnessGap, null); // only 1 run
      });
    });
  });

  describe('Suite 2: Query Spec Descriptions in Metrics and Log', () => {
    test('2.1 All 7 canonical specs in specByName have non-empty descriptions in perSpecStats', async () => {
      // Create shadow records for all 7 catalog specs WITHOUT description field
      const canonicalNames = specs.map((s) => s.name);
      assert.equal(canonicalNames.length, 7, 'Expected 7 canonical specs');

      const records = canonicalNames.map((name) => ({
        kind: 'shadow',
        spec: name,
        standard_ms: 100,
        optimized_ms: 50,
        speedup: 2.0
      }));

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        assert.equal(data.perSpecStats.length, 7);
        for (const specStat of data.perSpecStats) {
          assert(specStat.description, `Description should exist for ${specStat.spec}`);
          assert.equal(typeof specStat.description, 'string');
          assert(specStat.description.length > 10, `Description for ${specStat.spec} must be substantive`);
          // Verify it matches canonical spec description from specByName
          assert.equal(specStat.description, specByName[specStat.spec].description);
        }
      });
    });

    test('2.2 All 7 canonical specs in specByName have non-empty descriptions projected in getPtLog', async () => {
      const canonicalNames = specs.map((s) => s.name);
      const records = canonicalNames.map((name) => ({
        kind: 'shadow',
        spec: name,
        standard_ms: 100,
        optimized_ms: 50
      }));

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtLog({}, res);
        const log = getState().data;

        assert.equal(log.length, 7);
        for (const entry of log) {
          assert(entry.description, `getPtLog entry for ${entry.spec} must include description`);
          assert.equal(entry.description, specByName[entry.spec].description);
        }
      });
    });

    test('2.3 Live-search specs receive descriptive fallback in perSpecStats', async () => {
      const records = [
        { kind: 'shadow', spec: 'live_search_wireless-headphones', standard_ms: 80, optimized_ms: 40, speedup: 2.0 }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        const stat = data.perSpecStats[0];
        assert(stat.description, 'Live-search spec must have description');
        assert(stat.description.includes('wireless-headphones'), 'Must mention the search term');
      });
    });

    test('2.4 Unknown custom specs receive benchmark fallback description in perSpecStats', async () => {
      const records = [
        { kind: 'shadow', spec: 'custom_synthetic_spec_42', standard_ms: 50, optimized_ms: 25, speedup: 2.0 }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        const stat = data.perSpecStats[0];
        assert(stat.description, 'Custom spec must have description');
        assert.equal(stat.description, 'Benchmark query spec custom_synthetic_spec_42');
      });
    });

    test('2.5 Explicit description stored in log record is preserved in both metrics and log', async () => {
      const customDesc = 'Custom user analysis for high-value orders';
      const records = [
        { kind: 'shadow', spec: 'custom_order_query', description: customDesc, standard_ms: 70, optimized_ms: 35, speedup: 2.0 }
      ];

      await withTempLog(records, async () => {
        // Test metrics
        const { res: resM, getState: getM } = createMockRes();
        await getPtMetrics({}, resM);
        assert.equal(getM().data.perSpecStats[0].description, customDesc);

        // Test log
        const { res: resL, getState: getL } = createMockRes();
        await getPtLog({}, resL);
        assert.equal(getL().data[0].description, customDesc);
      });
    });
  });

  describe('Suite 3: Edge Cases (Empty, 1 Record, Missing File, Zero Latencies)', () => {
    test('3.1 Missing log file returns totalRuns: 0, noData: true and empty log array', async () => {
      const nonExistentFile = path.join(os.tmpdir(), `nonexistent-log-${Date.now()}.jsonl`);
      const oldEnv = process.env.PT_LOG;
      process.env.PT_LOG = nonExistentFile;

      try {
        const { res: resM, getState: getM } = createMockRes();
        await getPtMetrics({}, resM);
        assert.deepEqual(getM().data, { totalRuns: 0, noData: true });

        const { res: resL, getState: getL } = createMockRes();
        await getPtLog({}, resL);
        assert.deepEqual(getL().data, []);
      } finally {
        if (oldEnv !== undefined) process.env.PT_LOG = oldEnv;
        else delete process.env.PT_LOG;
      }
    });

    test('3.2 Empty log file (0 bytes) returns totalRuns: 0, noData: true', async () => {
      await withTempLog([], async () => {
        const { res: resM, getState: getM } = createMockRes();
        await getPtMetrics({}, resM);
        assert.deepEqual(getM().data, { totalRuns: 0, noData: true });

        const { res: resL, getState: getL } = createMockRes();
        await getPtLog({}, resL);
        assert.deepEqual(getL().data, []);
      });
    });

    test('3.3 Exactly 1 record: robustnessGap is null, single medians/averages match', async () => {
      const records = [
        { kind: 'shadow', spec: 'rare_category_revenue_7d', standard_ms: 120.5, optimized_ms: 40.2, speedup: 3.0 }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        assert.equal(data.totalRuns, 1);
        assert.equal(data.avgStandardMs, 120.5);
        assert.equal(data.medStandardMs, 120.5);
        assert.equal(data.avgOptimizedMs, 40.2);
        assert.equal(data.medOptimizedMs, 40.2);
        assert.equal(data.robustnessGap, null, 'Single record must have null robustnessGap');
        assert.equal(data.throughputStandard, parseFloat((1000 / 120.5).toFixed(4)));
        assert.equal(data.throughputOptimized, parseFloat((1000 / 40.2).toFixed(4)));
        assert.equal(data.winRate, 100.0);
        assert.equal(data.avgSpeedup, 3.0);
        assert.equal(data.maxSpeedup, 3.0);
        assert.equal(data.minSpeedup, 3.0);
      });
    });

    test('3.4 Zero latency records: throughput is null without division by zero crash', async () => {
      const records = [
        { kind: 'shadow', spec: 'zero_latency', standard_ms: 0, optimized_ms: 0, speedup: 0 }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        assert.equal(data.totalRuns, 1);
        assert.equal(data.avgStandardMs, 0);
        assert.equal(data.avgOptimizedMs, 0);
        // Throughput when avg <= 0 must be null (not Infinity, not NaN)
        assert.equal(data.throughputStandard, null);
        assert.equal(data.throughputOptimized, null);
        // Robustness gap with 0 min value must be null
        assert.equal(data.robustnessGap, null);
      });
    });

    test('3.5 Speedup edge cases: all < 1, all = 1, null speedups', async () => {
      // Case A: All speedups < 1
      const slower = [
        { kind: 'shadow', spec: 's1', standard_ms: 10, optimized_ms: 20, speedup: 0.5 },
        { kind: 'shadow', spec: 's1', standard_ms: 10, optimized_ms: 30, speedup: 0.33 }
      ];
      await withTempLog(slower, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        assert.equal(getState().data.wins, 0);
        assert.equal(getState().data.winRate, 0.0);
      });

      // Case B: Ties (speedup = 1.0)
      const ties = [
        { kind: 'shadow', spec: 's1', standard_ms: 10, optimized_ms: 10, speedup: 1.0 }
      ];
      await withTempLog(ties, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        assert.equal(getState().data.wins, 0);
        assert.equal(getState().data.winRate, 0.0);
      });

      // Case C: Missing speedup property entirely
      const noSpeedup = [
        { kind: 'shadow', spec: 's1', standard_ms: 50, optimized_ms: 25 }
      ];
      await withTempLog(noSpeedup, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;
        assert.equal(data.wins, 0);
        assert.equal(data.winRate, 0.0);
        assert.equal(data.avgSpeedup, null);
        assert.equal(data.maxSpeedup, null);
        assert.equal(data.minSpeedup, null);
      });
    });
  });

  describe('Suite 4: Key Ingestion & Schema Parity (Legacy vs Updated)', () => {
    test('4.1 Legacy-only records (naive_ms, reduced_ms) emit standard and optimized keys', async () => {
      const records = [
        { kind: 'shadow', spec: 'rare_category_revenue_7d', naive_ms: 150, reduced_ms: 50, speedup: 3.0 }
      ];

      await withTempLog(records, async () => {
        const { res: resM, getState: getM } = createMockRes();
        await getPtMetrics({}, resM);
        const metrics = getM().data;

        assert.equal(metrics.avgStandardMs, 150);
        assert.equal(metrics.avgOptimizedMs, 50);
        assert.equal(metrics.medStandardMs, 150);
        assert.equal(metrics.medOptimizedMs, 50);

        const { res: resL, getState: getL } = createMockRes();
        await getPtLog({}, resL);
        const log = getL().data;

        assert.equal(log[0].standard_ms, 150);
        assert.equal(log[0].optimized_ms, 50);
        assert.equal(log[0].naive_ms, 150);
        assert.equal(log[0].reduced_ms, 50);
      });
    });

    test('4.2 Updated-only records (standard_ms, optimized_ms) emit naive and reduced aliases', async () => {
      const records = [
        { kind: 'shadow', spec: 'rare_category_revenue_7d', standard_ms: 180, optimized_ms: 60, speedup: 3.0 }
      ];

      await withTempLog(records, async () => {
        const { res: resM, getState: getM } = createMockRes();
        await getPtMetrics({}, resM);
        const metrics = getM().data;

        assert.equal(metrics.avgNaiveMs, 180);
        assert.equal(metrics.avgReducedMs, 60);
        assert.equal(metrics.medNaiveMs, 180);
        assert.equal(metrics.medReducedMs, 60);

        const { res: resL, getState: getL } = createMockRes();
        await getPtLog({}, resL);
        const log = getL().data;

        assert.equal(log[0].naive_ms, 180);
        assert.equal(log[0].reduced_ms, 60);
        assert.equal(log[0].standard_ms, 180);
        assert.equal(log[0].optimized_ms, 60);
      });
    });

    test('4.3 Mixed records in same log (legacy, new, dual, total_ms fallback)', async () => {
      const records = [
        { kind: 'shadow', spec: 's1', naive_ms: 100, reduced_ms: 20 },
        { kind: 'shadow', spec: 's1', standard_ms: 200, optimized_ms: 40 },
        { kind: 'shadow', spec: 's1', standard_ms: 300, naive_ms: 300, optimized_ms: 60, reduced_ms: 60 },
        { kind: 'shadow', spec: 's1', naive_ms: 400, total_ms: 80 } // total_ms fallback
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        assert.equal(data.totalRuns, 4);
        // standardTimes = [100, 200, 300, 400] -> avg = 250, med = 250
        assert.equal(data.avgStandardMs, 250.0);
        assert.equal(data.medStandardMs, 250.0);
        // optimizedTimes = [20, 40, 60, 80] -> avg = 50, med = 50
        assert.equal(data.avgOptimizedMs, 50.0);
        assert.equal(data.medOptimizedMs, 50.0);
      });
    });

    test('4.4 Nested best and worst_case project standard_ms and optimized_ms', async () => {
      const records = [
        {
          kind: 'shadow',
          spec: 'rare_category_revenue_7d',
          standard_ms: 500,
          optimized_ms: 100,
          best: {
            order: 'cat>p>oi>o>v',
            naive_ms: 80,
            reduced_ms: 40
          },
          worst_case: {
            order: 'v>o>oi>p>cat',
            naive_ms: 600,
            reduced_ms: 120
          }
        }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtLog({}, res);
        const log = getState().data;

        assert.equal(log[0].best.standard_ms, 80);
        assert.equal(log[0].best.optimized_ms, 40);
        assert.equal(log[0].best.naive_ms, 80);
        assert.equal(log[0].best.reduced_ms, 40);

        assert.equal(log[0].worst_case.standard_ms, 600);
        assert.equal(log[0].worst_case.optimized_ms, 120);
        assert.equal(log[0].worst_case.naive_ms, 600);
        assert.equal(log[0].worst_case.reduced_ms, 120);
      });
    });
  });

  describe('Suite 5: Unusual Payloads, Robustness & Malformed Lines', () => {
    test('5.1 Malformed lines are gracefully skipped in getPtMetrics and getPtLog', async () => {
      const records = [
        '{ invalid json line',
        '',
        '{"kind": "shadow", truncated',
        JSON.stringify({ kind: 'shadow', spec: 's1', standard_ms: 100, optimized_ms: 25, speedup: 4.0 }),
        'not a json at all :::',
        JSON.stringify({ kind: 'shadow', spec: 's1', standard_ms: 200, optimized_ms: 50, speedup: 4.0 })
      ];

      await withTempLog(records, async () => {
        const { res: resM, getState: getM } = createMockRes();
        await getPtMetrics({}, resM);
        assert.equal(getM().statusCode, 200);
        assert.equal(getM().data.totalRuns, 2);

        const { res: resL, getState: getL } = createMockRes();
        await getPtLog({}, resL);
        assert.equal(getL().statusCode, 200);
        assert.equal(getL().data.length, 2);
      });
    });

    test('5.2 Non-shadow records (kind: env, cap, spec) are ignored by getPtMetrics', async () => {
      const records = [
        { kind: 'env', node_version: 'v22.19.0' },
        { kind: 'spec', spec: 's1', sizes: {} },
        { kind: 'cap', spec: 's1', cap: 10000, transfer_ms: 50 },
        { kind: 'shadow', spec: 's1', standard_ms: 80, optimized_ms: 20, speedup: 4.0 }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        assert.equal(getState().data.totalRuns, 1);
        assert.equal(getState().data.avgStandardMs, 80.0);
      });
    });

    test('5.3 Null, undefined, or primitive best / worst_case handled safely in getPtLog', async () => {
      const records = [
        { kind: 'shadow', spec: 's1', standard_ms: 100, optimized_ms: 20, best: null, worst_case: null },
        { kind: 'shadow', spec: 's1', standard_ms: 100, optimized_ms: 20, best: 'invalid_string', worst_case: 12345 },
        { kind: 'shadow', spec: 's1', standard_ms: 100, optimized_ms: 20, best: { note: 'greedy match' }, worst_case: { error: 'timeout' } }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtLog({}, res);
        const data = getState().data;
        assert.equal(data[2].best, null); // records[0] (oldest) is at index 2 in reversed array
        assert.equal(data[1].best, 'invalid_string'); // records[1]
        assert.equal(data[0].best.note, 'greedy match'); // records[2] (newest) is at index 0
        assert.equal(data[0].worst_case.error, 'timeout');
      });
    });

    test('5.4 Log slice behavior: getPtLog returns maximum 100 entries, newest first', async () => {
      const records = [];
      for (let i = 0; i < 150; i++) {
        records.push({ kind: 'shadow', spec: 's1', seq: i, standard_ms: 100 + i, optimized_ms: 20 + i });
      }

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtLog({}, res);
        const data = getState().data;

        assert.equal(data.length, 100);
        // Newest entry first: seq 149
        assert.equal(data[0].seq, 149);
        // Oldest in the 100-slice: seq 50
        assert.equal(data[99].seq, 50);
      });
    });
  });

  describe('Suite 6: Stress Test Harness (Volume & Consistency)', () => {
    test('6.1 1,000 synthetic shadow records: stress test execution time, math stability', async () => {
      const records = [];
      for (let i = 1; i <= 1000; i++) {
        const std = 50 + (i % 200);
        const opt = 10 + (i % 50);
        const speedup = parseFloat((std / opt).toFixed(2));
        records.push({
          kind: 'shadow',
          spec: specs[i % specs.length].name,
          standard_ms: std,
          optimized_ms: opt,
          speedup,
          transfer_ms: 5,
          materialization_ms: 5,
          transfer_overhead_pct: 20.0
        });
      }

      await withTempLog(records, async () => {
        const start = Date.now();
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const elapsed = Date.now() - start;

        const data = getState().data;
        const expected = oracleMath(records);

        assert.equal(data.totalRuns, 1000);
        assert.equal(data.avgStandardMs, expected.avgStandardMs);
        assert.equal(data.avgOptimizedMs, expected.avgOptimizedMs);
        assert.equal(data.medStandardMs, expected.medStandardMs);
        assert.equal(data.medOptimizedMs, expected.medOptimizedMs);
        assert.equal(data.throughputStandard, expected.throughputStandard);
        assert.equal(data.throughputOptimized, expected.throughputOptimized);
        assert.equal(data.avgSpeedup, expected.avgSpeedup);
        assert.equal(data.maxSpeedup, expected.maxSpeedup);
        assert.equal(data.minSpeedup, expected.minSpeedup);
        assert.equal(data.robustnessGap, expected.robustnessGap);
        assert.equal(data.winRate, expected.winRate);

        // Verify speed & performance
        assert(elapsed < 500, `Execution took ${elapsed}ms, should be < 500ms`);

        // Check perSpecStats sum
        const totalSpecRuns = data.perSpecStats.reduce((sum, s) => sum + s.runs, 0);
        assert.equal(totalSpecRuns, 1000);

        // Check descriptions in all perSpecStats
        for (const specStat of data.perSpecStats) {
          assert(specStat.description && specStat.description.length > 0);
        }
      });
    });

    test('6.2 5,000 synthetic records: ensure linear scalability and no memory leak', async () => {
      const records = [];
      for (let i = 1; i <= 5000; i++) {
        records.push({
          kind: 'shadow',
          spec: 'rare_category_revenue_7d',
          standard_ms: 100 + (i % 50),
          optimized_ms: 20 + (i % 10),
          speedup: 5.0
        });
      }

      await withTempLog(records, async () => {
        const start = Date.now();
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const elapsed = Date.now() - start;

        const data = getState().data;
        assert.equal(data.totalRuns, 5000);
        assert(elapsed < 1000, `Execution took ${elapsed}ms for 5k records (expected < 1000ms)`);
      });
    });
  });

  describe('Suite 7: Schema Strictness & Timeline Properties', () => {
    test('7.1 Global and perSpec timeline: capped at 20 entries, oldest to newest', async () => {
      const records = [];
      for (let i = 0; i < 35; i++) {
        records.push({
          kind: 'shadow',
          spec: 'rare_category_revenue_7d',
          ts: `2026-10-27T10:${i < 10 ? '0' + i : i}:00.000Z`,
          standard_ms: 100 + i,
          optimized_ms: 20 + i,
          speedup: 5.0
        });
      }

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        // Global timeline capped at 20
        assert.equal(data.timeline.length, 20);
        assert.equal(data.timeline[0].ts, '2026-10-27T10:15:00.000Z'); // oldest in last 20
        assert.equal(data.timeline[19].ts, '2026-10-27T10:34:00.000Z'); // newest

        // Per-spec timeline capped at 20
        const specStat = data.perSpecStats[0];
        assert.equal(specStat.timeline.length, 20);
        assert.equal(specStat.timeline[0].ts, '2026-10-27T10:15:00.000Z');
        assert.equal(specStat.timeline[19].ts, '2026-10-27T10:34:00.000Z');

        // Check timeline items have both standard and optimized keys
        for (const item of data.timeline) {
          assert.equal(typeof item.standard_ms, 'number');
          assert.equal(typeof item.optimized_ms, 'number');
          assert.equal(typeof item.naive_ms, 'number');
          assert.equal(typeof item.reduced_ms, 'number');
        }
      });
    });

    test('7.2 Schema compliance: verify all contract keys from PROJECT.md in getPtMetrics', async () => {
      const records = [
        {
          kind: 'shadow',
          spec: 'user_scoped_spend_30d',
          standard_ms: 120,
          optimized_ms: 30,
          speedup: 4.0,
          transfer_ms: 5,
          materialization_ms: 3,
          transfer_overhead_pct: 26.7
        }
      ];

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const data = getState().data;

        const expectedKeys = [
          'totalRuns',
          'wins',
          'winRate',
          'avgStandardMs',
          'avgOptimizedMs',
          'medStandardMs',
          'medOptimizedMs',
          'throughputStandard',
          'throughputOptimized',
          'avgNaiveMs',
          'avgReducedMs',
          'medNaiveMs',
          'medReducedMs',
          'throughputNaive',
          'throughputReduced',
          'avgSpeedup',
          'maxSpeedup',
          'minSpeedup',
          'robustnessGap',
          'avgOverheadPct',
          'avgTransferMs',
          'avgMatMs',
          'perSpecStats',
          'timeline'
        ];

        for (const key of expectedKeys) {
          assert(key in data, `Missing required key in pt-metrics response: ${key}`);
        }

        const specKeys = [
          'spec',
          'description',
          'runs',
          'wins',
          'winRate',
          'avgStandardMs',
          'avgOptimizedMs',
          'medStandardMs',
          'medOptimizedMs',
          'throughputStandard',
          'throughputOptimized',
          'avgNaiveMs',
          'medNaiveMs',
          'avgReducedMs',
          'medReducedMs',
          'throughputNaive',
          'throughputReduced',
          'avgSpeedup',
          'maxSpeedup',
          'minSpeedup',
          'robustnessGap',
          'avgOverheadPct',
          'avgTransferMs',
          'avgMatMs',
          'timeline'
        ];

        const specStat = data.perSpecStats[0];
        for (const key of specKeys) {
          assert(key in specStat, `Missing required key in perSpecStats entry: ${key}`);
        }
      });
    });
  });
});

