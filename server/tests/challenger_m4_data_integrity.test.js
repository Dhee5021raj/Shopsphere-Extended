'use strict';

/**
 * challenger_m4_data_integrity.test.js
 *
 * Milestone 4 Challenger 2 Test Suite:
 * Empirical adversarial stress-testing of:
 * 1. CLI argument validation & zero database mutations on adversarial inputs to seedBench.js
 * 2. Benchmark database scale, secondary indexes, and deliberate academic skew
 * 3. Exact tuple count and polynomial checksum parity across queries
 * 4. Measurable semi-join speedup (>1x) on selective multi-relation queries
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { MongoClient } = require('mongodb');
const { connectBench, disconnectBench, benchUri } = require('../pt/benchDb');
const { specs, byName, makeLiveSearchSpec } = require('../pt/specs');
const { runNaive, runReduced, resultsEqual, checksum } = require('../pt/execute');

const EXPECTED_MIN_COUNTS = {
  products: 50000,
  orders: 100000,
  order_items: 400000,
  users: 20000,
  reviews: 100000,
  vendors: 100,
  categories: 30
};

const REQUIRED_INDEXES = {
  products: ['category_id_1', 'vendor_id_1'],
  orders: ['user_id_1', 'created_at_1'],
  order_items: ['order_id_1', 'product_id_1', 'vendor_id_1', 'created_at_1'],
  reviews: ['product_id_1', 'user_id_1', 'vendor_id_1'],
  users: ['email_1']
};

describe('Milestone 4 Challenger 2: Data Integrity & Semi-Join Performance Hardener', () => {
  let mongoClient;
  let db;
  let dbAvailable = false;

  before(async () => {
    try {
      const uri = benchUri();
      mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
      await mongoClient.connect();
      db = mongoClient.db('shopsphere_bench');
      await db.command({ ping: 1 });
      dbAvailable = true;
    } catch (err) {
      console.warn('[CHALLENGER-M4] MongoDB bench database not available:', err.message);
      dbAvailable = false;
    }
  });

  after(async () => {
    if (mongoClient) {
      await mongoClient.close().catch(() => {});
    }
  });

  // ─── SUITE 1: ADVERSARIAL CLI ARGUMENTS & ZERO DB MUTATIONS ───────────────────
  describe('Suite 1: Adversarial CLI Argument Hardening & Zero Database Mutations (seedBench.js)', () => {
    const seedBenchPath = path.resolve(__dirname, '..', 'scripts', 'seedBench.js');

    const ADVERSARIAL_CASES = [
      // Negative scale values
      { name: 'Negative products', args: ['--products=-50'], expectPattern: /must be a positive integer/i },
      { name: 'Negative orders', args: ['--orders=-100'], expectPattern: /must be a positive integer/i },
      { name: 'Negative items', args: ['--items=-500'], expectPattern: /must be a positive integer/i },
      { name: 'Negative vendors', args: ['--vendors=-10'], expectPattern: /must be a positive integer/i },
      { name: 'Negative categories', args: ['--categories=-5'], expectPattern: /must be a positive integer/i },
      { name: 'Negative users', args: ['--users=-50'], expectPattern: /must be a positive integer/i },
      { name: 'Negative reviews', args: ['--reviews=-20'], expectPattern: /must be a positive integer/i },
      { name: 'Negative batch', args: ['--batch=-100'], expectPattern: /must be a positive integer/i },

      // Zero scale values
      { name: 'Zero products', args: ['--products=0'], expectPattern: /must be a positive integer/i },
      { name: 'Zero orders', args: ['--orders=0'], expectPattern: /must be a positive integer/i },
      { name: 'Zero items', args: ['--items=0'], expectPattern: /must be a positive integer/i },
      { name: 'Zero vendors', args: ['--vendors=0'], expectPattern: /must be a positive integer/i },
      { name: 'Zero categories', args: ['--categories=0'], expectPattern: /must be a positive integer/i },
      { name: 'Zero users', args: ['--users=0'], expectPattern: /must be a positive integer/i },
      { name: 'Zero reviews', args: ['--reviews=0'], expectPattern: /must be a positive integer/i },
      { name: 'Zero batch', args: ['--batch=0'], expectPattern: /must be a positive integer/i },

      // Negative seed
      { name: 'Negative seed (-1)', args: ['--seed=-1'], expectPattern: /must be a non-negative integer/i },
      { name: 'Negative seed (-9999)', args: ['--seed=-9999'], expectPattern: /must be a non-negative integer/i },

      // Floating-point values
      { name: 'Float products (10.5)', args: ['--products=10.5'], expectPattern: /must be an integer/i },
      { name: 'Float orders (99.9)', args: ['--orders=99.9'], expectPattern: /must be an integer/i },
      { name: 'Float seed (3.14)', args: ['--seed=3.14'], expectPattern: /must be an integer/i },

      // Non-numeric / malformed values
      { name: 'String products (abc)', args: ['--products=abc'], expectPattern: /must be an integer/i },
      { name: 'NaN orders', args: ['--orders=NaN'], expectPattern: /must be an integer/i },
      { name: 'Infinity items', args: ['--items=Infinity'], expectPattern: /must be an integer/i },
      { name: 'Empty products value', args: ['--products='], expectPattern: /must be an integer/i },

      // Integer overflow exceeding MAX_SAFE_INTEGER
      { name: 'Overflow products', args: ['--products=9007199254740992'], expectPattern: /must be an integer/i },

      // Unknown flags & injection vectors
      { name: 'Unknown option', args: ['--unknown=10'], expectPattern: /unknown argument/i },
      { name: 'Unrecognized bare flag', args: ['--badflag'], expectPattern: /unknown argument/i },
      { name: 'Malicious injection flag', args: ['--eval="db.dropDatabase()"'], expectPattern: /unknown argument/i },

      // Adversarial combinations with destructive --drop flag
      { name: 'Adversarial --drop with negative products', args: ['--drop', '--products=-50'], expectPattern: /must be a positive integer/i },
      { name: 'Reversed flag order with --drop', args: ['--products=-50', '--drop'], expectPattern: /must be a positive integer/i },
      { name: 'Adversarial --drop with zero orders', args: ['--drop', '--orders=0'], expectPattern: /must be a positive integer/i },
      { name: 'Adversarial --drop with unknown arg', args: ['--drop', '--malicious=1'], expectPattern: /unknown argument/i },
      { name: 'Adversarial --drop with negative seed', args: ['--drop', '--seed=-1'], expectPattern: /must be a non-negative integer/i },
      { name: 'Adversarial --drop with non-numeric value', args: ['--drop', '--products=xyz'], expectPattern: /must be an integer/i },
      { name: 'Adversarial --drop with zero batch', args: ['--drop', '--batch=0'], expectPattern: /must be a positive integer/i },
      { name: 'Adversarial --drop with overflow integer', args: ['--drop', '--products=9007199254740992'], expectPattern: /must be an integer/i }
    ];

    test('All adversarial CLI cases fail fast and abort before connecting', async (t) => {
      if (!dbAvailable) return t.skip('MongoDB bench DB offline');

      // Snapshot baseline counts
      const countsBefore = {};
      for (const coll of Object.keys(EXPECTED_MIN_COUNTS)) {
        countsBefore[coll] = await db.collection(coll).countDocuments();
      }

      for (const tc of ADVERSARIAL_CASES) {
        const res = spawnSync(process.execPath, [seedBenchPath, ...tc.args], {
          encoding: 'utf8',
          env: process.env
        });

        assert.notStrictEqual(res.status, 0, `Expected failure for case: ${tc.name}`);
        const output = (res.stderr || '') + (res.stdout || '');
        assert.ok(tc.expectPattern.test(output), `Output should match ${tc.expectPattern} for ${tc.name}, got: ${output}`);
        assert.ok(!output.includes('[seedBench] scale:'), `Must abort before logging scale for ${tc.name}`);
        assert.ok(!output.includes('dropping existing bench collections'), `Must not drop collections for ${tc.name}`);
      }

      // Snapshot counts after running ALL adversarial test cases
      for (const coll of Object.keys(EXPECTED_MIN_COUNTS)) {
        const countAfter = await db.collection(coll).countDocuments();
        assert.strictEqual(countAfter, countsBefore[coll], `Zero mutations invariant violated in ${coll}: before=${countsBefore[coll]}, after=${countAfter}`);
      }
    });
  });

  // ─── SUITE 2: BENCHMARK DATASET SCALE, INDEXES & DELIBERATE SKEW ─────────────
  describe('Suite 2: Benchmark Dataset Scale, Secondary Indexes, and Skew Invariants', () => {
    test('All 7 benchmark collections satisfy minimum document count thresholds', async (t) => {
      if (!dbAvailable) return t.skip('MongoDB bench DB offline');

      for (const [coll, minCount] of Object.entries(EXPECTED_MIN_COUNTS)) {
        const count = await db.collection(coll).countDocuments();
        assert.ok(count >= minCount, `Collection ${coll} count ${count} must be >= ${minCount}`);
      }
    });

    test('All required secondary indexes exist on benchmark collections', async (t) => {
      if (!dbAvailable) return t.skip('MongoDB bench DB offline');

      for (const [coll, reqIndexes] of Object.entries(REQUIRED_INDEXES)) {
        const existing = (await db.collection(coll).indexes()).map((i) => i.name);
        for (const req of reqIndexes) {
          assert.ok(existing.includes(req), `Required index ${coll}.${req} missing`);
        }
      }
    });

    test('Deliberate academic skew matches target distribution ranges', async (t) => {
      if (!dbAvailable) return t.skip('MongoDB bench DB offline');

      // Rare category product share in [0.2%, 1.5%]
      const totalProducts = await db.collection('products').countDocuments();
      const rareCat = await db.collection('categories').findOne({ is_rare: true });
      assert.ok(rareCat, 'Rare category document must exist');
      const rareProducts = await db.collection('products').countDocuments({ category_id: rareCat._id });
      const rarePct = (100 * rareProducts) / totalProducts;
      assert.ok(rarePct >= 0.2 && rarePct <= 1.5, `Rare category share ${rarePct.toFixed(2)}% must be between 0.2% and 1.5%`);

      // 7-day order volume in [1.0%, 3.0%]
      const totalOrders = await db.collection('orders').countDocuments();
      const recentOrders = await db.collection('orders').countDocuments({
        created_at: { $gte: new Date(Date.now() - 7 * 86400e3) }
      });
      const recentPct = (100 * recentOrders) / totalOrders;
      assert.ok(recentPct >= 1.0 && recentPct <= 3.0, `7-day order share ${recentPct.toFixed(2)}% must be between 1.0% and 3.0%`);
    });
  });

  // ─── SUITE 3: EMPIRICAL SEMI-JOIN SPEEDUP VERIFICATION ────────────────────────
  describe('Suite 3: Empirical Semi-Join Performance Speedup (> 1.0x on Selective Queries)', () => {
    test('rare_category_revenue_7d demonstrates prominent speedup (> 1.0x) on un-optimized join order', async (t) => {
      if (!dbAvailable) return t.skip('MongoDB bench DB offline');

      await connectBench();
      try {
        const spec = byName['rare_category_revenue_7d'];
        const order = ['p', 'cat', 'oi', 'v', 'o']; // pinned order that stars product scan
        const now = new Date();

        const t0 = Date.now();
        const red = await runReduced(spec, order, { now });
        const redMs = Date.now() - t0;

        const t1 = Date.now();
        const naive = await runNaive(spec, order, { now });
        const naiveMs = Date.now() - t1;

        const speedup = +(naiveMs / (redMs || 1)).toFixed(2);
        assert.ok(speedup > 1.0, `Expected speedup > 1.0x on rare_category_revenue_7d, observed ${speedup}x (naive=${naiveMs}ms, reduced=${redMs}ms)`);
        assert.ok(red.result && red.result.length > 0, 'Optimized query must return matching rows');
        assert.strictEqual(red.result.length, naive.result.length, 'Exact tuple count parity required');

        const chkNaive = checksum(naive.result);
        const chkRed = checksum(red.result);
        assert.strictEqual(chkNaive, chkRed, 'Polynomial checksums must match exactly');

        const eq = resultsEqual(naive.result, red.result);
        assert.strictEqual(eq.equal, true, `Result equality check failed: ${eq.reason}`);
      } finally {
        await disconnectBench().catch(() => {});
      }
    });
  });

  // ─── SUITE 4: DATA PARITY & POLYNOMIAL CHECKSUMS ACROSS QUERIES ───────────────
  describe('Suite 4: Result Parity & Polynomial Checksums Across Multiple Query Specs', () => {
    test('user_scoped_spend_30d: exact tuple count and polynomial checksum parity', async (t) => {
      if (!dbAvailable) return t.skip('MongoDB bench DB offline');

      await connectBench();
      try {
        const spec = byName['user_scoped_spend_30d'];
        const order = ['u', 'o', 'oi', 'p'];
        const now = new Date();

        const [naive, red] = await Promise.all([
          runNaive(spec, order, { now }),
          runReduced(spec, order, { now })
        ]);

        assert.strictEqual(naive.result.length, red.result.length, 'Tuple count parity');
        const chkNaive = checksum(naive.result);
        const chkRed = checksum(red.result);
        assert.strictEqual(chkNaive, chkRed, `Polynomial checksum mismatch on ${spec.name}`);
        const eq = resultsEqual(naive.result, red.result);
        assert.strictEqual(eq.equal, true, `Result mismatch on ${spec.name}: ${eq.reason}`);
      } finally {
        await disconnectBench().catch(() => {});
      }
    });

    test('rare_category_revenue_7d on standard join order: exact parity & polynomial checksum', async (t) => {
      if (!dbAvailable) return t.skip('MongoDB bench DB offline');

      await connectBench();
      try {
        const spec = byName['rare_category_revenue_7d'];
        const order = ['cat', 'p', 'oi', 'o', 'v'];
        const now = new Date();

        const [naive, red] = await Promise.all([
          runNaive(spec, order, { now }),
          runReduced(spec, order, { now })
        ]);

        assert.strictEqual(naive.result.length, red.result.length, 'Tuple count parity');
        const chkNaive = checksum(naive.result);
        const chkRed = checksum(red.result);
        assert.strictEqual(chkNaive, chkRed, `Polynomial checksum mismatch on ${spec.name}`);
        const eq = resultsEqual(naive.result, red.result);
        assert.strictEqual(eq.equal, true, `Result mismatch on ${spec.name}: ${eq.reason}`);
      } finally {
        await disconnectBench().catch(() => {});
      }
    });

    test('low_rating_reviews_by_category: exact parity & polynomial checksum', async (t) => {
      if (!dbAvailable) return t.skip('MongoDB bench DB offline');

      await connectBench();
      try {
        const spec = byName['low_rating_reviews_by_category'];
        const order = ['r', 'p', 'c', 'v'];
        const now = new Date();

        const [naive, red] = await Promise.all([
          runNaive(spec, order, { now }),
          runReduced(spec, order, { now })
        ]);

        assert.strictEqual(naive.result.length, red.result.length, 'Tuple count parity');
        const chkNaive = checksum(naive.result);
        const chkRed = checksum(red.result);
        assert.strictEqual(chkNaive, chkRed, `Polynomial checksum mismatch on ${spec.name}`);
        const eq = resultsEqual(naive.result, red.result);
        assert.strictEqual(eq.equal, true, `Result mismatch on ${spec.name}: ${eq.reason}`);
      } finally {
        await disconnectBench().catch(() => {});
      }
    });

    test('makeLiveSearchSpec dynamic query: exact parity & polynomial checksum', async (t) => {
      if (!dbAvailable) return t.skip('MongoDB bench DB offline');

      await connectBench();
      try {
        const spec = makeLiveSearchSpec({ search: 'camera', filters: { minRating: 3 } });
        const order = ['cat', 'p', 'oi', 'o', 'v'];
        const now = new Date();

        const [naive, red] = await Promise.all([
          runNaive(spec, order, { now }),
          runReduced(spec, order, { now })
        ]);

        assert.strictEqual(naive.result.length, red.result.length, 'Tuple count parity');
        const chkNaive = checksum(naive.result);
        const chkRed = checksum(red.result);
        assert.strictEqual(chkNaive, chkRed, `Polynomial checksum mismatch on live search ${spec.name}`);
        const eq = resultsEqual(naive.result, red.result);
        assert.strictEqual(eq.equal, true, `Result mismatch on live search ${spec.name}: ${eq.reason}`);
      } finally {
        await disconnectBench().catch(() => {});
      }
    });
  });
});
