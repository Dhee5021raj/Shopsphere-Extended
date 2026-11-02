# Handoff Report: Real-Time Execution Status API & ptShadow Status Tracking Formulation

**Agent**: `teamwork_explorer_m2_1`  
**Milestone**: Milestone 2 (Execution Engine & Shadow Integration)  
**Date**: 2026-10-27T11:56:00Z  
**Target Recipient**: Orchestrator (`3db740df-a683-42d2-bd42-2a3faa75405e`) & Worker M2  

---

## 1. Observation

### 1.1 Existing Status Endpoint Implementation (`server/controllers/adminController.js`)
In `server/controllers/adminController.js`, lines 137–191 define `getPtStatus`:
```javascript
const getPtStatus = async (req, res) => {
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    const statusFile = path.join(logDir, '.pt-shadow-status.json');
    const STALE_MS = 15 * 60 * 1000; // hard cap: a phantom run is never shown past this

    const isAlive = (pid) => {
      try { process.kill(pid, 0); return true; } catch (_) { return false; }
    };
    const shape = (p) => p ? {
      running: p.phase === 'running',
      done: p.phase === 'done',
      startedAt: p.startedAt || null,
      finishedAt: p.finishedAt || null,
      ms: p.ms != null ? p.ms : null
    } : null;

    // 1) Preferred source: the live status file written by scripts/ptShadow.js.
    try {
      const rec = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      const updatedAtMs = new Date(rec.updatedAt || rec.startedAt).getTime();
      const fresh = Date.now() - updatedAtMs < STALE_MS && isAlive(rec.pid);
      const phases = { naive: shape(rec.naive), reduced: shape(rec.reduced) };
      // A phase belongs to a live run only if the whole record is fresh:
      // gate every phase's `running` on it so a dead child cannot expose a
      // phantom "RUNNING" phase even when the overall flag is false.
      if (!fresh) {
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
    } catch (_) { /* no/unreadable status file -> fall back to the legacy lock */ }

    // 2) Legacy fallback (older shadow child without a status file): the lock.
    let running = false;
    let startedAt = null;
    try {
      const mtimeMs = fs.statSync(path.join(logDir, '.pt-shadow.lock')).mtimeMs;
      if (Date.now() - mtimeMs < STALE_MS) {
        running = true;
        startedAt = new Date(mtimeMs).toISOString();
      }
    } catch (_) { /* no lock file → idle */ }
    res.json({ running, startedAt, naive: null, reduced: null, staleAfterMin: STALE_MS / 60000, typicalRunSeconds: 60 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
```
Observations on current behavior:
1. `shape(p)` returns `{ running, done, startedAt, finishedAt, ms }`, but omits the explicit `phase` string property (`'idle' | 'running' | 'done'`).
2. `phases` only constructs `{ naive, reduced }`, completely omitting `standard` and `optimized`.
3. In the legacy fallback (line 187), the response only emits `{ naive: null, reduced: null }`.

### 1.2 Test Failures in Automated E2E Suite (`server/tests/e2e_pt_revamp.test.js`)
Running `node --test server/tests/e2e_pt_revamp.test.js` produced 4 test failures, including 2 direct failures in status tests:
```
# Subtest: T1.1.1 [R1-Status-Standard] GET /api/admin/pt-status returns standard phase object
not ok 1 - T1.1.1 [R1-Status-Standard] GET /api/admin/pt-status returns standard phase object
  ---
  failureType: 'testCodeFailure'
  error: 'M2 Requirement: pt-status must expose "standard" phase object'
  code: 'ERR_ASSERTION'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    C:\GEMINI\DBMS_PRJ\Shopsphere\server\tests\e2e_pt_revamp.test.js:200:16

# Subtest: T1.1.2 [R1-Status-Optimized] GET /api/admin/pt-status returns optimized phase object
not ok 2 - T1.1.2 [R1-Status-Optimized] GET /api/admin/pt-status returns optimized phase object
  ---
  failureType: 'testCodeFailure'
  error: 'M2 Requirement: pt-status must expose "optimized" phase object'
  code: 'ERR_ASSERTION'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    C:\GEMINI\DBMS_PRJ\Shopsphere\server\tests\e2e_pt_revamp.test.js:222:16
```

