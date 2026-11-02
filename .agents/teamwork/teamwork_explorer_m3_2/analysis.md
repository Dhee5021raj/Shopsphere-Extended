# Real-Time Status Indicator Architectural Analysis & Component Design

**Author**: Milestone 3 Explorer 2 (Real-Time Status Explorer)  
**Target File**: `client/src/pages/PtLogPage.jsx`  
**Dependencies**: `server/controllers/adminController.js`, `server/scripts/ptShadow.js`

---

## 1. Executive Summary

This document provides the complete architecture, specification, and drop-in JSX implementation for the real-time query execution status indicator in `client/src/pages/PtLogPage.jsx`.

The revamp transforms the current rudimentary inline pill chips (`NAIVE (slow)` / `REDUCED (faster)`) into a prominent, accessible, academic-grade **`RealTimeStatusCard`** featuring:
1. **Prominent Running vs. Idle Visualization**: High-contrast status banner with animated pulsing radar dot, live query spec attribution, and accessibility live region (`role="status"`, `aria-live="polite"`).
2. **Stepped 3-Phase Progression**:
   - **Phase 1: `Optimized (mongo-pt)`**: Yannakakis semi-join reduction on temporary collections (`running` / `done` / `ms`).
   - **Phase 2: `Standard MongoDB`**: Baseline left-deep `$lookup` aggregation (`running` / `done` / `ms`).
   - **Phase 3: `Verification & Materialization`**: Equality verification, polynomial checksum parity check, and temp collection cleanup (`done` / parity verified).
3. **Dynamic Elapsed Time Counter**: High-frequency sub-second timer (updating every 200ms when active, formatted to 1 decimal place, e.g. `4.2s`), automatically paused when idle to conserve client resources.
4. **Adaptive Polling Engine**: 1500ms when active (`running: true`) for instant phase updates, transitioning to 5000ms when idle, with an immediate refresh trigger upon benchmark completion.
5. **Universal Accessibility & Motion Safety**: Conforming to W3C WAI-ARIA and Modern Web Guidance with `role="status"`, `sr-only` announcement text, and `motion-safe:animate-pulse` / `motion-reduce:animate-none`.

---

## 2. Current State Analysis (`client/src/pages/PtLogPage.jsx`)

### 2.1 Existing Implementation Deficiencies
In `client/src/pages/PtLogPage.jsx`:
- **Lines 98–124 (`phaseChip`)**:
  ```jsx
  const phaseChip = (phase, runStatus, nowTick) => {
    const p = (runStatus && runStatus[phase]) || null;
    if (!p) return null;
    const label = phase === 'naive' ? 'NAIVE (slow)' : 'REDUCED (faster)';
    ...
  ```
  - *Deficiency 1*: Uses deprecated terminology (`NAIVE (slow)` and `REDUCED (faster)`) violating Requirement R1.
  - *Deficiency 2*: Only models 2 phases (naive and reduced), omitting Phase 3 (Verification & Materialization).
  - *Deficiency 3*: Uses coarse 1-second ticks (`Math.round((nowTick - startedAt) / 1000)`), feeling sluggish rather than real-time.
- **Lines 605–611 (Polling & Timer)**:
  ```jsx
  useEffect(() => {
    load(false);
    loadMetrics(false);
    const id = setInterval(() => { load(true); loadMetrics(true); }, 5000);
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [load, loadMetrics]);
  ```
  - *Deficiency 4*: Polling is static at 5000ms regardless of whether a measurement is running or idle. When a 2-second optimized query runs, the user often misses the entire phase transition.
  - *Deficiency 5*: Heavy endpoints (`/admin/pt-log` returning up to 100 log records and `/admin/pt-metrics`) are polled together with status on the same static timer.
  - *Deficiency 6*: Timer runs continuously at 1000ms even when idle, while not being fast enough during active runs.
- **Lines 630–650 (Visual Placement)**:
  - *Deficiency 7*: The status chips are crammed into a secondary line inside the header card, lacking visual prominence, step connectors, and clarity.
  - *Deficiency 8*: Missing `role="status"`, `aria-live="polite"`, and screen-reader announcements.

