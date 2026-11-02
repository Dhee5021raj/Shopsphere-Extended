'use strict';

/**
 * adversarial_lifecycle_status.test.js
 *
 * Empirical Adversarial Test Suite for getPtStatus and Shadow Execution Lifecycle.
 * Authored by Milestone 2 Challenger 1 (Lifecycle & Status Challenger).
 *
 * Stress-tests:
 *  1. Missing status and lock file handling (clean idle fallback).
 *  2. Corrupted, truncated, and malformed JSON payloads.
 *  3. Dead process PID detection and phantom run suppression.
 *  4. Stepped phase transitions (idle -> optimized running -> standard running -> both done -> cleanup).
 *  5. Full API contract compliance and dual-terminology parity (standard == naive, optimized == reduced).
 *  6. End-to-end detached ptShadow process lifecycle with real-time polling.
 *  7. Abrupt process termination (SIGKILL / crash recovery).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const { getPtStatus } = require('../controllers/adminController');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const STATUS_FILE = path.join(LOGS_DIR, '.pt-shadow-status.json');
const LOCK_FILE = path.join(LOGS_DIR, '.pt-shadow.lock');

function createMockRes() {
  const state = {
    statusCode: 200,
    headers: {},
    data: null,
    ended: false
  };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    setHeader(k, v) {
      state.headers[k.toLowerCase()] = v;
      return res;
    },
    json(obj) {
      state.data = obj;
      state.ended = true;
      return res;
    },
    send(data) {
      state.data = data;
      state.ended = true;
      return res;
    }
  };
  return { res, getState: () => state };
}

function withRawStatusFile(rawContent, fn) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  let backupStatus = null;
  let backupLock = null;
  const existedStatus = fs.existsSync(STATUS_FILE);
  const existedLock = fs.existsSync(LOCK_FILE);

  if (existedStatus) {
    try { backupStatus = fs.readFileSync(STATUS_FILE, 'utf8'); } catch (_) {}
  }
  if (existedLock) {
    try { backupLock = fs.readFileSync(LOCK_FILE, 'utf8'); } catch (_) {}
  }

  // Ensure clean starting state
  try { fs.unlinkSync(STATUS_FILE); } catch (_) {}
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}

  if (rawContent !== null) {
    fs.writeFileSync(STATUS_FILE, typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent), 'utf8');
  }

  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      try {
        if (existedStatus && backupStatus !== null) {
          fs.writeFileSync(STATUS_FILE, backupStatus, 'utf8');
        } else {
          try { fs.unlinkSync(STATUS_FILE); } catch (_) {}
        }
      } catch (_) {}

      try {
        if (existedLock && backupLock !== null) {
          fs.writeFileSync(LOCK_FILE, backupLock, 'utf8');
        } else {
          try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
        }
      } catch (_) {}
    });
}

function withLockFile(mtimeOffsetMs, fn) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  let backupStatus = null;
  let backupLock = null;
  const existedStatus = fs.existsSync(STATUS_FILE);
  const existedLock = fs.existsSync(LOCK_FILE);

  if (existedStatus) {
    try { backupStatus = fs.readFileSync(STATUS_FILE, 'utf8'); } catch (_) {}
  }
  if (existedLock) {
    try { backupLock = fs.readFileSync(LOCK_FILE, 'utf8'); } catch (_) {}
  }

  try { fs.unlinkSync(STATUS_FILE); } catch (_) {}
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}

  if (mtimeOffsetMs !== null) {
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
    const targetTime = new Date(Date.now() + mtimeOffsetMs);
    fs.utimesSync(LOCK_FILE, targetTime, targetTime);
  }

  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      try {
        if (existedStatus && backupStatus !== null) {
          fs.writeFileSync(STATUS_FILE, backupStatus, 'utf8');
        } else {
          try { fs.unlinkSync(STATUS_FILE); } catch (_) {}
        }
      } catch (_) {}

      try {
        if (existedLock && backupLock !== null) {
          fs.writeFileSync(LOCK_FILE, backupLock, 'utf8');
        } else {
          try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
        }
      } catch (_) {}
    });
}

describe('Challenger M2-1: getPtStatus & Shadow Lifecycle Adversarial Suite', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // Group 1: Missing Status & Lock Files Handling
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group 1: Missing Status & Lock Files Handling', () => {
    test('ADV-1.1 Clean idle state when neither status file nor lock file exists', async () => {
      await withRawStatusFile(null, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200);
        assert.strictEqual(st.data.running, false);
        assert.strictEqual(st.data.startedAt, null);
        assert.strictEqual(st.data.standard, null);
        assert.strictEqual(st.data.optimized, null);
        assert.strictEqual(st.data.naive, null);
        assert.strictEqual(st.data.reduced, null);
        assert.strictEqual(typeof st.data.staleAfterMin, 'number');
        assert.ok(st.data.staleAfterMin > 0);
        assert.strictEqual(typeof st.data.typicalRunSeconds, 'number');
      });
    });

    test('ADV-1.2 Legacy fallback to active lock file when status file is missing', async () => {
      // Lock file created 2 seconds ago
      await withLockFile(-2000, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200);
        assert.strictEqual(st.data.running, true);
        assert.ok(st.data.startedAt);
        assert.ok(!isNaN(new Date(st.data.startedAt).getTime()));
        assert.strictEqual(st.data.standard, null);
        assert.strictEqual(st.data.optimized, null);
        assert.strictEqual(st.data.naive, null);
        assert.strictEqual(st.data.reduced, null);
      });
    });

    test('ADV-1.3 Stale legacy lock file (>15 mins old) is ignored and returns running: false', async () => {
      // Lock file older than 15 minutes (e.g. 16 minutes ago)
      await withLockFile(-16 * 60 * 1000, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200);
        assert.strictEqual(st.data.running, false);
        assert.strictEqual(st.data.startedAt, null);
        assert.strictEqual(st.data.standard, null);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group 2: Corrupted, Truncated & Malformed JSON Payloads
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group 2: Corrupted, Truncated & Malformed JSON Payloads', () => {
    test('ADV-2.1 Zero-byte (empty) status file falls back cleanly without 500 error', async () => {
      await withRawStatusFile('', async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200, 'Empty status file must not cause 500');
        assert.strictEqual(st.data.running, false);
        assert.strictEqual(st.data.standard, null);
      });
    });

    test('ADV-2.2 Truncated JSON status file falls back cleanly', async () => {
      await withRawStatusFile('{"pid": 1234, "standard": {"phase": "run', async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200, 'Truncated JSON must not throw');
        assert.strictEqual(st.data.running, false);
      });
    });

    test('ADV-2.3 Binary / garbage data in status file falls back cleanly', async () => {
      await withRawStatusFile('\x00\x01\x02\xFF\xFE\xFD{INVALID:JSON!!!}', async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200);
        assert.strictEqual(st.data.running, false);
      });
    });

    test('ADV-2.4 Literal JSON primitives (null, number, boolean) handled without crash', async () => {
      for (const prim of ['null', '42', 'true', 'false', '[]']) {
        await withRawStatusFile(prim, async () => {
          const { res, getState } = createMockRes();
          await getPtStatus({}, res);
          const st = getState();

          assert.strictEqual(st.statusCode, 200, `Primitive ${prim} must not crash`);
          assert.strictEqual(st.data.running, false);
        });
      }
    });

    test('ADV-2.5 Empty object status file `{}` handled without crash', async () => {
      await withRawStatusFile('{}', async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200);
        assert.strictEqual(st.data.running, false);
      });
    });

    test('ADV-2.6 Malformed dates / non-ISO strings in updatedAt/startedAt handled safely', async () => {
      const payload = {
        pid: process.pid,
        startedAt: 'INVALID_DATE_STRING',
        updatedAt: 'ALSO_NOT_A_DATE',
        standard: { phase: 'running', startedAt: 'BOGUS' }
      };

      await withRawStatusFile(payload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200);
        // Invalid date results in NaN timestamps, which fail the freshness check -> phantom suppressed
        assert.strictEqual(st.data.running, false);
        assert.strictEqual(st.data.standard.running, false);
        assert.strictEqual(st.data.standard.phase, 'idle');
      });
    });

    test('ADV-2.7 Malformed phase values (non-object or corrupt phase strings) handled safely', async () => {
      const payload = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        standard: 'running', // string instead of object
        optimized: 9999,    // number instead of object
        naive: null,
        reduced: { phase: 'unknown_phase_xyz', ms: 'not_a_number' }
      };

      await withRawStatusFile(payload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200);
        assert.strictEqual(typeof st.data.running, 'boolean');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group 3: Dead Process PID & Phantom Run Suppression
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group 3: Dead Process PID & Phantom Run Suppression', () => {
    test('ADV-3.1 Dead process PID forces running: false and suppresses phantom running phases', async () => {
      const deadPidPayload = {
        pid: 999999, // Unreachable PID on Windows
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        standard: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null },
        optimized: { phase: 'done', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ms: 120 },
        naive: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null },
        reduced: { phase: 'done', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ms: 120 }
      };

      await withRawStatusFile(deadPidPayload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200);
        assert.strictEqual(st.data.running, false, 'Dead PID must force overall running: false');
        assert.strictEqual(st.data.standard.running, false, 'Dead PID must force standard.running: false');
        assert.strictEqual(st.data.standard.phase, 'idle', 'Running phase must be reset to idle on dead PID');
        assert.strictEqual(st.data.naive.running, false);
        assert.strictEqual(st.data.naive.phase, 'idle');
      });
    });

    test('ADV-3.2 Invalid PID types (null, undefined, non-numeric strings, negative) handled safely', async () => {
      const testPids = [-1, 'abc', null, undefined, -9999];

      for (const testPid of testPids) {
        const payload = {
          pid: testPid,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          standard: { phase: 'running' }
        };

        await withRawStatusFile(payload, async () => {
          const { res, getState } = createMockRes();
          await getPtStatus({}, res);
          const st = getState();

          assert.strictEqual(st.statusCode, 200);
          assert.strictEqual(st.data.running, false, `PID ${testPid} must result in running: false`);
        });
      }
    });

    test('ADV-3.3 Edge analysis: PID 0 targets caller process group in Node.js libuv', async () => {
      // In POSIX and Windows libuv, process.kill(0, 0) sends signal 0 to the caller's own process group,
      // which succeeds if the caller process is running.
      // Probing whether isAlive(0) is true or false:
      let rawKillResult;
      try { process.kill(0, 0); rawKillResult = true; } catch (_) { rawKillResult = false; }
      assert.strictEqual(rawKillResult, true, 'process.kill(0, 0) succeeds in current process group');

      const payload = {
        pid: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        standard: { phase: 'running' }
      };

      await withRawStatusFile(payload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();
        assert.strictEqual(st.statusCode, 200);
        // Note: Without an explicit `pid > 0` check, isAlive(0) evaluates to true
        // This is documented as a finding for PID boundary validation.
      });
    });

    test('ADV-3.4 Stale timestamp with living PID triggers phantom timeout suppression (>15m)', async () => {
      const staleTimestamp = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      const stalePayload = {
        pid: process.pid, // Living PID!
        startedAt: staleTimestamp,
        updatedAt: staleTimestamp,
        standard: { phase: 'running', startedAt: staleTimestamp, finishedAt: null, ms: null },
        optimized: { phase: 'running', startedAt: staleTimestamp, finishedAt: null, ms: null }
      };

      await withRawStatusFile(stalePayload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.statusCode, 200);
        assert.strictEqual(st.data.running, false, 'Stale timestamp (>15m) must suppress running even if PID is alive');
        assert.strictEqual(st.data.standard.running, false);
        assert.strictEqual(st.data.standard.phase, 'idle');
        assert.strictEqual(st.data.optimized.running, false);
        assert.strictEqual(st.data.optimized.phase, 'idle');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group 4: Phase State Transitions & Stepped Progression
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group 4: Phase State Transitions & Stepped Progression', () => {
    test('ADV-4.1 State 1 (Initial Idle): All phases idle, running: false', async () => {
      const idlePayload = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        standard: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
        optimized: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
        naive: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
        reduced: { phase: 'idle', startedAt: null, finishedAt: null, ms: null }
      };

      await withRawStatusFile(idlePayload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.data.running, false);
        assert.strictEqual(st.data.standard.phase, 'idle');
        assert.strictEqual(st.data.standard.running, false);
        assert.strictEqual(st.data.standard.done, false);
        assert.strictEqual(st.data.optimized.phase, 'idle');
        assert.strictEqual(st.data.optimized.running, false);
        assert.strictEqual(st.data.optimized.done, false);
      });
    });

    test('ADV-4.2 State 2 (Optimized Running First): mongo-pt phase active, standard idle', async () => {
      const optRunningPayload = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        optimized: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null },
        standard: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
        reduced: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null },
        naive: { phase: 'idle', startedAt: null, finishedAt: null, ms: null }
      };

      await withRawStatusFile(optRunningPayload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.data.running, true);
        assert.strictEqual(st.data.optimized.phase, 'running');
        assert.strictEqual(st.data.optimized.running, true);
        assert.strictEqual(st.data.optimized.done, false);
        assert.strictEqual(st.data.standard.phase, 'idle');
        assert.strictEqual(st.data.standard.running, false);
        assert.strictEqual(st.data.standard.done, false);
      });
    });

    test('ADV-4.3 State 3 (Stepped Progression): Optimized done, Standard running', async () => {
      const steppedPayload = {
        pid: process.pid,
        startedAt: new Date(Date.now() - 4000).toISOString(),
        updatedAt: new Date().toISOString(),
        optimized: { phase: 'done', startedAt: new Date(Date.now() - 4000).toISOString(), finishedAt: new Date(Date.now() - 2500).toISOString(), ms: 110 },
        standard: { phase: 'running', startedAt: new Date(Date.now() - 2500).toISOString(), finishedAt: null, ms: null },
        reduced: { phase: 'done', startedAt: new Date(Date.now() - 4000).toISOString(), finishedAt: new Date(Date.now() - 2500).toISOString(), ms: 110 },
        naive: { phase: 'running', startedAt: new Date(Date.now() - 2500).toISOString(), finishedAt: null, ms: null }
      };

      await withRawStatusFile(steppedPayload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.data.running, true);
        // Optimized check
        assert.strictEqual(st.data.optimized.phase, 'done');
        assert.strictEqual(st.data.optimized.done, true);
        assert.strictEqual(st.data.optimized.running, false);
        assert.strictEqual(st.data.optimized.ms, 110);
        // Standard check
        assert.strictEqual(st.data.standard.phase, 'running');
        assert.strictEqual(st.data.standard.running, true);
        assert.strictEqual(st.data.standard.done, false);
        assert.strictEqual(st.data.standard.ms, null);
      });
    });

    test('ADV-4.4 State 4 (Both Done During Final Logging): Both done, running: true until unlinked', async () => {
      const donePayload = {
        pid: process.pid,
        startedAt: new Date(Date.now() - 10000).toISOString(),
        updatedAt: new Date().toISOString(),
        optimized: { phase: 'done', startedAt: new Date(Date.now() - 10000).toISOString(), finishedAt: new Date(Date.now() - 8000).toISOString(), ms: 95 },
        standard: { phase: 'done', startedAt: new Date(Date.now() - 8000).toISOString(), finishedAt: new Date(Date.now() - 1000).toISOString(), ms: 380 },
        reduced: { phase: 'done', startedAt: new Date(Date.now() - 10000).toISOString(), finishedAt: new Date(Date.now() - 8000).toISOString(), ms: 95 },
        naive: { phase: 'done', startedAt: new Date(Date.now() - 8000).toISOString(), finishedAt: new Date(Date.now() - 1000).toISOString(), ms: 380 }
      };

      await withRawStatusFile(donePayload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const st = getState();

        assert.strictEqual(st.data.running, true, 'Process alive with done phases indicates active final logging pass');
        assert.strictEqual(st.data.optimized.done, true);
        assert.strictEqual(st.data.standard.done, true);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group 5: Full Contract Compliance & Cross-Terminology Parity
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group 5: Full Contract Compliance & Cross-Terminology Parity', () => {
    test('ADV-5.1 Complete contract compliance of returned JSON structure', async () => {
      const payload = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        standard: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null },
        optimized: { phase: 'done', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ms: 80 }
      };

      await withRawStatusFile(payload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const d = getState().data;

        // Verify top-level contract keys
        const expectedKeys = ['running', 'startedAt', 'standard', 'optimized', 'naive', 'reduced', 'staleAfterMin', 'typicalRunSeconds'];
        for (const k of expectedKeys) {
          assert.ok(k in d, `Top-level key "${k}" missing from status response`);
        }

        // Verify phase object structure
        for (const phaseKey of ['standard', 'optimized', 'naive', 'reduced']) {
          const p = d[phaseKey];
          assert.ok(p, `Phase object "${phaseKey}" must be non-null`);
          assert.ok(['idle', 'running', 'done'].includes(p.phase), `phase "${p.phase}" invalid`);
          assert.strictEqual(typeof p.running, 'boolean');
          assert.strictEqual(typeof p.done, 'boolean');
          assert.ok(p.startedAt === null || typeof p.startedAt === 'string');
          assert.ok(p.finishedAt === null || typeof p.finishedAt === 'string');
          assert.ok(p.ms === null || typeof p.ms === 'number');
        }
      });
    });

    test('ADV-5.2 Strict parity between standard and naive, optimized and reduced', async () => {
      const payload = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        standard: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null },
        optimized: { phase: 'done', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ms: 145 },
        naive: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null },
        reduced: { phase: 'done', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ms: 145 }
      };

      await withRawStatusFile(payload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const d = getState().data;

        assert.deepStrictEqual(d.standard, d.naive, 'standard and naive must be strictly identical');
        assert.deepStrictEqual(d.optimized, d.reduced, 'optimized and reduced must be strictly identical');
      });
    });

    test('ADV-5.3 Legacy-only source file properly populates standard and optimized', async () => {
      // Old script that only wrote naive and reduced
      const legacyPayload = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        naive: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null },
        reduced: { phase: 'done', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ms: 75 }
      };

      await withRawStatusFile(legacyPayload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const d = getState().data;

        assert.ok(d.standard, 'standard must be populated from naive fallback');
        assert.ok(d.optimized, 'optimized must be populated from reduced fallback');
        assert.strictEqual(d.standard.phase, 'running');
        assert.strictEqual(d.optimized.phase, 'done');
        assert.strictEqual(d.optimized.ms, 75);
      });
    });

    test('ADV-5.4 Modern-only source file properly populates naive and reduced', async () => {
      const modernPayload = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        standard: { phase: 'done', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ms: 310 },
        optimized: { phase: 'done', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ms: 40 }
      };

      await withRawStatusFile(modernPayload, async () => {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const d = getState().data;

        assert.ok(d.naive, 'naive must be populated from standard fallback');
        assert.ok(d.reduced, 'reduced must be populated from optimized fallback');
        assert.strictEqual(d.naive.ms, 310);
        assert.strictEqual(d.reduced.ms, 40);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group 6: Live Child Process Detached Lifecycle Stress
  // ─────────────────────────────────────────────────────────────────────────
  describe('Group 6: Live Child Process Detached Lifecycle Stress', () => {
    test('ADV-6.1 Spawn ptShadow detached process and verify full status lifecycle transitions', async () => {
      // Run ptShadow on a fast spec with 1 run
      const shadowScript = path.join(__dirname, '..', 'scripts', 'ptShadow.js');

      // Ensure no leftover status file
      try { fs.unlinkSync(STATUS_FILE); } catch (_) {}
      try { fs.unlinkSync(LOCK_FILE); } catch (_) {}

      // Spawn real ptShadow process
      const child = spawn(process.execPath, [
        shadowScript,
        '--spec=rare_category_revenue_7d',
        '--runs=1'
      ], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PT_SHADOW: '1' },
        stdio: 'pipe'
      });

      let sawOptimized = false;
      let sawStandard = false;
      let sawRunning = false;

      // Poll getPtStatus while the child runs
      const pollStart = Date.now();
      while (Date.now() - pollStart < 15000) {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const d = getState().data;

        if (d && d.running) {
          sawRunning = true;
          if (d.optimized && (d.optimized.phase === 'running' || d.optimized.phase === 'done')) {
            sawOptimized = true;
          }
          if (d.standard && (d.standard.phase === 'running' || d.standard.phase === 'done')) {
            sawStandard = true;
          }
        }

        // Wait 40ms before next sample
        await new Promise((r) => setTimeout(r, 40));

        // If child exited, break loop
        if (child.exitCode !== null) break;
      }

      // Wait for child to completely terminate
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.on('close', resolve);
      });

      assert.strictEqual(child.exitCode, 0, 'ptShadow child process should exit with code 0');
      assert.ok(sawRunning, 'Polling should observe running: true during child execution');
      assert.ok(sawOptimized, 'Polling should observe optimized phase in progress or done');

      // Give 100ms for child finally block to unlink
      await new Promise((r) => setTimeout(r, 100));

      // Post-execution check: status file must be cleaned up
      const { res: finalRes, getState: getFinalState } = createMockRes();
      await getPtStatus({}, finalRes);
      const finalData = getFinalState().data;

      assert.strictEqual(finalData.running, false, 'Status must return running: false after child process exits');
      assert.strictEqual(finalData.standard, null, 'Status must return standard: null after child cleanup');
      assert.strictEqual(finalData.optimized, null, 'Status must return optimized: null after child cleanup');
      assert.strictEqual(fs.existsSync(STATUS_FILE), false, 'Status file must be deleted upon exit');
      assert.strictEqual(fs.existsSync(LOCK_FILE), false, 'Lock file must be deleted upon exit');
    });

    test('ADV-6.2 Sudden process termination (SIGKILL simulation) recovers cleanly without hang', async () => {
      // Spawn a node child that writes a status file with its PID and waits
      const workerScript = `
        const fs = require('fs');
        const path = require('path');
        const statusFile = ${JSON.stringify(STATUS_FILE)};
        fs.writeFileSync(statusFile, JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          standard: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null },
          optimized: { phase: 'running', startedAt: new Date().toISOString(), finishedAt: null, ms: null }
        }));
        setInterval(() => {}, 1000);
      `;

      const child = spawn(process.execPath, ['-e', workerScript], {
        cwd: path.join(__dirname, '..'),
        stdio: 'ignore'
      });

      // Wait for status file to be written
      const startWait = Date.now();
      while (!fs.existsSync(STATUS_FILE) && Date.now() - startWait < 3000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(fs.existsSync(STATUS_FILE), 'Status file should have been written by worker child');

      // Verify status is reported as running while child is alive
      {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        assert.strictEqual(getState().data.running, true);
      }

      // Abruptly kill the worker child with SIGKILL
      child.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 150));

      // Immediately query getPtStatus: must detect dead child and report running: false
      {
        const { res, getState } = createMockRes();
        await getPtStatus({}, res);
        const data = getState().data;

        assert.strictEqual(data.running, false, 'Abruptly killed child process must immediately reflect running: false');
        assert.strictEqual(data.standard.running, false);
        assert.strictEqual(data.standard.phase, 'idle');
      }

      // Cleanup leftover status file
      try { fs.unlinkSync(STATUS_FILE); } catch (_) {}
    });
  });
});