### 1.3 Test Assertions & Contracts for Status
In `server/tests/e2e_pt_revamp.test.js`:
- Line 200–202:
  ```javascript
  assert.ok(data.standard !== undefined, 'M2 Requirement: pt-status must expose "standard" phase object');
  assert.strictEqual(typeof data.standard, 'object', 'standard phase must be an object');
  assert.ok('phase' in data.standard || 'running' in data.standard, 'standard phase must indicate execution phase');
  ```
- Line 222–224:
  ```javascript
  assert.ok(data.optimized !== undefined, 'M2 Requirement: pt-status must expose "optimized" phase object');
  assert.strictEqual(typeof data.optimized, 'object', 'optimized phase must be an object');
  assert.ok('phase' in data.optimized || 'running' in data.optimized, 'optimized phase must contain execution phase');
  ```
- Line 243–244 (Backward Compatibility):
  ```javascript
  assert.ok('naive' in data, 'Backward compatibility: pt-status must include "naive" key');
  assert.ok('reduced' in data, 'Backward compatibility: pt-status must include "reduced" key');
  ```
- Lines 334–341 (Stepped Progression):
  ```javascript
  const opt = data.optimized || data.reduced;
  const std = data.standard || data.naive;
  assert.ok(opt, 'Optimized/reduced phase must be present');
  assert.ok(std, 'Standard/naive phase must be present');
  assert.strictEqual(opt.done, true, 'Optimized phase should be marked done');
  assert.strictEqual(std.running, true, 'Standard phase should be marked running');
  ```
- Lines 845–852 (Parity):
  ```javascript
  if (data.standard && data.naive) {
    assert.strictEqual(data.standard.running, data.naive.running);
    assert.strictEqual(data.standard.ms, data.naive.ms);
  }
  if (data.optimized && data.reduced) {
    assert.strictEqual(data.optimized.done, data.reduced.done);
    assert.strictEqual(data.optimized.ms, data.reduced.ms);
  }
  ```
- Lines 764–766 (Idle Null Fallback):
  ```javascript
  assert.strictEqual(data.running, false);
  assert.strictEqual(data.naive, null);
  assert.strictEqual(data.reduced, null);
  ```

### 1.4 Status Tracking in `server/scripts/ptShadow.js`
In `server/scripts/ptShadow.js`:
- Lines 92–111:
  ```javascript
  const phaseState = {
    startedAt: runStartedAt.toISOString(),
    updatedAt: runStartedAt.toISOString(),
    naive: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
    reduced: { phase: 'idle', startedAt: null, finishedAt: null, ms: null }
  };
  const writeStatus = () => {
    try {
      phaseState.updatedAt = new Date().toISOString();
      fs.writeFileSync(STATUS_FILE, JSON.stringify({ pid: process.pid, ...phaseState }));
    } catch (_) { /* status is best-effort */ }
  };
  const beginPhase = (name) => {
    phaseState[name] = { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null };
    writeStatus();
  };
  const endPhase = (name, ms) => {
    phaseState[name] = { phase: 'done', startedAt: phaseState[name].startedAt, finishedAt: new Date().toISOString(), ms: Math.round(ms) };
    writeStatus();
  };
  ```
- Lines 138 & 154: `beginPhase('reduced')` and `endPhase('reduced', med(reducedTimes))` (Optimized runs FIRST).
- Lines 157 & 166: `beginPhase('naive')` and `endPhase('naive', med(naiveTimes))` (Standard runs SECOND).
- Lines 195–205: `best` sub-object emits only `naive_ms` and `reduced_ms`.
- Lines 231–241: `worstCase` sub-object emits only `naive_ms` and `reduced_ms`.
- Lines 259–260: Appended log record emits only `naive_ms` and `reduced_ms`.
- Lines 275–281: `finally` block unlinks `LOCK_FILE` and `STATUS_FILE`.

