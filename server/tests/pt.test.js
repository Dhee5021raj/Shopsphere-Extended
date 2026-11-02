'use strict';
/**
 * Step 8 — structural + correctness tests for mongo-pt.
 *
 *  1. acyclicity detection: a chain and a star are accepted, a triangle is rejected.
 *  2. schedule shape: forward pass then backward pass, root = largest relation.
 *  3. naive vs reduced equality on a TINY seeded dataset (a dedicated
 *     `shopsphere_bench_pttest` DB) for every spec and 3 join orders.
 *
 * Run: node --test tests/pt.test.js   (requires a real mongod)
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const { buildJoinGraph, isAcyclic, assertAcyclic } = require('../pt/joinGraph');
const { buildSchedule } = require('../pt/schedule');
const { specs } = require('../pt/specs');
const { runNaive, runReduced, validJoinOrders, resultsEqual } = require('../pt/execute');
const { modelForCollection } = require('../pt/querySpec');

// ── synthetic specs (no DB) ───────────────────────────────────
const chain = {
  relations: [{ alias: 'a', collection: 'A' }, { alias: 'b', collection: 'B' }, { alias: 'c', collection: 'C' }],
  edges: [{ left: 'a.x', right: 'b.y' }, { left: 'b.z', right: 'c.w' }]
};
const star = {
  relations: [{ alias: 'hub', collection: 'H' }, { alias: 'l1', collection: 'A' }, { alias: 'l2', collection: 'B' }, { alias: 'l3', collection: 'C' }],
  edges: [{ left: 'l1.h', right: 'hub.id' }, { left: 'l2.h', right: 'hub.id' }, { left: 'l3.h', right: 'hub.id' }]
};
const triangle = {
  relations: [{ alias: 'a', collection: 'A' }, { alias: 'b', collection: 'B' }, { alias: 'c', collection: 'C' }],
  edges: [{ left: 'a.x', right: 'b.y' }, { left: 'b.z', right: 'c.w' }, { left: 'a.u', right: 'c.v' }]
};

test('acyclicity: chain accepted', () => {
  assert.strictEqual(isAcyclic(buildJoinGraph(chain)), true);
  assert.doesNotThrow(() => assertAcyclic(chain));
});

test('acyclicity: star accepted', () => {
  assert.strictEqual(isAcyclic(buildJoinGraph(star)), true);
  assert.doesNotThrow(() => assertAcyclic(star));
});

test('acyclicity: triangle rejected with a clear error', () => {
  assert.strictEqual(isAcyclic(buildJoinGraph(triangle)), false);
  assert.throws(() => assertAcyclic(triangle), /cyclic/i);
});

test('schedule: forward pass then backward pass, root is the largest relation', () => {
  const sizes = { a: 5, b: 100, c: 10 }; // b is largest -> root
  const s = buildSchedule(chain, sizes);
  assert.strictEqual(s.root, 'b');
  const dirs = s.steps.map((x) => x.direction);
  const lastForward = dirs.lastIndexOf('forward');
  const firstBackward = dirs.indexOf('backward');
  assert.ok(lastForward >= 0 && firstBackward >= 0, `expected both passes, got ${dirs.join(',')}`);
  assert.ok(lastForward < firstBackward, `forward must all precede backward: ${dirs.join(',')}`);
  assert.strictEqual(s.steps.length, 4, 'a 3-node chain has 2 forward + 2 backward steps');
  assert.ok(s.steps.every((x) => x.target && x.filterBy && x.on.targetField && x.on.filterField));
});

// ── tiny dataset ──────────────────────────────────────────────
const TINY_URI = 'mongodb://127.0.0.1:27018/shopsphere_bench_pttest';
const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const oid = () => new mongoose.Types.ObjectId();

async function seedTiny() {
  process.env.BENCH_URI = TINY_URI;
  const { connectBench } = require('../pt/benchDb');
  await connectBench();
  const db = mongoose.connection.db;
  for (const name of ['users', 'vendors', 'categories', 'products', 'orders', 'order_items', 'reviews']) {
    await db.collection(name).deleteMany({});
  }

  const u0 = oid(), u1 = oid();
  const v0 = oid(), v1 = oid();
  const cRare = oid(), cCommon = oid(), cOther = oid();
  const p0 = oid(), p1 = oid(), p2 = oid(), p3 = oid(), p4 = oid();
  const o0 = oid(), o1 = oid(), o2 = oid(), o3 = oid(), o4 = oid();

  const M = (alias) => modelForCollection(alias);
  await Promise.all([
    M('users').insertMany([
      { _id: u0, name: 'User 7', email: 'user7@bench.local', created_at: daysAgo(30) },
      { _id: u1, name: 'Other', email: 'other@bench.local', created_at: daysAgo(30) }
    ]),
    M('vendors').insertMany([
      { _id: v0, name: 'Vendor 0', rating: 4, created_at: daysAgo(30) },
      { _id: v1, name: 'Vendor 1', rating: 3, created_at: daysAgo(30) }
    ]),
    M('categories').insertMany([
      { _id: cRare, name: 'Rare', is_rare: true, created_at: daysAgo(30) },
      { _id: cCommon, name: 'Category 1', is_rare: false, created_at: daysAgo(30) },
      { _id: cOther, name: 'Category 2', is_rare: false, created_at: daysAgo(30) }
    ]),
    M('products').insertMany([
      { _id: p0, name: 'P0', vendor_id: v0, category_id: cRare, price: 10, stock: 5, created_at: daysAgo(30) },
      { _id: p1, name: 'P1', vendor_id: v0, category_id: cCommon, price: 20, stock: 5, created_at: daysAgo(30) },
      { _id: p2, name: 'P2', vendor_id: v1, category_id: cCommon, price: 30, stock: 5, created_at: daysAgo(30) },
      { _id: p3, name: 'P3', vendor_id: v1, category_id: cRare, price: 40, stock: 5, created_at: daysAgo(30) },
      { _id: p4, name: 'P4', vendor_id: v0, category_id: cOther, price: 50, stock: 5, created_at: daysAgo(30) }
    ]),
    M('orders').insertMany([
      { _id: o0, user_id: u0, status: 'Delivered', total_amount: 100, created_at: daysAgo(1) },
      { _id: o1, user_id: u0, status: 'Delivered', total_amount: 40, created_at: daysAgo(2) },
      { _id: o2, user_id: u1, status: 'Delivered', total_amount: 10, created_at: daysAgo(10) },
      { _id: o3, user_id: u1, status: 'Delivered', total_amount: 20, created_at: daysAgo(200) },
      { _id: o4, user_id: u0, status: 'Delivered', total_amount: 10, created_at: daysAgo(400) }
    ]),
    M('order_items').insertMany([
      { _id: oid(), order_id: o0, product_id: p0, vendor_id: v0, quantity: 1, price: 10, line_total: 10, created_at: daysAgo(1) },
      { _id: oid(), order_id: o0, product_id: p1, vendor_id: v0, quantity: 2, price: 20, line_total: 40, created_at: daysAgo(1) },
      { _id: oid(), order_id: o0, product_id: p2, vendor_id: v1, quantity: 1, price: 30, line_total: 30, created_at: daysAgo(1) },
      { _id: oid(), order_id: o1, product_id: p3, vendor_id: v1, quantity: 1, price: 40, line_total: 40, created_at: daysAgo(2) },
      { _id: oid(), order_id: o2, product_id: p0, vendor_id: v0, quantity: 1, price: 10, line_total: 10, created_at: daysAgo(10) },
      { _id: oid(), order_id: o3, product_id: p1, vendor_id: v0, quantity: 1, price: 20, line_total: 20, created_at: daysAgo(200) },
      { _id: oid(), order_id: o4, product_id: p0, vendor_id: v0, quantity: 1, price: 10, line_total: 10, created_at: daysAgo(400) }
    ]),
    M('reviews').insertMany([
      { _id: oid(), user_id: u0, product_id: p1, vendor_id: v0, rating: 1, created_at: daysAgo(3) },
      { _id: oid(), user_id: u1, product_id: p0, vendor_id: v0, rating: 2, created_at: daysAgo(4) },
      { _id: oid(), user_id: u0, product_id: p0, vendor_id: v0, rating: 5, created_at: daysAgo(5) }
    ])
  ]);
  return db;
}

test('naive == reduced for every spec on a tiny dataset and 3 join orders', async (t) => {
  let db;
  try {
    db = await seedTiny();
  } catch (e) {
    t.skip(`no real mongod at ${TINY_URI}: ${e.message}`);
    return;
  }
  try {
    for (const spec of specs) {
      const now = new Date();
      const orders = validJoinOrders(spec);
      assert.ok(orders.length > 0, `${spec.name}: no valid join orders`);
      const picks = [orders[0], orders[Math.floor(orders.length / 2)], orders[orders.length - 1]];
      const seen = new Set();
      for (const order of picks) {
        const key = order.join('>');
        if (seen.has(key)) continue;
        seen.add(key);

        const naive = await runNaive(spec, order, { now });
        const reduced = await runReduced(spec, order, { now, cap: 500000 });
        const eq = resultsEqual(naive.result, reduced.result);
        assert.ok(
          eq.equal,
          `${spec.name} order=${key}: naive and reduced differ — ${eq.reason}`
        );
        console.log(`[pt] ${spec.name.padEnd(34)} order=${key.padEnd(28)} rows=${eq.rows} equal=ok`);
      }
    }
  } finally {
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  }
});
