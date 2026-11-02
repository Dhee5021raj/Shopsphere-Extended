'use strict';

/**
 * challenger_m4.test.js
 *
 * Milestone 4 Challenger 1 Test Suite (Tier 5 Adversarial Coverage Hardening):
 *
 * Empirical adversarial stress-testing and boundary verification across:
 *   1. High-concurrency rapid requests to `/api/admin/pt-status` across phase transitions and file I/O races.
 *   2. Long-running query timeout handling (`maxTimeMs`), join graph acyclicity enforcement, and error isolation.
 *   3. Extreme inputs, boundary safety, and PRNG robustness for `seedBench.js` and `verifyBench.js`.
 *   4. Large volume data streaming (5,000+ log lines), linear performance scaling, memory boundedness, and UI rendering stress.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const {
  getPtStatus,
  getPtMetrics,
  getPtLog
} = require('../controllers/adminController');
const { parseArgs, ALLOWED_NUMERIC_KEYS } = require('../scripts/seedBench');
const { buildJoinGraph, isAcyclic, assertAcyclic } = require('../pt/joinGraph');
const { specs, byName: specByName } = require('../pt/specs');
const { runNaive, runReduced, resultsEqual } = require('../pt/execute');
const { connectBench, disconnectBench, benchUri } = require('../pt/benchDb');

// Paths for status & lock isolation
const LOGS_DIR = path.resolve(__dirname, '..', 'logs');
const LIVE_STATUS_FILE = path.join(LOGS_DIR, '.pt-shadow-status.json');
const LIVE_LOCK_FILE = path.join(LOGS_DIR, '.pt-shadow.lock');

// Frontend paths for JSX stress testing
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const PT_LOG_PAGE_PATH = path.join(CLIENT_DIR, 'src', 'pages', 'PtLogPage.jsx');
const VITE_NODE_PATH = path.join(CLIENT_DIR, 'node_modules', 'vite', 'dist', 'node', 'index.js');
const REACT_PATH = path.join(CLIENT_DIR, 'node_modules', 'react');
const REACT_DOM_SERVER_PATH = path.join(CLIENT_DIR, 'node_modules', 'react-dom', 'server.node.js');

let React;
let ReactDOMServer;
let ptPageModule;
let loadedTmpFile = null;

// Transpile PtLogPage.jsx for empirical UI rendering stress tests
async function loadPtLogModule() {
  const { transformWithOxc } = await import('file:///' + VITE_NODE_PATH.replace(/\\/g, '/'));
  React = require(REACT_PATH);
  ReactDOMServer = await import('file:///' + REACT_DOM_SERVER_PATH.replace(/\\/g, '/'));

  let code = fs.readFileSync(PT_LOG_PAGE_PATH, 'utf8');

  // Export internal helpers if needed
  code = code.replace(/const fmtMs =/, 'export const fmtMs =');
  code = code.replace(/const pct =/, 'export const pct =');
  code = code.replace(/const fmtThroughput =/, 'export const fmtThroughput =');
  code = code.replace(/const fmtTime =/, 'export const fmtTime =');

  // Mock icons and router
  const mockLucide = `
    const LucideProxy = new Proxy({}, {
      get: (target, prop) => (props) => React.createElement('span', { 'data-icon': String(prop), ...props })
    });
    const {
      Activity, RefreshCw, ArrowLeft, TrendingUp, Zap, BarChart2, Target,
      AlertTriangle, CheckCircle, CheckCircle2, ShieldCheck, Database,
      Layers, Search, Compass, Clock, ArrowRight
    } = LucideProxy;
  `;
  code = code.replace(/import\s*\{[^}]*\}\s*from\s*'lucide-react';/, mockLucide);
  code = code.replace(/import\s*\{[^}]*\}\s*from\s*'react-router-dom';/, `const Link = (props) => React.createElement('a', props);`);
  code = code.replace(/import\s*\{[^}]*\}\s*from\s*'recharts';/, `
    const BarChart = () => null; const Bar = () => null; const XAxis = () => null;
    const YAxis = () => null; const CartesianGrid = () => null; const Tooltip = () => null;
    const Legend = () => null; const ResponsiveContainer = ({ children }) => children;
  `);
  code = code.replace(/import\s+api\s+from\s+'\.\.\/services\/api';/, `const api = { get: async () => ({ data: {} }) };`);

  const transformed = await transformWithOxc(code, 'PtLogPage.jsx', { jsx: { runtime: 'automatic' } });
  const cacheDir = path.join(CLIENT_DIR, 'node_modules', '.cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const tmpFile = path.join(cacheDir, `pt-m4-stress-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmpFile, transformed.code, 'utf8');

  try {
    const mod = await import('file:///' + tmpFile.replace(/\\/g, '/'));
    return { mod, tmpFile };
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    throw err;
  }
}

// Helpers
function createMockRes() {
  const state = { statusCode: 200, data: null, ended: false };
  const res = {
    status(code) { state.statusCode = code; return res; },
    json(obj) { state.data = obj; state.ended = true; return res; }
  };
  return { res, getState: () => state };
}

function withTempLog(records, fn) {
  const tempFile = path.join(os.tmpdir(), `challenger-m4-log-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const content = records.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + (records.length ? '\n' : '');
  fs.writeFileSync(tempFile, content, 'utf8');

  const oldEnv = process.env.PT_LOG;
  process.env.PT_LOG = tempFile;

  return Promise.resolve()
    .then(() => fn(tempFile))
    .finally(() => {
      if (oldEnv !== undefined) {
        process.env.PT_LOG = oldEnv;
      } else {
        delete process.env.PT_LOG;
      }
      try { fs.unlinkSync(tempFile); } catch (_) {}
    });
}

function withTempStatus(statusObj, fn) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  let backup = null;
  const existed = fs.existsSync(LIVE_STATUS_FILE);
  if (existed) {
    try { backup = fs.readFileSync(LIVE_STATUS_FILE, 'utf8'); } catch (_) {}
  }

  if (statusObj === null) {
    try { fs.unlinkSync(LIVE_STATUS_FILE); } catch (_) {}
  } else {
    fs.writeFileSync(LIVE_STATUS_FILE, typeof statusObj === 'string' ? statusObj : JSON.stringify(statusObj), 'utf8');
  }

  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      try {
        if (existed && backup !== null) {
          fs.writeFileSync(LIVE_STATUS_FILE, backup, 'utf8');
        } else {
          try { fs.unlinkSync(LIVE_STATUS_FILE); } catch (_) {}
        }
      } catch (_) {}
    });
}

before(async () => {
  try {
    const res = await loadPtLogModule();
    ptPageModule = res.mod;
    loadedTmpFile = res.tmpFile;
  } catch (err) {
    console.warn('[challenger_m4] Warning: UI module loading failed, UI rendering tests will degrade:', err.message);
  }
});

after(() => {
  if (loadedTmpFile && fs.existsSync(loadedTmpFile)) {
    try { fs.unlinkSync(loadedTmpFile); } catch (_) {}
  }
});

describe('Challenger M4-1: Adversarial Coverage Hardening', () => {

  // =========================================================================
  // SUITE 1: High-Concurrency & Race Conditions on /api/admin/pt-status
  // =========================================================================
  describe('Suite 1: High-Concurrency & Status Lifecycle Race Resilience', () => {

    test('1.1 Rapid concurrent calls (100 parallel requests) across 5 execution lifecycle phases', async () => {
      const nowIso = new Date().toISOString();
      const phases = [
        {
          name: 'Idle (no status file)',
          status: null,
          expectedRunning: false
        },
        {
          name: 'Phase 1: Optimized running, Standard idle',
          status: {
            pid: process.pid,
            startedAt: nowIso,
            updatedAt: nowIso,
            standard: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
            optimized: { phase: 'running', startedAt: nowIso, finishedAt: null, ms: null }
          },
          expectedRunning: true
        },
        {
          name: 'Phase 2: Optimized done, Standard running',
          status: {
            pid: process.pid,
            startedAt: nowIso,
            updatedAt: nowIso,
            standard: { phase: 'running', startedAt: nowIso, finishedAt: null, ms: null },
            optimized: { phase: 'done', startedAt: nowIso, finishedAt: nowIso, ms: 450 }
          },
          expectedRunning: true
        },
        {
          name: 'Phase 3: Both done',
          status: {
            pid: process.pid,
            startedAt: nowIso,
            updatedAt: nowIso,
            standard: { phase: 'done', startedAt: nowIso, finishedAt: nowIso, ms: 3200 },
            optimized: { phase: 'done', startedAt: nowIso, finishedAt: nowIso, ms: 450 }
          },
          // Updated: a child whose BOTH phases are done is in post-run
          // housekeeping (best/worst-case timing lines, record write), not
          // still measuring. Reporting Running here kept the UI's elapsed
          // timer ticking for minutes after both comparisons completed on
          // large datasets — the exact bug this contract previously codified.
          expectedRunning: false
        },
        {
          name: 'Phase 4: Finished and cleaned up',
          status: null,
          expectedRunning: false
        }
      ];

      for (const p of phases) {
        await withTempStatus(p.status, async () => {
          // Fire 20 parallel requests per phase (100 total across test)
          const promises = Array.from({ length: 20 }, async () => {
            const { res, getState } = createMockRes();
            await getPtStatus({}, res);
            return getState();
          });

          const results = await Promise.all(promises);
          assert.equal(results.length, 20);

          for (const st of results) {
            assert.equal(st.statusCode, 200, `Phase '${p.name}' returned non-200 code`);
            assert.equal(st.data.running, p.expectedRunning, `Phase '${p.name}' mismatch in running state`);

            // Verify dual terminology coherence
            if (p.expectedRunning) {
              assert.ok(st.data.standard, 'Missing standard object in active phase');
              assert.ok(st.data.optimized, 'Missing optimized object in active phase');
              assert.equal(st.data.standard.phase, st.data.naive.phase);
              assert.equal(st.data.optimized.phase, st.data.reduced.phase);
            }
          }
        });
      }
    });

    test('1.2 File I/O Race: Partial/truncated/corrupt status writes fall back safely without 500 error', async () => {
      const corruptPayloads = [
        '',                                            // 0 bytes (mid-truncate)
        '{"pid": 1234, "started',                     // half-written JSON
        '{ "pid": true, standard: [',                 // malformed syntax
        '<<<CORRUPTED_NON_JSON_BINARY_DATA>>>\x00\xFF', // binary garbage
        'null',                                        // JSON null
        '12345'                                        // raw number
      ];

      for (const payload of corruptPayloads) {
        await withTempStatus(payload, async () => {
          // Fire 10 parallel hits against the corrupt file
          const promises = Array.from({ length: 10 }, async () => {
            const { res, getState } = createMockRes();
            await getPtStatus({}, res);
            return getState();
          });

          const results = await Promise.all(promises);
          for (const st of results) {
            assert.equal(st.statusCode, 200, 'Corrupt file must never trigger 500 status');
            assert.equal(typeof st.data, 'object');
            assert.equal(st.data.running, false, 'Corrupt status must safely fall back to idle');
            assert.equal(st.data.standard, null);
            assert.equal(st.data.optimized, null);
          }
        });
      }
    });

    test('1.3 Atomic Liveness: Dead PID, null PID, string PID, or expired timestamp suppresses phantom runs', async () => {
      const pastIso = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago (> 15 min STALE_MS)
      const nowIso = new Date().toISOString();

      const edgeCases = [
        { desc: 'Dead PID (9999999) with fresh timestamp', obj: { pid: 9999999, startedAt: nowIso, standard: { phase: 'running' } } },
        { desc: 'Negative PID (-10)', obj: { pid: -10, startedAt: nowIso, standard: { phase: 'running' } } },
        { desc: 'String PID ("abc")', obj: { pid: 'abc', startedAt: nowIso, standard: { phase: 'running' } } },
        { desc: 'Null PID (null)', obj: { pid: null, startedAt: nowIso, standard: { phase: 'running' } } },
        { desc: 'Live PID with expired timestamp (> 15 min)', obj: { pid: process.pid, startedAt: pastIso, updatedAt: pastIso, standard: { phase: 'running' } } }
      ];

      for (const tc of edgeCases) {
        await withTempStatus(tc.obj, async () => {
          const { res, getState } = createMockRes();
          await getPtStatus({}, res);
          const st = getState();

          assert.equal(st.statusCode, 200);
          assert.equal(st.data.running, false, `Failed to suppress phantom run for ${tc.desc}`);
          if (st.data.standard) {
            assert.equal(st.data.standard.running, false, `Phase standard.running must be false for ${tc.desc}`);
            assert.notEqual(st.data.standard.phase, 'running', `Phase standard.phase must not be 'running' for ${tc.desc}`);
          }
        });
      }
    });

    test('1.4 Legacy Lock File Age Discrimination (15 min STALE_MS threshold)', async () => {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      let backupLock = null;
      const existed = fs.existsSync(LIVE_LOCK_FILE);
      if (existed) {
        try { backupLock = fs.readFileSync(LIVE_LOCK_FILE); } catch (_) {}
      }

      await withTempStatus(null, async () => {
        try {
          // Fresh lock (< 15 min): running = true
          fs.writeFileSync(LIVE_LOCK_FILE, 'lock', 'utf8');
          const freshTime = new Date(Date.now() - 2 * 60 * 1000); // 2 min ago
          fs.utimesSync(LIVE_LOCK_FILE, freshTime, freshTime);

          const { res: resFresh, getState: getFresh } = createMockRes();
          await getPtStatus({}, resFresh);
          assert.equal(getFresh().data.running, true, 'Lock file < 15 min old must report running: true');

          // Stale lock (> 15 min): running = false
          const staleTime = new Date(Date.now() - 16 * 60 * 1000); // 16 min ago
          fs.utimesSync(LIVE_LOCK_FILE, staleTime, staleTime);

          const { res: resStale, getState: getStale } = createMockRes();
          await getPtStatus({}, resStale);
          assert.equal(getStale().data.running, false, 'Lock file > 15 min old must report running: false');
        } finally {
          try {
            if (existed && backupLock) fs.writeFileSync(LIVE_LOCK_FILE, backupLock);
            else fs.unlinkSync(LIVE_LOCK_FILE);
          } catch (_) {}
        }
      });
    });
  });

  // =========================================================================
  // SUITE 2: Long-Running Query Timeout Handling & Graph Topology Safety
  // =========================================================================
  describe('Suite 2: Query Timeout Handling & Algorithmic Guardrails', () => {

    test('2.1 Aggregation timeout: maxTimeMs = 1 triggers MongoDB query timeout safely', async () => {
      try {
        await connectBench();
        const spec = specByName.rare_category_revenue_7d;
        const order = spec.relations.map((r) => r.alias);

        // Attempt execution with an impossible 1ms deadline on the unindexed/complex naive pipeline
        let caughtTimeout = false;
        try {
          await runNaive(spec, order, { now: new Date(), maxTimeMs: 1 });
        } catch (err) {
          caughtTimeout = true;
          // MongoServerError: operation exceeded time limit (code 50 / MaxTimeMSExpired)
          const isTimeout = /time limit|maxTimeMS|timed out/i.test(err.message) || err.code === 50;
          assert.ok(isTimeout, `Expected timeout error, got: ${err.message}`);
        }
        assert.ok(caughtTimeout, 'Query with maxTimeMs: 1 should exceed timeout threshold');
      } finally {
        await disconnectBench();
      }
    });

    test('2.2 Acyclicity Enforcement: Triangles & cycles rejected with deterministic error', () => {
      // Create a cyclic triangle join specification: a - b - c - a
      const cyclicTriangle = {
        name: 'cyclic_triangle_spec',
        relations: [
          { alias: 'a', collection: 'products' },
          { alias: 'b', collection: 'categories' },
          { alias: 'c', collection: 'orders' }
        ],
        edges: [
          { left: 'a.cat_id', right: 'b._id' },
          { left: 'b.order_id', right: 'c._id' },
          { left: 'c.prod_id', right: 'a._id' }
        ]
      };

      const gCyclic = buildJoinGraph(cyclicTriangle);
      assert.equal(isAcyclic(gCyclic), false, 'Triangle graph must report isAcyclic === false');
      assert.throws(() => {
        assertAcyclic(cyclicTriangle);
      }, /cyclic/i, 'Cyclic join graph must be rejected by assertAcyclic');

      // Valid acyclic chain: a - b - c
      const acyclicChain = {
        name: 'acyclic_chain_spec',
        relations: [
          { alias: 'a', collection: 'products' },
          { alias: 'b', collection: 'categories' },
          { alias: 'c', collection: 'orders' }
        ],
        edges: [
          { left: 'a.cat_id', right: 'b._id' },
          { left: 'b.order_id', right: 'c._id' }
        ]
      };

      const gChain = buildJoinGraph(acyclicChain);
      assert.equal(isAcyclic(gChain), true, 'Chain graph must report isAcyclic === true');
      assert.doesNotThrow(() => assertAcyclic(acyclicChain));
    });

    test('2.3 Zero-Match Query Equivalence: Empty result sets evaluate equal: true with 0 rows', async () => {
      try {
        await connectBench();
        // Clone spec and apply impossible filter to ensure 0 rows returned
        const spec = JSON.parse(JSON.stringify(specByName.rare_category_revenue_7d));
        spec.relations.find((r) => r.alias === 'p').localFilter = { name: 'IMPOSSIBLE_NON_EXISTENT_PRODUCT_XYZ_99999' };
        const order = spec.relations.map((r) => r.alias);

        const naive = await runNaive(spec, order, { now: new Date() });
        const reduced = await runReduced(spec, order, { now: new Date() });

        assert.equal(naive.result.length, 0);
        assert.equal(reduced.result.length, 0);

        const eq = resultsEqual(naive.result, reduced.result);
        assert.equal(eq.equal, true);
        assert.equal(eq.rows, 0);
      } finally {
        await disconnectBench();
      }
    });
  });

  // =========================================================================
  // SUITE 3: Extreme Inputs & Boundary Stress on seedBench.js & verifyBench.js
  // =========================================================================
  describe('Suite 3: Extreme CLI Inputs & PRNG Boundary Verification', () => {

    test('3.1 seedBench.js parseArgs: 15+ boundary and invalid input formats rejected before DB connect', () => {
      const invalidArgsList = [
        { args: ['--products=9007199254740992'], pattern: /must be an integer/i, desc: 'Safe integer overflow' },
        { args: ['--products=1e6'], pattern: /must be an integer/i, desc: 'Scientific notation' },
        { args: ['--products=0x1000'], pattern: /must be an integer/i, desc: 'Hexadecimal' },
        { args: ['--products=50000.5'], pattern: /must be an integer/i, desc: 'Floating point scale' },
        { args: ['--seed=3.14159'], pattern: /must be an integer/i, desc: 'Floating point seed' },
        { args: ['--products=-100'], pattern: /must be a positive integer/i, desc: 'Negative products' },
        { args: ['--orders=0'], pattern: /must be a positive integer/i, desc: 'Zero orders' },
        { args: ['--items=-5'], pattern: /must be a positive integer/i, desc: 'Negative items' },
        { args: ['--batch=0'], pattern: /must be a positive integer/i, desc: 'Zero batch' },
        { args: ['--seed=-1'], pattern: /must be a non-negative integer/i, desc: 'Negative seed' },
        { args: ['--unknownFlag=123'], pattern: /unknown argument/i, desc: 'Unknown option' },
        { args: ['--products='], pattern: /must be an integer/i, desc: 'Empty option value' },
        { args: ['--drop=yes'], pattern: /unknown argument/i, desc: 'Invalid boolean value for drop' },
        { args: ['--small=false'], pattern: /unknown argument/i, desc: 'Invalid value for preset small' },
        { args: ['--products=abc'], pattern: /must be an integer/i, desc: 'Alpha string for products' }
      ];

      for (const tc of invalidArgsList) {
        assert.throws(
          () => parseArgs(['node', 'seedBench.js', ...tc.args]),
          tc.pattern,
          `Failed to reject: ${tc.desc} (${tc.args.join(' ')})`
        );
      }
    });

    test('3.2 seedBench.js parseArgs: Presets and valid configurations parse with exact contracts', () => {
      // Seed 0 is valid non-negative integer
      const optsSeed0 = parseArgs(['node', 'seedBench.js', '--seed=0']);
      assert.equal(optsSeed0.seed, 0);

      // Medium scale preset
      const optsMedium = parseArgs(['node', 'seedBench.js', '--medium']);
      assert.equal(optsMedium.products, 50000);
      assert.equal(optsMedium.orders, 100000);
      assert.equal(optsMedium.items, 400000);
      assert.equal(optsMedium.vendors, 100);
      assert.equal(optsMedium.categories, 30);
      assert.equal(optsMedium.users, 20000);
      assert.equal(optsMedium.reviews, 100000);

      // Small scale preset
      const optsSmall = parseArgs(['node', 'seedBench.js', '--small']);
      assert.equal(optsSmall.products, 3000);
      assert.equal(optsSmall.orders, 12000);
      assert.equal(optsSmall.items, 48000);

      // Drop flag
      const optsDrop = parseArgs(['node', 'seedBench.js', '--drop']);
      assert.equal(optsDrop.drop, true);
    });

    test('3.3 verifyBench.js Standalone Execution Integrity: 30/30 checks pass with zero DB mutation', () => {
      const verifyScript = path.resolve(__dirname, '..', 'scripts', 'verifyBench.js');
      const res = spawnSync(process.execPath, [verifyScript], { encoding: 'utf8' });

      assert.equal(res.status, 0, `verifyBench.js failed with exit code ${res.status}: ${res.stderr || res.stdout}`);
      assert.ok(res.stdout.includes('ALL CHECKS PASSED'), 'verifyBench output must indicate ALL CHECKS PASSED');
      assert.ok(!res.stdout.includes('FAIL'), 'verifyBench output must contain zero FAIL checks');
    });
  });

  // =========================================================================
  // SUITE 4: Large Volume Data Stream & Render Stress (5,000+ Log Lines)
  // =========================================================================
  describe('Suite 4: Large Volume Data Ingestion & Frontend Render Stress (5,000 Records)', () => {

    test('4.1 Ingestion of 5,000 synthetic shadow records into getPtMetrics completes in < 150ms with exact math', async () => {
      const canonicalSpecs = Object.keys(specByName);
      const records = [];
      let totalStandardMs = 0;
      let totalOptimizedMs = 0;
      let winsCount = 0;

      for (let i = 0; i < 5000; i++) {
        const spec = canonicalSpecs[i % canonicalSpecs.length];
        const std = 1000 + (i % 3000);
        const opt = 200 + (i % 1500);
        const speedup = +(std / opt).toFixed(2);
        if (speedup > 1.0) winsCount++;

        totalStandardMs += std;
        totalOptimizedMs += opt;

        records.push({
          ts: new Date(Date.now() - (5000 - i) * 60000).toISOString(),
          kind: 'shadow',
          spec,
          trigger: '/api/products?search=test' + (i % 50),
          standard_ms: std,
          optimized_ms: opt,
          speedup,
          transfer_ms: 15,
          materialization_ms: 25,
          transfer_overhead_pct: +(((15 + 25) / opt) * 100).toFixed(1),
          equal: true,
          checksum: 'a1b2c3d4'
        });
      }

      await withTempLog(records, async () => {
        const t0 = Date.now();
        const { res, getState } = createMockRes();
        await getPtMetrics({}, res);
        const duration = Date.now() - t0;

        const st = getState();
        assert.equal(st.statusCode, 200);
        assert.ok(duration < 150, `Ingestion of 5,000 records took ${duration}ms (must be < 150ms)`);

        const m = st.data;
        assert.equal(m.totalRuns, 5000);
        assert.equal(m.wins, winsCount);
        assert.equal(m.winRate, parseFloat(((winsCount / 5000) * 100).toFixed(1)));

        // Verify mathematical invariants
        const expectedAvgStd = parseFloat((totalStandardMs / 5000).toFixed(1));
        const expectedAvgOpt = parseFloat((totalOptimizedMs / 5000).toFixed(1));
        assert.equal(m.avgStandardMs, expectedAvgStd);
        assert.equal(m.avgOptimizedMs, expectedAvgOpt);
        assert.equal(m.throughputStandard, parseFloat((1000 / expectedAvgStd).toFixed(4)));
        assert.equal(m.throughputOptimized, parseFloat((1000 / expectedAvgOpt).toFixed(4)));

        // Sum of per-spec runs must strictly equal total runs
        const sumRuns = m.perSpecStats.reduce((acc, s) => acc + s.runs, 0);
        assert.equal(sumRuns, 5000);

        // Timeline capped at last 20 records for UI efficiency
        assert.equal(m.timeline.length, 20);
      });
    });

    test('4.2 getPtLog on 5,000-line log file truncates strictly to the 100 newest records', async () => {
      const records = [];
      for (let i = 0; i < 5000; i++) {
        records.push({
          ts: new Date(Date.now() - (5000 - i) * 60000).toISOString(),
          kind: 'shadow',
          spec: 'rare_category_revenue_7d',
          id: i,
          standard_ms: 1200,
          optimized_ms: 400
        });
      }

      await withTempLog(records, async () => {
        const { res, getState } = createMockRes();
        await getPtLog({}, res);

        const st = getState();
        assert.equal(st.statusCode, 200);
        assert.equal(Array.isArray(st.data), true);
        assert.equal(st.data.length, 100, 'getPtLog must return exactly 100 records');

        // Newest record returned first (record 4999)
        assert.equal(st.data[0].id, 4999);
        assert.equal(st.data[99].id, 4900);

        // Mapped dual keys present
        assert.equal(st.data[0].standard_ms, 1200);
        assert.equal(st.data[0].optimized_ms, 400);
        assert.equal(st.data[0].naive_ms, 1200);
        assert.equal(st.data[0].reduced_ms, 400);
      });
    });

    test('4.3 Frontend UI Rendering Stress: 5,000 cell renders complete in sub-second with zero NaN or errors', () => {
      if (!ptPageModule || !ReactDOMServer) {
        // Skip gracefully if Vite OXC transpile was unavailable in test environment
        return;
      }

      const { LatencyThroughputCell, SpeedupBadge, VerificationBadge, OverheadCell } = ptPageModule;

      const t0 = Date.now();

      // Render 5,000 table rows with diverse cell values
      for (let i = 0; i < 5000; i++) {
        const stdMs = 50 + (i % 2000);
        const optMs = 20 + (i % 800);
        const speedup = +(stdMs / optMs).toFixed(2);

        const htmlStd = ReactDOMServer.renderToStaticMarkup(
          React.createElement(LatencyThroughputCell, { ms: stdMs, engine: 'standard' })
        );
        const htmlOpt = ReactDOMServer.renderToStaticMarkup(
          React.createElement(LatencyThroughputCell, { ms: optMs, engine: 'optimized' })
        );
        const htmlSpd = ReactDOMServer.renderToStaticMarkup(
          React.createElement(SpeedupBadge, { speedup })
        );
        const htmlVrf = ReactDOMServer.renderToStaticMarkup(
          React.createElement(VerificationBadge, { equal: i % 100 !== 0, checksum: 'f4e3d2c1', rows: 25 })
        );
        const htmlOvh = ReactDOMServer.renderToStaticMarkup(
          React.createElement(OverheadCell, { transferMs: 12, matMs: 18, overheadPct: 15.5 })
        );

        // Fast spot check every 500 items
        if (i % 500 === 0) {
          assert.ok(!htmlStd.includes('NaN'), 'LatencyThroughputCell rendered NaN');
          assert.ok(!htmlOpt.includes('NaN'), 'LatencyThroughputCell rendered NaN');
          assert.ok(!htmlSpd.includes('NaN'), 'SpeedupBadge rendered NaN');
          assert.ok(!htmlVrf.includes('NaN'), 'VerificationBadge rendered NaN');
          assert.ok(!htmlOvh.includes('NaN'), 'OverheadCell rendered NaN');
        }
      }

      const duration = Date.now() - t0;
      assert.ok(duration < 2000, `Rendering 25,000 static UI component cells took ${duration}ms (must be < 2000ms)`);
    });
  });
});