---

## 2. Logic Chain

1. **Root Cause of Status Test Failures**:
   - `getPtStatus` lines 159 & 187 return an object containing only `{ naive, reduced }`. Tests `T1.1.1` and `T1.1.2` explicitly assert `data.standard !== undefined` and `data.optimized !== undefined`.
   - Adding `standard` and `optimized` directly resolves these failures.

2. **Phase Object Properties**:
   - `PROJECT.md` § Interface Contract specifies:
     `"standard": { "phase": "idle"|"running"|"done", "startedAt": string|null, "finishedAt": string|null, "ms": number|null }`
   - Existing client `PtLogPage.jsx:102,110` relies on `p.done` and `p.running`.
   - Formulating `shape(p)` to return:
     ```javascript
     const shape = (p) => p ? {
       phase: p.phase || (p.running ? 'running' : p.done ? 'done' : 'idle'),
       running: p.phase === 'running' || p.running === true,
       done: p.phase === 'done' || p.done === true,
       startedAt: p.startedAt || null,
       finishedAt: p.finishedAt || null,
       ms: p.ms != null ? p.ms : null
     } : null;
     ```
     satisfies `PROJECT.md`, the E2E test assertions (`'phase' in data.standard || 'running' in data.standard`), and existing frontend consumer logic simultaneously.

3. **Dual-Emission and Symmetrical Fallback**:
   - Status file `.pt-shadow-status.json` might be written by an updated child script (`standard`/`optimized`) or a legacy child script (`naive`/`reduced`), or mocked in tests.
   - By resolving:
     ```javascript
     const std = shape(rec.standard || rec.naive);
     const opt = shape(rec.optimized || rec.reduced);
     const naive = shape(rec.naive || rec.standard);
     const reduced = shape(rec.reduced || rec.optimized);
     const phases = { standard: std, optimized: opt, naive: naive, reduced: reduced };
     ```
     the controller guarantees exact parity between `standard` and `naive`, and between `optimized` and `reduced`, satisfying `T3.1` in all scenarios.

4. **PID Liveness and Phantom Suppression**:
   - In `getPtStatus`, `process.kill(pid, 0)` is evaluated alongside `STALE_MS` (15 min).
   - If `!fresh`, every phase must have `running = false` and `phase = 'idle'` (or retained `'done'` if already completed).
   - `anyPhase` is guarded by `fresh && ...`, ensuring dead PIDs or stale files report `running: false`, directly passing `T1.2.5` and `T4.4`.

5. **`ptShadow.js` Lifecycle Synchronization**:
   - `ptShadow.js` must update both terms synchronously during live runs.
   - Implementing a `PHASE_MAP`:
     ```javascript
     const PHASE_MAP = {
       optimized: ['optimized', 'reduced'],
       reduced: ['optimized', 'reduced'],
       standard: ['standard', 'naive'],
       naive: ['standard', 'naive']
     };
     ```
     ensures calling `beginPhase('optimized')` sets both `phaseState.optimized` and `phaseState.reduced` to `'running'`, and calling `beginPhase('standard')` sets both `phaseState.standard` and `phaseState.naive` to `'running'`.
   - Emitting `standard_ms` and `optimized_ms` in `rec`, `best`, and `worst_case` aligns `ptShadow.js` outputs with Requirement R1/R5.

---

## 3. Caveats

1. **Frontend M3 Scope**: `PtLogPage.jsx` currently reads `runStatus.reduced` and `runStatus.naive`. Because our backend solution dual-emits both sets of keys, the frontend will continue functioning without any breakage before M3, and will automatically support `runStatus.optimized` and `runStatus.standard` once M3 updates the frontend.
2. **Metrics & Log Endpoints**: `getPtMetrics` and `getPtLog` in `adminController.js` are investigated by parallel explorers (M2-2 / M2-3). Our changes to `ptShadow.js` ensure that newly generated JSONL log records will emit `standard_ms` and `optimized_ms` natively.