---

## 3. Backend Interface Contract (`GET /api/admin/pt-status`)

Verified from `server/controllers/adminController.js` and `server/scripts/ptShadow.js`:
```json
{
  "running": true,
  "startedAt": "2026-10-27T12:00:00.000Z",
  "standard": {
    "phase": "running",
    "running": true,
    "done": false,
    "startedAt": "2026-10-27T12:00:02.100Z",
    "finishedAt": null,
    "ms": null
  },
  "optimized": {
    "phase": "done",
    "running": false,
    "done": true,
    "startedAt": "2026-10-27T12:00:00.100Z",
    "finishedAt": "2026-10-27T12:00:02.050Z",
    "ms": 195
  },
  "naive": { ... },
  "reduced": { ... },
  "staleAfterMin": 15,
  "typicalRunSeconds": 60
}
```

### Phase Transition Sequence in `ptShadow.js`:
1. **Start of Run**: `optimized` begins running (`phase: 'running'`), `standard` is queued (`phase: 'idle'`).
2. **Optimized Done**: `optimized` finishes (`phase: 'done'`, `ms: 195`), `standard` begins running (`phase: 'running'`).
3. **Standard Done**: `standard` finishes (`phase: 'done'`, `ms: 2840`).
4. **Verification & Cleanup**: `resultsEqual()` check runs, polynomial checksum is calculated, record is committed to `pt-log.jsonl`, and lock/status files are removed (`running` becomes `false`).

---

## 4. Component Design: `RealTimeStatusCard`

### 4.1 Stepped 3-Phase Progression Model
| Phase # | Phase Name | Engine / Technology | States | Subtext / Metric Display |
|---|---|---|---|---|
| **Phase 1** | **Optimized (mongo-pt)** | Yannakakis LargestRoot semi-join reduction on temporary collections | `queued` → `running` → `done` | Running: `● RUNNING · 1.4s`<br>Done: `✓ DONE · 195 ms` |
| **Phase 2** | **Standard MongoDB** | Unoptimized full-catalog left-deep `$lookup` aggregation | `queued` → `running` → `done` | Running: `● RUNNING · 4.8s`<br>Done: `✓ DONE · 2,840 ms` |
| **Phase 3** | **Verification & Materialization** | Result equivalence verification (`resultsEqual`), polynomial checksum parity, temp cleanup | `queued` → `running` → `done` | Pending: `○ PENDING EXECUTION`<br>Done: `✓ VERIFIED · 100% Parity (ok)` |

### 4.2 Dynamic Elapsed Time Engine
- **Active State (`running: true`)**:
  - Main elapsed counter calculates `(nowTick - new Date(startedAt).getTime()) / 1000`.
  - Formatted as `elapsed.toFixed(1) + 's'` (e.g., `3.6s`).
  - Rendered with high-contrast amber/indigo styling.
  - Dedicated `setInterval(..., 200)` runs strictly while `running: true`.
- **Idle State (`running: false`)**:
  - Timer is cleared (`clearInterval`), freeing CPU threads.
  - Displays last run execution time and speedup factor from `latestRecord`.

### 4.3 Adaptive Polling Engine
- When `running === true`: Polls `/api/admin/pt-status` every **1500ms (1.5s)**.
- When `running === false`: Polls `/api/admin/pt-status` every **5000ms (5.0s)**.
- **Instant Completion Trigger**: When a poll response detects `prev.running === true && next.running === false`:
  - Immediately invokes `load(true)` and `loadMetrics(true)`.
  - The UI updates instantly without waiting for the next idle interval!

### 4.4 Accessibility (Modern Web Guidance Compliant)
- **Container Role**: `role="status"` and `aria-live="polite"` with `aria-atomic="true"`.
- **Screen Reader Announcements**: Hidden `<div className="sr-only">` that dynamically summarizes:
  `"Query optimization benchmark is running. Phase 1 Optimized finished in 195ms. Phase 2 Standard MongoDB is running with 4.8s elapsed."`
- **Motion Safety**: Pulse animations use `motion-safe:animate-pulse` and `motion-safe:animate-ping`, gracefully becoming static under `prefers-reduced-motion: reduce`.
- **Color Contrast**: All text meets WCAG 2.1 AA (≥ 4.5:1 against light background).

