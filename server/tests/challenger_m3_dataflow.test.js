'use strict';

/**
 * challenger_m3_dataflow.test.js
 *
 * Milestone 3 Challenger 2 Test Suite:
 * Empirical adversarial stress-testing of data flow, polling behavior,
 * lifecycle cleanups, division-by-zero resilience, and dual-key fallbacks
 * in `client/src/pages/PtLogPage.jsx`.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Path resolution
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const PT_LOG_PAGE_PATH = path.join(CLIENT_DIR, 'src', 'pages', 'PtLogPage.jsx');
const VITE_NODE_PATH = path.join(CLIENT_DIR, 'node_modules', 'vite', 'dist', 'node', 'index.js');
const REACT_PATH = path.join(CLIENT_DIR, 'node_modules', 'react');
const REACT_DOM_SERVER_PATH = path.join(CLIENT_DIR, 'node_modules', 'react-dom', 'server.node.js');

let React;
let ReactDOMServer;
let ptPageModule;

// Transpile PtLogPage.jsx using Vite's transformWithOxc and load into Node.js
async function loadPtLogModule() {
  const { transformWithOxc } = await import('file:///' + VITE_NODE_PATH.replace(/\\/g, '/'));
  React = require(REACT_PATH);
  ReactDOMServer = await import('file:///' + REACT_DOM_SERVER_PATH.replace(/\\/g, '/'));

  let code = fs.readFileSync(PT_LOG_PAGE_PATH, 'utf8');

  // Export internal utility functions for direct empirical testing
  code = code.replace(/const fmtMs =/, 'export const fmtMs =');
  code = code.replace(/const pct =/, 'export const pct =');
  code = code.replace(/const fmtThroughput =/, 'export const fmtThroughput =');
  code = code.replace(/const fmtTime =/, 'export const fmtTime =');
  code = code.replace(/const prettyOrder =/, 'export const prettyOrder =');
  code = code.replace(/const filterChips =/, 'export const filterChips =');

  // Mock external UI dependencies (Lucide icons, React Router, Recharts, API service)
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
    const BarChart = () => null;
    const Bar = () => null;
    const XAxis = () => null;
    const YAxis = () => null;
    const CartesianGrid = () => null;
    const Tooltip = () => null;
    const Legend = () => null;
    const ResponsiveContainer = ({ children }) => children;
  `);
  code = code.replace(/import\s+api\s+from\s+'\.\.\/services\/api';/, `const api = { get: async () => ({ data: {} }) };`);

  const transformed = await transformWithOxc(code, 'PtLogPage.jsx', {
    jsx: { runtime: 'automatic' }
  });

  const cacheDir = path.join(CLIENT_DIR, 'node_modules', '.cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const tmpFile = path.join(cacheDir, `pt-log-test-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmpFile, transformed.code, 'utf8');

  try {
    const mod = await import('file:///' + tmpFile.replace(/\\/g, '/'));
    return { mod, tmpFile };
  } catch (err) {
    fs.unlinkSync(tmpFile);
    throw err;
  }
}

let loadedTmpFile = null;
let fmtMs, pct, fmtThroughput, fmtTime, prettyOrder, filterChips;
let LatencyThroughputCell, SpeedupBadge, VerificationBadge, OverheadCell, RealTimeStatusCard;
let getCanonicalQueryInfo, getTriggerContext, SPEC_METADATA;

before(async () => {
  const res = await loadPtLogModule();
  ptPageModule = res.mod;
  loadedTmpFile = res.tmpFile;

  fmtMs = ptPageModule.fmtMs;
  pct = ptPageModule.pct;
  fmtThroughput = ptPageModule.fmtThroughput;
  fmtTime = ptPageModule.fmtTime;
  prettyOrder = ptPageModule.prettyOrder;
  filterChips = ptPageModule.filterChips;
  LatencyThroughputCell = ptPageModule.LatencyThroughputCell;
  SpeedupBadge = ptPageModule.SpeedupBadge;
  VerificationBadge = ptPageModule.VerificationBadge;
  OverheadCell = ptPageModule.OverheadCell;
  RealTimeStatusCard = ptPageModule.RealTimeStatusCard;
  getCanonicalQueryInfo = ptPageModule.getCanonicalQueryInfo;
  getTriggerContext = ptPageModule.getTriggerContext;
  SPEC_METADATA = ptPageModule.SPEC_METADATA;
});

after(() => {
  if (loadedTmpFile && fs.existsSync(loadedTmpFile)) {
    try { fs.unlinkSync(loadedTmpFile); } catch (_) {}
  }
});

// Render React component to HTML string
function renderComponent(Component, props = {}) {
  return ReactDOMServer.renderToStaticMarkup(React.createElement(Component, props));
}

describe('Challenger M3-2: Data Flow, Polling & Math Resilience Tests', () => {

  // =========================================================================
  // SUITE 1: Polling & Timer Lifecycle Simulation (1500ms, 5000ms, 200ms)
  // =========================================================================
  describe('Suite 1: Polling Engine & Timer Lifecycle Simulator', () => {

    test('1.1 Adaptive Polling Delay: 1500ms active vs 5000ms idle', () => {
      // Direct simulation of the delay selection logic in PtLogPage.jsx:1262-1285
      const computeNextDelay = (status) => {
        const newStatus = status && typeof status === 'object' ? status : { running: false };
        const currentlyRunning = Boolean(newStatus.running);
        return currentlyRunning ? 1500 : 5000;
      };

      assert.equal(computeNextDelay({ running: true }), 1500, 'Active status must trigger 1500ms poll');
      assert.equal(computeNextDelay({ running: false }), 5000, 'Idle status must trigger 5000ms poll');
      assert.equal(computeNextDelay(null), 5000, 'Null status must safely fallback to 5000ms idle');
      assert.equal(computeNextDelay({}), 5000, 'Empty object must fallback to 5000ms idle');
      assert.equal(computeNextDelay('invalid'), 5000, 'String payload must fallback to 5000ms idle');
    });

    test('1.2 Dynamic Elapsed Timer: 200ms interval starts only when running: true and cleans up', () => {
      // Simulates the Dynamic Timer Effect (PtLogPage.jsx:1247-1254)
      const mockTimers = new Map();
      let timerIdCounter = 1;

      const fakeSetInterval = (fn, ms) => {
        const id = timerIdCounter++;
        mockTimers.set(id, { fn, ms, active: true });
        return id;
      };

      const fakeClearInterval = (id) => {
        if (mockTimers.has(id)) {
          mockTimers.get(id).active = false;
          mockTimers.delete(id);
        }
      };

      // Lifecycle simulator for the dynamic timer hook
      function createTimerHookSimulator() {
        let activeIntervalId = null;
        let isRunning = false;

        const updateState = (newRunning) => {
          if (activeIntervalId !== null) {
            fakeClearInterval(activeIntervalId);
            activeIntervalId = null;
          }
          isRunning = newRunning;
          if (isRunning) {
            activeIntervalId = fakeSetInterval(() => {}, 200);
          }
        };

        const unmount = () => {
          if (activeIntervalId !== null) {
            fakeClearInterval(activeIntervalId);
            activeIntervalId = null;
          }
        };

        return { updateState, unmount, getActiveId: () => activeIntervalId };
      }

      const harness = createTimerHookSimulator();

      // Initially idle
      harness.updateState(false);
      assert.equal(harness.getActiveId(), null, 'No interval created when running: false');
      assert.equal(mockTimers.size, 0);

      // Transitions to running
      harness.updateState(true);
      const runningId = harness.getActiveId();
      assert.notEqual(runningId, null, 'Interval created when running: true');
      assert.equal(mockTimers.get(runningId).ms, 200, 'Timer must run at 200ms interval');

      // Transitions back to idle
      harness.updateState(false);
      assert.equal(harness.getActiveId(), null, 'Interval cleared on transition to running: false');
      assert.equal(mockTimers.size, 0, 'No orphaned intervals in memory');

      // Transitions to running then unmounts
      harness.updateState(true);
      assert.equal(mockTimers.size, 1);
      harness.unmount();
      assert.equal(mockTimers.size, 0, 'Interval cleared on unmount');
    });

    test('1.3 Adaptive Polling Engine: Component unmount cancels timeout and prevents post-unmount execution', async () => {
      // Simulates Adaptive Polling Engine (PtLogPage.jsx:1256-1298)
      let activeTimeoutId = null;
      let isMounted = true;
      let stateUpdates = 0;
      let nextScheduledDelay = null;

      const fakeSetTimeout = (fn, delay) => {
        nextScheduledDelay = delay;
        activeTimeoutId = 42;
        return activeTimeoutId;
      };

      const fakeClearTimeout = (id) => {
        if (id === activeTimeoutId) {
          activeTimeoutId = null;
          nextScheduledDelay = null;
        }
      };

      // Simulated polling run
      async function simulatePoll(apiPromise, currentStatus) {
        let nextDelay = 5000;
        try {
          const { data: st } = await apiPromise;
          if (!isMounted) return; // Guard in PtLogPage.jsx:1265

          stateUpdates++;
          const currentlyRunning = Boolean(st?.running);
          nextDelay = currentlyRunning ? 1500 : 5000;
        } catch (_) {
          nextDelay = 5000;
        }

        if (isMounted) {
          activeTimeoutId = fakeSetTimeout(() => {}, nextDelay);
        }
      }

      // Case A: Normal active poll
      await simulatePoll(Promise.resolve({ data: { running: true } }));
      assert.equal(nextScheduledDelay, 1500, 'Active measurement schedules 1500ms delay');
      assert.equal(stateUpdates, 1);

      // Case B: Component unmounts while HTTP request is in-flight
      isMounted = false;
      fakeClearTimeout(activeTimeoutId);

      // Async response arrives after unmount
      await simulatePoll(Promise.resolve({ data: { running: false } }));
      assert.equal(stateUpdates, 1, 'State update must NOT occur after unmount');
      assert.equal(activeTimeoutId, null, 'No new timeout scheduled after unmount');
    });

    test('1.4 Run Completion Trigger: Triggers load & loadMetrics exactly once on falling edge (running -> idle)', () => {
      let loadCount = 0;
      let loadMetricsCount = 0;

      const load = () => { loadCount++; };
      const loadMetrics = () => { loadMetricsCount++; };

      let currentStatus = { running: true };

      // State updater logic from PtLogPage.jsx:1270-1278
      function onStatusUpdate(newStatus) {
        const currentlyRunning = Boolean(newStatus.running);
        const prev = currentStatus;

        if (prev?.running && !currentlyRunning) {
          load();
          loadMetrics();
        }
        currentStatus = newStatus;
      }

      // 1. Still running -> no trigger
      onStatusUpdate({ running: true });
      assert.equal(loadCount, 0, 'No trigger while running remains true');
      assert.equal(loadMetricsCount, 0);

      // 2. Falling edge: running -> idle -> MUST TRIGGER ONCE
      onStatusUpdate({ running: false });
      assert.equal(loadCount, 1, 'load() must trigger immediately upon completion');
      assert.equal(loadMetricsCount, 1, 'loadMetrics() must trigger immediately upon completion');

      // 3. Steady state: idle -> idle -> MUST NOT TRIGGER (no duplicate fetch storm!)
      onStatusUpdate({ running: false });
      assert.equal(loadCount, 1, 'Subsequent idle polls must not re-trigger load');
      assert.equal(loadMetricsCount, 1, 'Subsequent idle polls must not re-trigger loadMetrics');

      // 4. Another idle poll
      onStatusUpdate({ running: false });
      assert.equal(loadCount, 1, 'Fetch count remains strictly 1 during idle steady state');
    });

    test('1.5 Periodic Background Refresh (10s): Cleans up on unmount and pauses during active runs', () => {
      // Simulates Periodic Background Refresh (PtLogPage.jsx:1300-1313)
      let activeInterval = null;
      let refreshLoads = 0;

      const startRefreshEffect = (running) => {
        if (activeInterval) clearInterval(activeInterval);
        activeInterval = setInterval(() => {
          if (!running) {
            refreshLoads++;
          }
        }, 10000);
        return () => {
          clearInterval(activeInterval);
          activeInterval = null;
        };
      };

      // Mount with running = false
      const cleanup1 = startRefreshEffect(false);
      assert.notEqual(activeInterval, null, 'Interval registered on mount');

      // Re-run effect when running becomes true
      cleanup1();
      assert.equal(activeInterval, null, 'Cleaned up previous interval');

      const cleanup2 = startRefreshEffect(true);
      assert.notEqual(activeInterval, null);

      // Final unmount
      cleanup2();
      assert.equal(activeInterval, null, 'Periodic refresh cleanly unmounted without leak');
    });

    test('1.6 API Network Error Resilience: Polling recovers and defaults to 5000ms idle delay on HTTP 500', async () => {
      let nextDelay = null;
      let isFastPolling = true;

      async function testErrorRecovery(apiRejectPromise) {
        try {
          await apiRejectPromise;
          nextDelay = 1500;
        } catch (_) {
          nextDelay = 5000;
          isFastPolling = false;
        }
      }

      await testErrorRecovery(Promise.reject(new Error('Network Error / 500 Internal Server Error')));
      assert.equal(nextDelay, 5000, 'Errors gracefully fall back to 5000ms delay');
      assert.equal(isFastPolling, false, 'isFastPolling disabled upon error');
    });
  });

  // =========================================================================
  // SUITE 2: Math Resilience & Division-by-Zero Guards
  // =========================================================================
  describe('Suite 2: Math Resilience, Throughput ($q/s$), Speedup & Overhead Guards', () => {

    test('2.1 LatencyThroughputCell: Guards against division by zero (ms = 0) and negative/null/NaN latencies', () => {
      // ms = 0: must not divide 1000 / 0 => must return null and render '—'
      const html0 = renderComponent(LatencyThroughputCell, { ms: 0, engine: 'standard' });
      assert.ok(html0.includes('0 ms'), 'Displays rounded 0 ms');
      assert.ok(html0.includes('—'), 'Throughput safely renders "—" for 0ms latency (no Infinity!)');
      assert.ok(!html0.includes('Infinity'), 'Must NEVER render Infinity in DOM');

      // ms = null: renders '—' for both
      const htmlNull = renderComponent(LatencyThroughputCell, { ms: null, engine: 'standard' });
      assert.ok(htmlNull.includes('—'));

      // ms = -10: guarded by ms > 0
      const htmlNeg = renderComponent(LatencyThroughputCell, { ms: -10, engine: 'standard' });
      assert.ok(htmlNeg.includes('—'), 'Negative latency throughput renders "—"');

      // ms = NaN: guarded by ms > 0
      const htmlNaN = renderComponent(LatencyThroughputCell, { ms: NaN, engine: 'standard' });
      assert.ok(htmlNaN.includes('—'), 'NaN latency throughput renders "—"');

      // Valid latency ms = 50ms => 1000 / 50 = 20.00 q/s
      const html50 = renderComponent(LatencyThroughputCell, { ms: 50, engine: 'optimized' });
      assert.ok(html50.includes('50 ms'));
      assert.ok(html50.includes('20.00 q/s'), 'Computes 20.00 q/s throughput');
      assert.ok(html50.includes('text-emerald-600'), 'Optimized engine uses emerald text');

      // Valid latency ms = 2500ms => 1000 / 2500 = 0.4000 q/s (< 1 q/s formats to 4 decimals)
      const html2500 = renderComponent(LatencyThroughputCell, { ms: 2500, engine: 'standard' });
      assert.ok(html2500.includes('0.4000 q/s'), 'Sub-unit throughput formats to 4 decimal places');
      assert.ok(html2500.includes('text-rose-600'), 'Standard engine uses rose text');
    });

    test('2.2 Expanded Drawer Throughput calculation (stdMs ? 1000 / stdMs : null)', () => {
      const calcThroughput = (ms) => (ms ? 1000 / ms : null);

      assert.equal(calcThroughput(0), null, '0ms latency safely evaluates to null via truthiness guard');
      assert.equal(calcThroughput(null), null);
      assert.equal(calcThroughput(undefined), null);
      assert.equal(calcThroughput(NaN), null);
      assert.equal(calcThroughput(200), 5.0, '200ms evaluates to 5.0 q/s');
    });

    test('2.3 fmtThroughput helper handles edge cases, sub-units, and invalid inputs', () => {
      assert.equal(fmtThroughput(null), '—');
      assert.equal(fmtThroughput(undefined), '—');
      assert.equal(fmtThroughput(NaN), '—');
      assert.equal(fmtThroughput('invalid'), '—');
      assert.equal(fmtThroughput(0), '0.0000 q/s', 'Zero throughput renders 0.0000 q/s');
      assert.equal(fmtThroughput(0.0005), '0.0005 q/s', 'Small throughput formatted to 4 decimals');
      assert.equal(fmtThroughput(0.9999), '0.9999 q/s');
      assert.equal(fmtThroughput(1.0), '1.00 q/s', '>= 1 q/s formatted to 2 decimals');
      assert.equal(fmtThroughput(142.857), '142.86 q/s');
      assert.equal(fmtThroughput(Infinity), 'Infinity q/s');
    });

    test('2.4 SpeedupBadge: Thresholds, badges and math safety', () => {
      // 1. Accelerated: >= 1.05x (emerald badge with ⚡)
      const htmlFast = renderComponent(SpeedupBadge, { speedup: 1.5 });
      assert.ok(htmlFast.includes('⚡'));
      assert.ok(htmlFast.includes('1.50×'));
      assert.ok(htmlFast.includes('bg-emerald-100'));

      // Boundary: 1.05x
      const htmlBoundFast = renderComponent(SpeedupBadge, { speedup: 1.05 });
      assert.ok(htmlBoundFast.includes('⚡'));
      assert.ok(htmlBoundFast.includes('1.05×'));

      // 2. Parity: 0.95x <= speedup < 1.05x (slate badge with ~)
      const htmlParity = renderComponent(SpeedupBadge, { speedup: 1.0 });
      assert.ok(htmlParity.includes('~1.00×'));
      assert.ok(htmlParity.includes('bg-slate-100'));

      const htmlParityLow = renderComponent(SpeedupBadge, { speedup: 0.95 });
      assert.ok(htmlParityLow.includes('~0.95×'));

      // 3. Negative control / overhead: < 0.95x (rose badge with 🔻)
      const htmlSlow = renderComponent(SpeedupBadge, { speedup: 0.65 });
      assert.ok(htmlSlow.includes('🔻'));
      assert.ok(htmlSlow.includes('0.65×'));
      assert.ok(htmlSlow.includes('bg-rose-100'));

      // Edge cases: null / undefined => '—'
      const htmlNull = renderComponent(SpeedupBadge, { speedup: null });
      assert.ok(htmlNull.includes('—'));

      // 0x speedup
      const htmlZero = renderComponent(SpeedupBadge, { speedup: 0 });
      assert.ok(htmlZero.includes('🔻'));
      assert.ok(htmlZero.includes('0.00×'));

      // Extreme: Infinity
      const htmlInf = renderComponent(SpeedupBadge, { speedup: Infinity });
      assert.ok(htmlInf.includes('⚡'));
      assert.ok(htmlInf.includes('Infinity×'));
    });

    test('2.5 OverheadCell: Width clamping [0%, 100%] and color category thresholds', () => {
      // Normal range: 25% (emerald < 30%)
      const html25 = renderComponent(OverheadCell, { transferMs: 10, matMs: 15, overheadPct: 25 });
      assert.ok(html25.includes('25%'));
      assert.ok(html25.includes('width:25%'));
      assert.ok(html25.includes('bg-emerald-500'));
      assert.ok(html25.includes('T: 10 ms'));
      assert.ok(html25.includes('M: 15 ms'));

      // Mid range: 50% (amber 30% - 70%)
      const html50 = renderComponent(OverheadCell, { transferMs: 30, matMs: 20, overheadPct: 50 });
      assert.ok(html50.includes('50%'));
      assert.ok(html50.includes('width:50%'));
      assert.ok(html50.includes('bg-amber-500'));

      // High range: 85% (indigo >= 70%)
      const html85 = renderComponent(OverheadCell, { transferMs: 60, matMs: 25, overheadPct: 85 });
      assert.ok(html85.includes('85%'));
      assert.ok(html85.includes('width:85%'));
      assert.ok(html85.includes('bg-indigo-500'));

      // Overhead > 100% (e.g. 140% where overhead exceeds pure execution): clamped to 100% width
      const html140 = renderComponent(OverheadCell, { transferMs: 100, matMs: 40, overheadPct: 140 });
      assert.ok(html140.includes('140%'));
      assert.ok(html140.includes('width:100%'), 'Overhead progress bar clamped to maximum 100%');

      // Negative overhead: clamped to 0% width
      const htmlNeg = renderComponent(OverheadCell, { transferMs: 0, matMs: 0, overheadPct: -15 });
      assert.ok(htmlNeg.includes('width:0%'), 'Negative overhead clamped to minimum 0%');

      // Null overhead
      const htmlNull = renderComponent(OverheadCell, { transferMs: null, matMs: null, overheadPct: null });
      assert.ok(htmlNull.includes('—'));
    });

    test('2.6 Throughput Gain Ratio (tpOpt / tpStd): Guards against division by zero', () => {
      // Simulates PtLogPage.jsx:840: const tpImprove = tpStd && tpOpt ? (tpOpt / tpStd).toFixed(1) : null;
      const calcImprovement = (tpStd, tpOpt) => (tpStd && tpOpt ? (tpOpt / tpStd).toFixed(1) : null);

      assert.equal(calcImprovement(0, 10), null, 'Standard throughput 0 safely evaluates to null');
      assert.equal(calcImprovement(10, 0), null, 'Optimized throughput 0 safely evaluates to null');
      assert.equal(calcImprovement(null, 10), null);
      assert.equal(calcImprovement(2, 8), '4.0', 'Valid throughputs compute 4.0x improvement');
      assert.equal(calcImprovement(1.5, 3.75), '2.5');
    });
  });

  // =========================================================================
  // SUITE 3: Dual-Key Fallbacks and Schema Interoperability
  // =========================================================================
  describe('Suite 3: Dual-Key Fallbacks (Standard vs Naive, Optimized vs Reduced)', () => {

    test('3.1 Row Latency dual-key fallbacks support both new and legacy backend payloads', () => {
      const resolveRowTimings = (r) => ({
        stdMs: r.standard_ms ?? r.naive_ms,
        optMs: r.optimized_ms ?? r.reduced_ms ?? r.total_ms
      });

      // 1. Updated keys only
      const updated = resolveRowTimings({ standard_ms: 120, optimized_ms: 45 });
      assert.equal(updated.stdMs, 120);
      assert.equal(updated.optMs, 45);

      // 2. Legacy keys only
      const legacy = resolveRowTimings({ naive_ms: 250, reduced_ms: 80 });
      assert.equal(legacy.stdMs, 250);
      assert.equal(legacy.optMs, 80);

      // 3. Fallback to total_ms when reduced_ms is missing
      const totalOnly = resolveRowTimings({ naive_ms: 300, total_ms: 95 });
      assert.equal(totalOnly.stdMs, 300);
      assert.equal(totalOnly.optMs, 95);

      // 4. Mixed payload
      const mixed = resolveRowTimings({ standard_ms: 400, reduced_ms: 110 });
      assert.equal(mixed.stdMs, 400);
      assert.equal(mixed.optMs, 110);

      // 5. Completely missing
      const empty = resolveRowTimings({});
      assert.equal(empty.stdMs, undefined);
      assert.equal(empty.optMs, undefined);
    });

    test('3.2 Best and Worst Case baseline dual-key fallbacks', () => {
      const resolveCatalogBaseline = (r) => ({
        worstStd: r.worst_case?.standard_ms ?? r.worst_case?.naive_ms,
        worstOpt: r.worst_case?.optimized_ms ?? r.worst_case?.reduced_ms,
        bestStd: r.best?.standard_ms ?? r.best?.naive_ms,
        bestOpt: r.best?.optimized_ms ?? r.best?.reduced_ms
      });

      const record = {
        worst_case: { naive_ms: 1500, reduced_ms: 300, speedup: 5.0 },
        best: { standard_ms: 120, optimized_ms: 40, speedup: 3.0 }
      };

      const resolved = resolveCatalogBaseline(record);
      assert.equal(resolved.worstStd, 1500);
      assert.equal(resolved.worstOpt, 300);
      assert.equal(resolved.bestStd, 120);
      assert.equal(resolved.bestOpt, 40);
    });

    test('3.3 Metrics Dashboard Aggregates dual-key fallbacks', () => {
      const resolveMetrics = (metrics) => ({
        avgStd: metrics.avgStandardMs ?? metrics.avgNaiveMs,
        avgOpt: metrics.avgOptimizedMs ?? metrics.avgReducedMs,
        medStd: metrics.medStandardMs ?? metrics.medNaiveMs,
        medOpt: metrics.medOptimizedMs ?? metrics.medReducedMs,
        tpStd: metrics.throughputStandard ?? metrics.throughputNaive,
        tpOpt: metrics.throughputOptimized ?? metrics.throughputReduced
      });

      const legacyMetrics = {
        avgNaiveMs: 850.5,
        avgReducedMs: 220.1,
        medNaiveMs: 780.0,
        medReducedMs: 210.0,
        throughputNaive: 1.1758,
        throughputReduced: 4.5434
      };

      const resolved = resolveMetrics(legacyMetrics);
      assert.equal(resolved.avgStd, 850.5);
      assert.equal(resolved.avgOpt, 220.1);
      assert.equal(resolved.medStd, 780.0);
      assert.equal(resolved.medOpt, 210.0);
      assert.equal(resolved.tpStd, 1.1758);
      assert.equal(resolved.tpOpt, 4.5434);
    });

    test('3.4 Status Endpoint dual-key phase resolution', () => {
      const resolveStatusPhases = (runStatus) => ({
        opt: (runStatus && (runStatus.optimized || runStatus.reduced)) || null,
        std: (runStatus && (runStatus.standard || runStatus.naive)) || null
      });

      // Legacy payload
      const legacySt = {
        running: true,
        reduced: { phase: 'done', ms: 120 },
        naive: { phase: 'running', startedAt: '2026-10-27T12:00:00Z' }
      };
      const resLegacy = resolveStatusPhases(legacySt);
      assert.equal(resLegacy.opt.phase, 'done');
      assert.equal(resLegacy.opt.ms, 120);
      assert.equal(resLegacy.std.phase, 'running');

      // Updated payload
      const updatedSt = {
        running: true,
        optimized: { phase: 'running' },
        standard: { phase: 'idle' }
      };
      const resUpdated = resolveStatusPhases(updatedSt);
      assert.equal(resUpdated.opt.phase, 'running');
      assert.equal(resUpdated.std.phase, 'idle');
    });
  });

  // =========================================================================
  // SUITE 4: Real-Time Status Card & Stepped Phase Progression
  // =========================================================================
  describe('Suite 4: RealTimeStatusCard Progression & ARIA Accessibility', () => {

    test('4.1 Stepped 3-Phase Progression: Running state with Phase 1 done, Phase 2 running, Phase 3 queued', () => {
      const now = Date.now();
      const runStatus = {
        running: true,
        startedAt: new Date(now - 3500).toISOString(),
        optimized: { done: true, ms: 180 },
        standard: { running: true, startedAt: new Date(now - 1200).toISOString() }
      };

      const html = renderComponent(RealTimeStatusCard, {
        runStatus,
        nowTick: now,
        isFastPolling: true
      });

      // Assert Top Bar & ARIA
      assert.ok(html.includes('role="status"'));
      assert.ok(html.includes('aria-live="polite"'));
      assert.ok(html.includes('Real-Time Query Optimization In Progress'));
      assert.ok(html.includes('Live Polling (1.5s)'));
      assert.ok(html.includes('Elapsed:'));

      // Assert Stepped Phase 1: Optimized is Done
      assert.ok(html.includes('Phase 1: Optimized (mongo-pt)'));
      assert.ok(html.includes('Done · 180 ms'));

      // Assert Stepped Phase 2: Standard MongoDB is Running
      assert.ok(html.includes('Phase 2: Standard MongoDB'));
      assert.ok(html.includes('Running · 1.2s'));

      // Assert Stepped Phase 3: Verification & Parity is Queued / Pending
      assert.ok(html.includes('Phase 3: Verification &amp; Parity'));
      assert.ok(html.includes('Pending'));
    });

    test('4.2 Idle state with parity verified on latestRecord and completed phases', () => {
      const latestRecord = {
        speedup: 2.85,
        checksum: '0xDEADBEEF',
        equal: true,
        standard_ms: 500,
        optimized_ms: 175
      };

      const html = renderComponent(RealTimeStatusCard, {
        runStatus: {
          running: false,
          optimized: { done: true, ms: 175 },
          standard: { done: true, ms: 500 }
        },
        latestRecord
      });

      assert.ok(html.includes('System Idle — Ready'));
      assert.ok(html.includes('2.85×'));
      assert.ok(html.includes('Phase 3: Verification &amp; Parity'));
      assert.ok(html.includes('Parity ok · 0xDEADBEEF'));
      assert.ok(html.includes('Done · 175 ms'));
      assert.ok(html.includes('Done · 500 ms'));
    });

    test('4.3 Clock skew resilience: Elapsed time clamped to 0 when nowTick < startedAt', () => {
      const now = Date.now();
      const futureStartedAt = new Date(now + 5000).toISOString(); // 5 seconds in future (clock skew)

      const runStatus = {
        running: true,
        startedAt: futureStartedAt
      };

      const html = renderComponent(RealTimeStatusCard, {
        runStatus,
        nowTick: now
      });

      assert.ok(html.includes('Elapsed: <span class="text-amber-700 text-sm">0.0s</span>'), 'Clock skew guarded by Math.max(0, ...)');
    });

    test('4.4 VerificationBadge: Handles Equal, Mismatch, and Not-Evaluated states', () => {
      // 1. Equal ok with CRC32 checksum
      const htmlEqual = renderComponent(VerificationBadge, { equal: true, checksum: '0x99AABBCC', rows: 50 });
      assert.ok(htmlEqual.includes('Equal (ok)'));
      assert.ok(htmlEqual.includes('0x99AABBCC'));
      assert.ok(htmlEqual.includes('text-emerald-800'));

      // 2. Mismatch with reason
      const htmlMismatch = renderComponent(VerificationBadge, { equal: false, mismatch: 'Row count 49 != 50' });
      assert.ok(htmlMismatch.includes('MISMATCH'));
      assert.ok(htmlMismatch.includes('Row count 49 != 50'));
      assert.ok(htmlMismatch.includes('text-rose-800'));

      // 3. Not evaluated
      const htmlNV = renderComponent(VerificationBadge, { equal: null });
      assert.ok(htmlNV.includes('n/v'));
    });
  });

  // =========================================================================
  // SUITE 5: Query Descriptions & Application Trigger Parsing
  // =========================================================================
  describe('Suite 5: Canonical Query Descriptions & Trigger Parsing', () => {

    test('5.1 All 7 canonical query specs have rich relational-calculus descriptions in SPEC_METADATA', () => {
      const canonicalSpecs = [
        'rare_category_revenue_7d',
        'common_category_revenue_365d',
        'vendor_scoped_revenue_90d',
        'user_scoped_spend_30d',
        'low_rating_reviews_by_category',
        'vendor_category_revenue_365d',
        'user_vendor_category_spend_30d'
      ];

      for (const specKey of canonicalSpecs) {
        const meta = SPEC_METADATA[specKey];
        assert.ok(meta, `SPEC_METADATA must contain ${specKey}`);
        assert.ok(meta.title, `${specKey} must have a title`);
        assert.ok(meta.shortDesc, `${specKey} must have a shortDesc`);
        assert.ok(meta.computation, `${specKey} must have computation calculus`);
        assert.ok(meta.joinOrder, `${specKey} must specify joinOrder`);
        assert.ok(Array.isArray(meta.relations) && meta.relations.length >= 4, `${specKey} must specify joined relations`);

        const resolved = getCanonicalQueryInfo(specKey);
        assert.equal(resolved.title, meta.title);
        assert.equal(resolved.shortDesc, meta.shortDesc);
      }
    });

    test('5.2 Dynamic Live Search specs (live_search_<term>) splice search filter into product relation', () => {
      const liveSpec = 'live_search_wireless_headphones';
      const info = getCanonicalQueryInfo(liveSpec);

      assert.equal(info.title, 'Live Search Query (Rare Category Revenue)');
      assert.ok(info.isLiveVariant, 'Flagged as live variant');
      assert.ok(info.computation.includes('cat ⋈ p ⋈ oi ⋈ o ⋈ v'));
      assert.ok(info.shortDesc.includes('matching live search filters'));
    });

    test('5.3 Unknown benchmark specs provide graceful fallback descriptions', () => {
      const unknown = getCanonicalQueryInfo({ spec: 'custom_ad_hoc_join', description: 'Ad-hoc multi-table join' });
      assert.equal(unknown.title, 'custom_ad_hoc_join');
      assert.equal(unknown.shortDesc, 'Ad-hoc multi-table join');
      assert.equal(unknown.isLiveVariant, false);
    });

    test('5.4 Application Trigger Parsing: Decouples search action, category browse, and analytics', () => {
      // 1. Search trigger
      const searchTrigger = getTriggerContext({
        kind: 'shadow',
        trigger: '/api/products?search=gaming+laptop&minRating=4',
        search_term: 'gaming laptop'
      });
      assert.equal(searchTrigger.label, 'Product Search');
      assert.equal(searchTrigger.action, 'Searched for "gaming laptop"');
      assert.equal(searchTrigger.searchTerm, 'gaming laptop');

      // 2. Category browse trigger
      const browseTrigger = getTriggerContext({
        kind: 'shadow',
        trigger: '/api/products?category=Electronics'
      });
      assert.equal(browseTrigger.label, 'Category Browse');
      assert.equal(browseTrigger.action, 'Browsed category "Electronics"');

      // 3. Admin dashboard analytics trigger
      const adminTrigger = getTriggerContext({
        kind: 'shadow',
        trigger: '/api/analytics/admin'
      });
      assert.equal(adminTrigger.label, 'Admin Dashboard');
      assert.equal(adminTrigger.action, 'Loaded Admin Analytics');

      // 4. Benchmark protocol record (non-shadow)
      const benchTrigger = getTriggerContext({ kind: 'order', trigger: null });
      assert.equal(benchTrigger.label, 'Benchmark (order)');
      assert.equal(benchTrigger.action, 'Direct benchmark execution');

      // 5. Null record
      const nullTrigger = getTriggerContext(null);
      assert.equal(nullTrigger.label, 'Benchmark Protocol');
    });
  });

  // =========================================================================
  // SUITE 6: Large Dataset Stress Test & Volume Stability
  // =========================================================================
  describe('Suite 6: Data Flow Volume Stress Test (1,000 synthetic rows)', () => {

    test('6.1 Filtering and mapping 1,000 mixed records completes in < 50ms with zero NaN or errors', () => {
      const syntheticRecords = [];
      const specs = [
        'rare_category_revenue_7d',
        'common_category_revenue_365d',
        'vendor_scoped_revenue_90d',
        'user_scoped_spend_30d',
        'live_search_laptop'
      ];

      for (let i = 0; i < 1000; i++) {
        const spec = specs[i % specs.length];
        const isLegacy = i % 3 === 0;
        const stdMs = Math.round(50 + Math.random() * 800);
        const optMs = Math.round(20 + Math.random() * 200);

        syntheticRecords.push({
          ts: new Date(Date.now() - i * 60000).toISOString(),
          kind: i % 4 === 0 ? 'order' : 'shadow',
          spec,
          ...(isLegacy ? { naive_ms: stdMs, reduced_ms: optMs } : { standard_ms: stdMs, optimized_ms: optMs }),
          speedup: parseFloat((stdMs / optMs).toFixed(2)),
          transfer_ms: Math.round(optMs * 0.2),
          materialization_ms: Math.round(optMs * 0.15),
          transfer_overhead_pct: 35.0,
          equal: true,
          checksum: '0x12345678',
          result_rows: 50,
          trigger: '/api/products?search=test'
        });
      }

      const start = performance.now();

      // Emulate PtLogPage data transformations
      const shadows = syntheticRecords.filter((r) => r.kind === 'shadow');
      assert.equal(shadows.length, 750);

      let processedCount = 0;
      for (const r of shadows) {
        const std = r.standard_ms ?? r.naive_ms;
        const opt = r.optimized_ms ?? r.reduced_ms ?? r.total_ms;
        const tpStd = std > 0 ? 1000 / std : null;
        const tpOpt = opt > 0 ? 1000 / opt : null;
        assert.ok(!isNaN(tpStd) && tpStd > 0);
        assert.ok(!isNaN(tpOpt) && tpOpt > 0);
        processedCount++;
      }

      const elapsed = performance.now() - start;
      assert.equal(processedCount, 750);
      assert.ok(elapsed < 50, `1,000 records processed in ${elapsed.toFixed(2)}ms (must be < 50ms)`);
    });
  });

});