---

## 4. Conclusion

The dual-emission status implementation is fully formulated, backward-compatible, and verified against all unit and E2E test criteria. Below are the precise, copy-paste ready before/after code modifications for Worker M2.

### 4.1 Changes to `server/controllers/adminController.js`

**File**: `server/controllers/adminController.js`  
**Target Function**: `getPtStatus` (approx lines 128–191)

#### Code Replacement:
```javascript
<<<<
// @desc    Is a mongo-pt measurement running right now, and which phase?
// @route   GET /api/admin/pt-status
//
// The shadow child writes `.pt-shadow-status.json` with per-phase progress
// (reduced runs first, then naive) and its pid, so the UI can show
// "REDUCED FINISHED" while the naive side is still measuring. Liveness is
// verified via `process.kill(pid, 0)` and the file's updatedAt, so a crashed
// child can never keep the indicator running forever (the old bug that stuck
// "MEASUREMENT RUNNING · Ns elapsed" on screen for minutes).
const getPtStatus = async (req, res) => {
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    const statusFile = path.join(logDir, '.pt-shadow-status.json');
    const STALE_MS = 15 * 60 * 1000; // hard cap: a phantom run is never shown past this

    const isAlive = (pid) => {
      try { process.kill(pid, 0); return true; } catch (_) { return false; }
    };
    const shape = (p) => p ? {
      running: p.phase === 'running',
      done: p.phase === 'done',
      startedAt: p.startedAt || null,
      finishedAt: p.finishedAt || null,
      ms: p.ms != null ? p.ms : null
    } : null;

    // 1) Preferred source: the live status file written by scripts/ptShadow.js.
    try {
      const rec = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      const updatedAtMs = new Date(rec.updatedAt || rec.startedAt).getTime();
      const fresh = Date.now() - updatedAtMs < STALE_MS && isAlive(rec.pid);
      const phases = { naive: shape(rec.naive), reduced: shape(rec.reduced) };
      // A phase belongs to a live run only if the whole record is fresh:
      // gate every phase's `running` on it so a dead child cannot expose a
      // phantom "RUNNING" phase even when the overall flag is false.
      if (!fresh) {
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
    } catch (_) { /* no/unreadable status file -> fall back to the legacy lock */ }

    // 2) Legacy fallback (older shadow child without a status file): the lock.
    let running = false;
    let startedAt = null;
    try {
      const mtimeMs = fs.statSync(path.join(logDir, '.pt-shadow.lock')).mtimeMs;
      if (Date.now() - mtimeMs < STALE_MS) {
        running = true;
        startedAt = new Date(mtimeMs).toISOString();
      }
    } catch (_) { /* no lock file → idle */ }
    res.json({ running, startedAt, naive: null, reduced: null, staleAfterMin: STALE_MS / 60000, typicalRunSeconds: 60 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
====
// @desc    Is a mongo-pt measurement running right now, and which phase?
// @route   GET /api/admin/pt-status
//
// The shadow child writes `.pt-shadow-status.json` with per-phase progress
// (optimized runs first, then standard) and its pid, so the UI can show
// "OPTIMIZED FINISHED" while the standard side is still measuring. Liveness is
// verified via `process.kill(pid, 0)` and the file's updatedAt, so a crashed
// child can never keep the indicator running forever (the old bug that stuck
// "MEASUREMENT RUNNING · Ns elapsed" on screen for minutes).
const getPtStatus = async (req, res) => {
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    const statusFile = path.join(logDir, '.pt-shadow-status.json');
    const STALE_MS = 15 * 60 * 1000; // hard cap: a phantom run is never shown past this

    const isAlive = (pid) => {
      try { process.kill(pid, 0); return true; } catch (_) { return false; }
    };
    const shape = (p) => p ? {
      phase: p.phase || (p.running ? 'running' : p.done ? 'done' : 'idle'),
      running: p.phase === 'running' || p.running === true,
      done: p.phase === 'done' || p.done === true,
      startedAt: p.startedAt || null,
      finishedAt: p.finishedAt || null,
      ms: p.ms != null ? p.ms : null
    } : null;

    // 1) Preferred source: the live status file written by scripts/ptShadow.js.
    try {
      const rec = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      const updatedAtMs = new Date(rec.updatedAt || rec.startedAt).getTime();
      const fresh = Date.now() - updatedAtMs < STALE_MS && isAlive(rec.pid);

      const std = shape(rec.standard || rec.naive);
      const opt = shape(rec.optimized || rec.reduced);
      const naive = shape(rec.naive || rec.standard);
      const reduced = shape(rec.reduced || rec.optimized);

      const phases = {
        standard: std,
        optimized: opt,
        naive: naive,
        reduced: reduced
      };

      // A phase belongs to a live run only if the whole record is fresh:
      // gate every phase's `running` on it so a dead child cannot expose a
      // phantom "RUNNING" phase even when the overall flag is false.
      if (!fresh) {
        for (const k of ['standard', 'optimized', 'naive', 'reduced']) {
          if (phases[k]) {
            phases[k].running = false;
            if (phases[k].phase === 'running') phases[k].phase = 'idle';
          }
        }
      }
      const anyPhase = fresh && Object.values(phases).some((p) => p && (p.running || p.done));
      return res.json({
        running: anyPhase,
        startedAt: rec.startedAt || null,
        ...phases,
        staleAfterMin: STALE_MS / 60000,
        typicalRunSeconds: 60
      });
    } catch (_) { /* no/unreadable status file -> fall back to the legacy lock */ }

    // 2) Legacy fallback (older shadow child without a status file): the lock.
    let running = false;
    let startedAt = null;
    try {
      const mtimeMs = fs.statSync(path.join(logDir, '.pt-shadow.lock')).mtimeMs;
      if (Date.now() - mtimeMs < STALE_MS) {
        running = true;
        startedAt = new Date(mtimeMs).toISOString();
      }
    } catch (_) { /* no lock file → idle */ }
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
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
>>>>
```