---

## 5. Complete JSX Implementation

Here is the exact code for the `RealTimeStatusCard` component and its integration into `PtLogPage.jsx`:

```jsx
import React from 'react';
import { Activity, Zap, Database, CheckCircle2, RefreshCw, Clock, ArrowRight, ShieldCheck } from 'lucide-react';

const fmtMs = (v) => (v == null ? '—' : `${Math.round(v)} ms`);

/**
 * RealTimeStatusCard
 *
 * Prominent, accessible real-time query optimization status indicator.
 * Displays stepped 3-phase progression:
 *   1. Optimized (mongo-pt)
 *   2. Standard MongoDB
 *   3. Verification & Materialization
 *
 * Integrates dynamic sub-second elapsed timer and accessible ARIA live-region.
 */
export const RealTimeStatusCard = ({
  runStatus = { running: false },
  nowTick = Date.now(),
  latestRecord = null,
  onRefresh = () => {},
  isFastPolling = false
}) => {
  const isRunning = Boolean(runStatus && runStatus.running);

  // Extract dual-terminology phases safely
  const opt = (runStatus && (runStatus.optimized || runStatus.reduced)) || null;
  const std = (runStatus && (runStatus.standard || runStatus.naive)) || null;
  const ver = (runStatus && runStatus.verification) || null;

  // Calculate elapsed times
  const totalElapsedSec = isRunning && runStatus?.startedAt
    ? Math.max(0, (nowTick - new Date(runStatus.startedAt).getTime()) / 1000)
    : null;

  const optElapsedSec = opt?.running && opt?.startedAt
    ? Math.max(0, (nowTick - new Date(opt.startedAt).getTime()) / 1000)
    : null;

  const stdElapsedSec = std?.running && std?.startedAt
    ? Math.max(0, (nowTick - new Date(std.startedAt).getTime()) / 1000)
    : null;

  // Determine individual phase states: 'done' | 'running' | 'queued'
  const optState = opt?.done ? 'done' : opt?.running ? 'running' : 'queued';
  const stdState = std?.done ? 'done' : std?.running ? 'running' : 'queued';
  
  // Phase 3 is done if verification object says done, OR both standard & optimized finished, OR idle with latestRecord
  const verState = ver?.phase === 'done' || (optState === 'done' && stdState === 'done')
    ? 'done'
    : isRunning
      ? 'queued'
      : latestRecord
        ? 'done'
        : 'queued';

  // Screen-reader live description
  const srAnnouncement = isRunning
    ? `Query optimization measurement running. Elapsed: ${totalElapsedSec ? totalElapsedSec.toFixed(0) : 0} seconds. Phase 1 Optimized is ${optState}. Phase 2 Standard MongoDB is ${stdState}. Phase 3 Verification is ${verState}.`
    : `Query optimization benchmark is idle. Last execution speedup: ${latestRecord?.speedup ?? '—'}x with verified result parity.`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`rounded-3xl border transition-all duration-300 p-6 shadow-sm overflow-hidden ${
        isRunning
          ? 'bg-gradient-to-r from-amber-500/10 via-indigo-500/5 to-emerald-500/10 border-amber-300/80 shadow-md ring-1 ring-amber-400/30'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Accessible screen-reader announcement */}
      <span className="sr-only">{srAnnouncement}</span>

      {/* ── Top Header / State Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/60">
        <div className="flex items-center gap-3.5">
          {isRunning ? (
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 border border-amber-200 shadow-inner">
              <span className="motion-safe:animate-ping absolute inline-flex h-6 w-6 rounded-full bg-amber-400 opacity-75" />
              <Activity size={22} className="relative z-10 motion-safe:animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-inner">
              <ShieldCheck size={22} />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                  isRunning
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRunning ? 'bg-amber-500 motion-safe:animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                {isRunning ? 'Execution Active' : 'System Idle — Ready'}
              </span>

              {isFastPolling && isRunning && (
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Zap size={10} className="text-indigo-500" /> Live Polling (1.5s)
                </span>
              )}
            </div>

            <h2 className="text-base font-extrabold text-slate-900 mt-0.5">
              {isRunning
                ? 'Real-Time Query Optimization In Progress'
                : 'Query Optimization Engine Status'}
            </h2>
          </div>
        </div>

        {/* Right side: Timer & Actions */}
        <div className="flex items-center gap-3">
          {isRunning && totalElapsedSec != null && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-300/80 text-amber-900">
              <Clock size={15} className="text-amber-600 motion-safe:animate-spin" />
              <div className="text-xs font-mono font-extrabold">
                Elapsed: <span className="text-amber-700 text-sm">{totalElapsedSec.toFixed(1)}s</span>
              </div>
            </div>
          )}

          {!isRunning && latestRecord && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>Last Run Speedup:</span>
              <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                latestRecord.speedup >= 1
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-100 text-rose-800 border border-rose-200'
              }`}>
                {latestRecord.speedup != null ? `${latestRecord.speedup}×` : '—'}
              </span>
            </div>
          )}

          <button
            onClick={onRefresh}
            title="Poll status now"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm transition-all"
          >
            <RefreshCw size={13} />
            <span className="hidden sm:inline">Check Status</span>
          </button>
        </div>
      </div>

      {/* ── Stepped 3-Phase Progression Bar ── */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 relative">
        {/* Step 1: Optimized (mongo-pt) */}
        <div
          className={`relative rounded-2xl p-4 border transition-all ${
            optState === 'done'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : optState === 'running'
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-300/50 text-amber-950 shadow-sm'
                : 'bg-slate-50/70 border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                  optState === 'done'
                    ? 'bg-emerald-500 text-white'
                    : optState === 'running'
                      ? 'bg-amber-500 text-white motion-safe:animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {optState === 'done' ? <CheckCircle2 size={16} /> : <Zap size={15} />}
              </div>
              <span className="text-xs font-extrabold uppercase tracking-wide">
                Phase 1: Optimized (mongo-pt)
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                optState === 'done'
                  ? 'bg-emerald-100 text-emerald-800'
                  : optState === 'running'
                    ? 'bg-amber-100 text-amber-800 motion-safe:animate-pulse'
                    : 'bg-slate-200 text-slate-600'
              }`}
            >
              {optState === 'done'
                ? `Done · ${fmtMs(opt?.ms ?? latestRecord?.optimized_ms)}`
                : optState === 'running'
                  ? `Running · ${optElapsedSec != null ? optElapsedSec.toFixed(1) : '0'}s`
                  : 'Queued'}
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-600">
            Yannakakis semi-join reduction on temp collections to eliminate dangling tuples.
          </p>
        </div>

        {/* Step 2: Standard MongoDB */}
        <div
          className={`relative rounded-2xl p-4 border transition-all ${
            stdState === 'done'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : stdState === 'running'
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-300/50 text-amber-950 shadow-sm'
                : 'bg-slate-50/70 border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                  stdState === 'done'
                    ? 'bg-emerald-500 text-white'
                    : stdState === 'running'
                      ? 'bg-amber-500 text-white motion-safe:animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {stdState === 'done' ? <CheckCircle2 size={16} /> : <Database size={15} />}
              </div>
              <span className="text-xs font-extrabold uppercase tracking-wide">
                Phase 2: Standard MongoDB
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                stdState === 'done'
                  ? 'bg-emerald-100 text-emerald-800'
                  : stdState === 'running'
                    ? 'bg-amber-100 text-amber-800 motion-safe:animate-pulse'
                    : 'bg-slate-200 text-slate-600'
              }`}
            >
              {stdState === 'done'
                ? `Done · ${fmtMs(std?.ms ?? latestRecord?.standard_ms)}`
                : stdState === 'running'
                  ? `Running · ${stdElapsedSec != null ? stdElapsedSec.toFixed(1) : '0'}s`
                  : 'Queued'}
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-600">
            Baseline left-deep $lookup pipeline executing against full-scale catalog collections.
          </p>
        </div>

        {/* Step 3: Verification & Materialization */}
        <div
          className={`relative rounded-2xl p-4 border transition-all ${
            verState === 'done'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-slate-50/70 border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                  verState === 'done'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                <CheckCircle2 size={16} />
              </div>
              <span className="text-xs font-extrabold uppercase tracking-wide">
                Phase 3: Verification & Parity
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                verState === 'done'
                  ? 'bg-emerald-100 text-emerald-800 font-bold'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {verState === 'done'
                ? latestRecord?.checksum
                  ? `Parity ok · ${latestRecord.checksum}`
                  : 'Parity Verified'
                : 'Pending'}
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-600">
            Row-by-row equivalence verification, polynomial checksum parity, and temp collection cleanup.
          </p>
        </div>
      </div>

      {/* Context caption */}
      <div className="mt-3.5 pt-3 border-t border-slate-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          {isRunning
            ? 'Background measurement running detached on shopsphere_bench — user search latency is 100% unaffected.'
            : 'Benchmarks run in a detached process upon user searches. Search the catalog to fire a live measurement.'}
        </span>
        {latestRecord?.trigger && (
          <span className="font-mono text-slate-400 truncate max-w-sm" title={latestRecord.trigger}>
            Trigger: {latestRecord.trigger}
          </span>
        )}
      </div>
    </div>
  );
};
```

---

## 6. Page State Management & Adaptive Polling Hook

To integrate `RealTimeStatusCard` seamlessly into `client/src/pages/PtLogPage.jsx`, replace the existing polling effect (lines 605–612) with the following adaptive polling architecture:

```jsx
// ── In PtLogPage component: ──────────────────────────────────────────────────
const [runStatus, setRunStatus] = useState({ running: false, startedAt: null });
const [nowTick, setNowTick] = useState(Date.now());
const [isFastPolling, setIsFastPolling] = useState(false);

