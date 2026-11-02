'use strict';

/**
 * seedBench_cli.test.js
 *
 * Adversarial verification suite for seedBench.js CLI argument parsing,
 * fail-fast rejection, and mutation prevention.
 *
 * Run:
 *   node --test tests/seedBench_cli.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SEED_BENCH_PATH = path.resolve(__dirname, '..', 'scripts', 'seedBench.js');

describe('seedBench.js CLI Argument Validation & Adversarial Suite', () => {

  describe('Adversarial Process-Level Fail-Fast (Exit Code != 0 & Zero DB Connection)', () => {
    const adversarialTestCases = [
      // Negative integer checks
      {
        name: 'Rejects negative products (--products=-50)',
        args: ['--products=-50'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects negative orders (--orders=-10)',
        args: ['--orders=-10'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects negative items (--items=-1)',
        args: ['--items=-1'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects negative vendors (--vendors=-5)',
        args: ['--vendors=-5'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects negative categories (--categories=-2)',
        args: ['--categories=-2'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects negative users (--users=-100)',
        args: ['--users=-100'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects negative reviews (--reviews=-20)',
        args: ['--reviews=-20'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects negative batch (--batch=-500)',
        args: ['--batch=-500'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects negative seed (--seed=-123)',
        args: ['--seed=-123'],
        expectedError: /must be a positive integer|must be a non-negative integer/i
      },

      // Zero value checks
      {
        name: 'Rejects zero products (--products=0)',
        args: ['--products=0'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects zero orders (--orders=0)',
        args: ['--orders=0'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects zero items (--items=0)',
        args: ['--items=0'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects zero vendors (--vendors=0)',
        args: ['--vendors=0'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects zero categories (--categories=0)',
        args: ['--categories=0'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects zero users (--users=0)',
        args: ['--users=0'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects zero reviews (--reviews=0)',
        args: ['--reviews=0'],
        expectedError: /must be a positive integer/i
      },
      {
        name: 'Rejects zero batch (--batch=0)',
        args: ['--batch=0'],
        expectedError: /must be a positive integer/i
      },

      // Unknown and malformed option checks
      {
        name: 'Rejects unknown option key (--unknown=10)',
        args: ['--unknown=10'],
        expectedError: /unknown argument/i
      },
      {
        name: 'Rejects arbitrary unknown key (--badparam=99)',
        args: ['--badparam=99'],
        expectedError: /unknown argument/i
      },
      {
        name: 'Rejects arbitrary flag (--badflag)',
        args: ['--badflag'],
        expectedError: /unknown argument/i
      },
      {
        name: 'Rejects non-numeric value string (--products=abc)',
        args: ['--products=abc'],
        expectedError: /invalid integer|unknown argument/i
      },
      {
        name: 'Rejects floating point number (--products=12.5)',
        args: ['--products=12.5'],
        expectedError: /invalid integer|unknown argument/i
      },
      {
        name: 'Rejects key-value drop flag (--drop=true)',
        args: ['--drop=true'],
        expectedError: /unknown argument/i
      }
    ];

    for (const tc of adversarialTestCases) {
      test(tc.name, () => {
        const res = spawnSync(process.execPath, [SEED_BENCH_PATH, ...tc.args], {
          encoding: 'utf8',
          env: process.env
        });

        // 1. Process must fail with non-zero exit code
        assert.notEqual(res.status, 0, `Process must exit with non-zero status for args: ${tc.args.join(' ')}`);

        // 2. Error output must contain descriptive message
        const combinedOutput = (res.stderr || '') + (res.stdout || '');
        assert.match(
          combinedOutput,
          tc.expectedError,
          `Error output must match ${tc.expectedError}. Actual: ${combinedOutput}`
        );

        // 3. Process must terminate BEFORE connecting to MongoDB
        assert.equal(
          combinedOutput.includes('[seedBench] uri='),
          false,
          'Process must not output DB connection URI when arguments are invalid'
        );
        assert.equal(
          combinedOutput.includes('[seedBench] scale:'),
          false,
          'Process must not proceed to scale logging when arguments are invalid'
        );
      });
    }
  });

  describe('In-Memory Parser Contract & Scale Presets', () => {
    let parseArgs;
    try {
      const mod = require('../scripts/seedBench');
      parseArgs = mod.parseArgs;
    } catch (_) {}

    test('seedBench.js exports parseArgs function', () => {
      assert.equal(typeof parseArgs, 'function', 'seedBench.js must export parseArgs for direct testing');
    });

    test('--medium preset returns expected 50k/100k/400k scale', () => {
      if (typeof parseArgs !== 'function') return;
      const opts = parseArgs(['node', 'seedBench.js', '--medium']);
      assert.equal(opts.products, 50000);
      assert.equal(opts.orders, 100000);
      assert.equal(opts.items, 400000);
      assert.equal(opts.vendors, 100);
      assert.equal(opts.categories, 30);
      assert.equal(opts.users, 20000);
      assert.equal(opts.reviews, 100000);
      assert.equal(opts.drop, false);
    });

    test('--small preset returns expected small scale', () => {
      if (typeof parseArgs !== 'function') return;
      const opts = parseArgs(['node', 'seedBench.js', '--small']);
      assert.equal(opts.products, 3000);
      assert.equal(opts.orders, 12000);
      assert.equal(opts.items, 48000);
      assert.equal(opts.vendors, 20);
      assert.equal(opts.categories, 12);
      assert.equal(opts.users, 2000);
      assert.equal(opts.reviews, 8000);
      assert.equal(opts.drop, false);
    });

    test('--medium --drop sets drop to true and preserves medium scale', () => {
      if (typeof parseArgs !== 'function') return;
      const opts = parseArgs(['node', 'seedBench.js', '--medium', '--drop']);
      assert.equal(opts.products, 50000);
      assert.equal(opts.drop, true);
    });

    test('valid custom overrides succeed', () => {
      if (typeof parseArgs !== 'function') return;
      const opts = parseArgs(['node', 'seedBench.js', '--products=500', '--orders=1000', '--seed=9999']);
      assert.equal(opts.products, 500);
      assert.equal(opts.orders, 1000);
      assert.equal(opts.seed, 9999);
    });
  });
});