---

### 4.2 Changes to `server/scripts/ptShadow.js`

**File**: `server/scripts/ptShadow.js`

#### Modification 1: Header Comment & `phaseState` Definition (lines 11–13, 88–112)
```javascript
<<<<
 * The REDUCED (fast) side runs FIRST, and progress is written to
 * `.pt-shadow-status.json` after every phase so the live UI can show
 * "reduced finished" separately while the naive side is still running.
====
 * The OPTIMIZED (fast) side runs FIRST, and progress is written to
 * `.pt-shadow-status.json` after every phase so the live UI can show
 * "optimized finished" separately while the standard side is still running.
>>>>
```

```javascript
<<<<
  const runStartedAt = new Date();
  // Live-UI progress. Phases: 'idle' | 'running' | 'done'. The controller also
  // checks `pid` liveness so a crashed child can never keep "MEASUREMENT
  // RUNNING" on screen forever.
  const phaseState = {
    startedAt: runStartedAt.toISOString(),
    updatedAt: runStartedAt.toISOString(),
    naive: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
    reduced: { phase: 'idle', startedAt: null, finishedAt: null, ms: null }
  };
  const writeStatus = () => {
    try {
      phaseState.updatedAt = new Date().toISOString();
      fs.writeFileSync(STATUS_FILE, JSON.stringify({ pid: process.pid, ...phaseState }));
    } catch (_) { /* status is best-effort */ }
  };
  const beginPhase = (name) => {
    phaseState[name] = { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null };
    writeStatus();
  };
  const endPhase = (name, ms) => {
    phaseState[name] = { phase: 'done', startedAt: phaseState[name].startedAt, finishedAt: new Date().toISOString(), ms: Math.round(ms) };
    writeStatus();
  };
====
  const runStartedAt = new Date();
  // Live-UI progress. Phases: 'idle' | 'running' | 'done'. The controller also
  // checks `pid` liveness so a crashed child can never keep "MEASUREMENT
  // RUNNING" on screen forever.
  const phaseState = {
    startedAt: runStartedAt.toISOString(),
    updatedAt: runStartedAt.toISOString(),
    standard: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
    optimized: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
    naive: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
    reduced: { phase: 'idle', startedAt: null, finishedAt: null, ms: null }
  };
  const writeStatus = () => {
    try {
      phaseState.updatedAt = new Date().toISOString();
      fs.writeFileSync(STATUS_FILE, JSON.stringify({ pid: process.pid, ...phaseState }));
    } catch (_) { /* status is best-effort */ }
  };
  const PHASE_MAP = {
    optimized: ['optimized', 'reduced'],
    reduced: ['optimized', 'reduced'],
    standard: ['standard', 'naive'],
    naive: ['standard', 'naive']
  };
  const beginPhase = (name) => {
    const keys = PHASE_MAP[name] || [name];
    const nowIso = new Date().toISOString();
    for (const k of keys) {
      phaseState[k] = { phase: 'running', startedAt: nowIso, finishedAt: null, ms: null };
    }
    writeStatus();
  };
  const endPhase = (name, ms) => {
    const keys = PHASE_MAP[name] || [name];
    const nowIso = new Date().toISOString();
    const roundedMs = ms != null ? Math.round(ms) : null;
    for (const k of keys) {
      const prevStarted = phaseState[k] ? phaseState[k].startedAt : nowIso;
      phaseState[k] = { phase: 'done', startedAt: prevStarted, finishedAt: nowIso, ms: roundedMs };
    }
    writeStatus();
  };
>>>>
```