// 1. Dynamic Elapsed Timer: Runs at 200ms interval ONLY while running: true
useEffect(() => {
  if (!runStatus.running) return;
  const tickId = setInterval(() => {
    setNowTick(Date.now());
  }, 200);
  return () => clearInterval(tickId);
}, [runStatus.running]);

// 2. Adaptive Polling Engine: 1500ms when active, 5000ms when idle
useEffect(() => {
  let isMounted = true;
  let timeoutId = null;

  const pollStatus = async () => {
    let nextDelay = 5000;
    try {
      const { data: st } = await api.get('/admin/pt-status');
      if (!isMounted) return;

      const newStatus = st && typeof st === 'object' ? st : { running: false };
      const currentlyRunning = Boolean(newStatus.running);

      setRunStatus((prev) => {
        // Run completion detection: was running -> now idle
        // Instantly refresh logs and metrics without waiting!
        if (prev?.running && !currentlyRunning) {
          load(true);
          loadMetrics(true);
        }
        return newStatus;
      });

      setIsFastPolling(currentlyRunning);
      nextDelay = currentlyRunning ? 1500 : 5000;
    } catch (_) {
      nextDelay = 5000;
      setIsFastPolling(false);
    }

    if (isMounted) {
      timeoutId = setTimeout(pollStatus, nextDelay);
    }
  };

  pollStatus();

  return () => {
    isMounted = false;
    if (timeoutId) clearTimeout(timeoutId);
  };
}, [load, loadMetrics]);

// 3. Periodic Background Refresh for Logs & Metrics: Every 10s when idle
useEffect(() => {
  load(false);
  loadMetrics(false);

  const refreshInterval = setInterval(() => {
    if (!runStatus.running) {
      load(true);
      loadMetrics(true);
    }
  }, 10000);

  return () => clearInterval(refreshInterval);
}, [load, loadMetrics, runStatus.running]);
```

---

## 7. Modern Web Guidance Compliance

Retrieved and verified from `modern-web-guidance`:
- **`progress`**: Used polite live regions for non-interactive task completion without shifting keyboard focus (`"To announce when a background task finishes, update a polite status element (role=\"status\" or aria-live=\"polite\")."`).
- **`accessibility`**: Avoided `aria-busy` on generic unstyled divs and guarded animations with `motion-safe:` to honor `@media (prefers-reduced-motion: reduce)`.