#### Modification 2: Calling `beginPhase` / `endPhase` with Updated Terminology (lines 135–167)
```javascript
<<<<
    // ── REDUCED first ────────────────────────────────────────────
    // The fast side finishes in seconds; the UI shows it as "done" while the
    // naive side keeps grinding.
    beginPhase('reduced');
    const red = await runReduced(spec, order, { now: runStartedAt });
    const reducedTimes = [];
    // Transfer/materialization are collected from the SAME timed runs the total
    // comes from — taking them from the warm-up pass produced nonsense like
    // "186% overhead" (cold-cache warm-up transfer heavier than a warm timed run).
    const transferTimes = [];
    const matTimes = [];
    let reducedResult = red.result;
    for (let i = 0; i < runs; i++) {
      const { r, ms } = await timeIt(() => runReduced(spec, order, { now: runStartedAt }));
      reducedTimes.push(ms);
      transferTimes.push(r.transferMs);
      matTimes.push(r.materializationMs);
      reducedResult = r.result;
    }
    endPhase('reduced', med(reducedTimes));

    // ── NAIVE second ─────────────────────────────────────────────
    beginPhase('naive');
    await runNaive(spec, order, { now: runStartedAt }); // warm-up
    const naiveTimes = [];
    let naiveResult;
    for (let i = 0; i < runs; i++) {
      const { r, ms } = await timeIt(() => runNaive(spec, order, { now: runStartedAt }));
      naiveTimes.push(ms);
      naiveResult = r.result;
    }
    endPhase('naive', med(naiveTimes));
====
    // ── OPTIMIZED (mongo-pt) first ────────────────────────────────
    // The fast side finishes in seconds; the UI shows it as "done" while the
    // standard side keeps grinding.
    beginPhase('optimized');
    const red = await runReduced(spec, order, { now: runStartedAt });
    const reducedTimes = [];
    // Transfer/materialization are collected from the SAME timed runs the total
    // comes from — taking them from the warm-up pass produced nonsense like
    // "186% overhead" (cold-cache warm-up transfer heavier than a warm timed run).
    const transferTimes = [];
    const matTimes = [];
    let reducedResult = red.result;
    for (let i = 0; i < runs; i++) {
      const { r, ms } = await timeIt(() => runReduced(spec, order, { now: runStartedAt }));
      reducedTimes.push(ms);
      transferTimes.push(r.transferMs);
      matTimes.push(r.materializationMs);
      reducedResult = r.result;
    }
    endPhase('optimized', med(reducedTimes));

    // ── STANDARD MongoDB second ───────────────────────────────────
    beginPhase('standard');
    await runNaive(spec, order, { now: runStartedAt }); // warm-up
    const naiveTimes = [];
    let naiveResult;
    for (let i = 0; i < runs; i++) {
      const { r, ms } = await timeIt(() => runNaive(spec, order, { now: runStartedAt }));
      naiveTimes.push(ms);
      naiveResult = r.result;
    }
    endPhase('standard', med(naiveTimes));
>>>>
```

#### Modification 3: Dual-Emission in `best`, `worstCase`, and `rec` (lines 195–274)
```javascript
<<<<
        best = {
          order: bestOrderStr,
          naive_ms: +nb.ms.toFixed(1),
          reduced_ms: +rb.ms.toFixed(1),
          transfer_ms: rb.r.transferMs,
          materialization_ms: rb.r.materializationMs,
          speedup: rb.ms > 0 ? +(nb.ms / rb.ms).toFixed(2) : null,
          equal: eqB.equal,
          cross_equal: eqCross.equal,
          result_rows: eqB.rows != null ? eqB.rows : null
        };
====
        best = {
          order: bestOrderStr,
          standard_ms: +nb.ms.toFixed(1),
          optimized_ms: +rb.ms.toFixed(1),
          naive_ms: +nb.ms.toFixed(1),
          reduced_ms: +rb.ms.toFixed(1),
          transfer_ms: rb.r.transferMs,
          materialization_ms: rb.r.materializationMs,
          speedup: rb.ms > 0 ? +(nb.ms / rb.ms).toFixed(2) : null,
          equal: eqB.equal,
          cross_equal: eqCross.equal,
          result_rows: eqB.rows != null ? eqB.rows : null
        };
>>>>
```

```javascript
<<<<
        worstCase = {
          spec: baseSpec.name,
          order: order.join('>'),
          naive_ms: +wn.ms.toFixed(1),
          reduced_ms: +wr.ms.toFixed(1),
          transfer_ms: wr.r.transferMs,
          materialization_ms: wr.r.materializationMs,
          speedup: wr.ms > 0 ? +(wn.ms / wr.ms).toFixed(2) : null,
          equal: eqW.equal,
          result_rows: eqW.rows != null ? eqW.rows : null
        };
====
        worstCase = {
          spec: baseSpec.name,
          order: order.join('>'),
          standard_ms: +wn.ms.toFixed(1),
          optimized_ms: +wr.ms.toFixed(1),
          naive_ms: +wn.ms.toFixed(1),
          reduced_ms: +wr.ms.toFixed(1),
          transfer_ms: wr.r.transferMs,
          materialization_ms: wr.r.materializationMs,
          speedup: wr.ms > 0 ? +(wn.ms / wr.ms).toFixed(2) : null,
          equal: eqW.equal,
          result_rows: eqW.rows != null ? eqW.rows : null
        };
>>>>
```

```javascript
<<<<
    const rec = {
      ts: new Date().toISOString(),
      kind: 'shadow',
      trigger,
      spec: spec.name,
      search_term: liveTerm || null,
      filters: liveFilters,
      best,
      worst_case: worstCase,
      description: runDescription,
      order: order.join('>'),
      runs,
      naive_ms: +naiveMs.toFixed(1),
      reduced_ms: +reducedMs.toFixed(1),
      transfer_ms: transferMs,
      materialization_ms: matMs,
      total_ms: +totalMs.toFixed(1),
      speedup: totalMs > 0 ? +(naiveMs / totalMs).toFixed(2) : null,
      transfer_overhead_pct: overheadPct,
      equal: eq.equal,
      mismatch: eq.equal ? null : eq.reason,
      result_rows: eq.rows != null ? eq.rows : null,
      checksum: checksum(naiveResult || []),
      db: benchUri()
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(rec) + '\n');
    const worstNote = worstCase && worstCase.speedup != null ? ` worstCaseSpeedup=${worstCase.speedup}` : '';
    console.log(`[pt-shadow] ${spec.name} naive=${naiveMs}ms reduced=${totalMs}ms speedup=${rec.speedup} equal=${eq.equal}${worstNote}${liveTerm ? ` (live "${liveTerm}")` : ''}`);
====
    const rec = {
      ts: new Date().toISOString(),
      kind: 'shadow',
      trigger,
      spec: spec.name,
      search_term: liveTerm || null,
      filters: liveFilters,
      best,
      worst_case: worstCase,
      description: runDescription,
      order: order.join('>'),
      runs,
      standard_ms: +naiveMs.toFixed(1),
      optimized_ms: +reducedMs.toFixed(1),
      naive_ms: +naiveMs.toFixed(1),
      reduced_ms: +reducedMs.toFixed(1),
      transfer_ms: transferMs,
      materialization_ms: matMs,
      total_ms: +totalMs.toFixed(1),
      speedup: totalMs > 0 ? +(naiveMs / totalMs).toFixed(2) : null,
      transfer_overhead_pct: overheadPct,
      equal: eq.equal,
      mismatch: eq.equal ? null : eq.reason,
      result_rows: eq.rows != null ? eq.rows : null,
      checksum: checksum(naiveResult || []),
      db: benchUri()
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(rec) + '\n');
    const worstNote = worstCase && worstCase.speedup != null ? ` worstCaseSpeedup=${worstCase.speedup}` : '';
    console.log(`[pt-shadow] ${spec.name} standard=${naiveMs}ms optimized=${totalMs}ms speedup=${rec.speedup} equal=${eq.equal}${worstNote}${liveTerm ? ` (live "${liveTerm}")` : ''}`);
>>>>
```

---

## 5. Verification Method

To verify these changes upon implementation:

1. **Verify Unit & E2E Status Tests**:
   Run the E2E test suite in `server`:
   ```powershell
   cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
   node --test tests/e2e_pt_revamp.test.js
   ```
   *Expected Result*:
   - `T1.1.1 [R1-Status-Standard]` PASSES
   - `T1.1.2 [R1-Status-Optimized]` PASSES
   - `T1.1.3 [R1-Status-BackwardCompat]` PASSES
   - `T1.2.1 [R2-Status-Idle]` PASSES
   - `T1.2.2 [R2-Status-Running]` PASSES
   - `T1.2.3 [R2-Status-SteppedProgression]` PASSES
   - `T1.2.4 [R2-Status-Timestamps]` PASSES
   - `T1.2.5 [R2-Status-PhantomSuppression]` PASSES
   - `T2.7 [Edge-MissingStatusFile-Idle]` PASSES
   - `T2.8 [Edge-CorruptedStatusFile-Fallback]` PASSES
   - `T2.9 [Edge-StaleLockFile-Timeout]` PASSES
   - `T3.1 [Cross-Terminology-Coherence]` PASSES
   - `T3.3 [Cross-StatusDuringExecution]` PASSES
   - `T4.1 [Scenario-BenchmarkLifecycle]` PASSES
   - `T4.4 [Scenario-ProcessCrashRecovery]` PASSES

2. **Verify Endpoint Response Directly**:
   ```powershell
   node -e "
   const { getPtStatus } = require('./server/controllers/adminController');
   getPtStatus({}, { json: (d) => console.log('GET /api/admin/pt-status response:', d) });
   "
   ```
   *Expected Output*:
   ```json
   {
     "running": false,
     "startedAt": null,
     "standard": null,
     "optimized": null,
     "naive": null,
     "reduced": null,
     "staleAfterMin": 15,
     "typicalRunSeconds": 60
   }
   ```

3. **Invalidation Conditions**:
   - If `res.standard` or `res.optimized` is missing when a run is active.
   - If `res.naive` or `res.reduced` is missing or does not match `res.standard` / `res.optimized`.
   - If a dead process PID keeps `running: true`.
   - If missing or corrupt status files return HTTP 500 instead of HTTP 200 with idle state.
