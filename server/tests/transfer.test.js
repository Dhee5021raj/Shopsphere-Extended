'use strict';
/**
 * Transfer correctness tests:
 *  - dangling tuples: after both passes (exact sets, no skips) every surviving
 *    row of every relation must participate in the final join result;
 *  - null join keys are dropped and transferred sets are distinct.
 *
 * Run: node --test tests/transfer.test.js   (requires a seeded bench DB)
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { connectBench, disconnectBench } = require('../pt/benchDb');
const { byName } = require('../pt/specs');
const { runTransfer, constraintsToMatch } = require('../pt/transfer');
const { runPipeline, collectNeededFields, fullCollectionOf } = require('../pt/execute');
const { resolveLocalFilter, modelForCollection } = require('../pt/querySpec');
const { makeSet, ExactSet, BloomFilterSet } = require('../pt/filters');

test('dangling tuples: reduced relations == projection of final join (selective spec)', async (t) => {
  try { await connectBench(); } catch (e) { t.skip(`no bench DB: ${e.message}`); return; }
  try {
    const spec = byName['rare_category_revenue_7d'];
    const now = new Date();
    const transfer = await runTransfer(spec, { now, setKind: 'exact', log: () => {} });

    const skipped = transfer.stats.filter((s) => s.skipped);
    assert.strictEqual(skipped.length, 0, `expected no skipped edges, got ${JSON.stringify(skipped)}`);

    // 1) surviving rows per relation after the reduced-instance filter
    const surviving = {};
    for (const r of spec.relations) {
      const Model = modelForCollection(r.collection);
      const match = { $and: [transfer.localFilters.get(r.alias), constraintsToMatch(transfer.constraints.get(r.alias))] };
      surviving[r.alias] = await Model.countDocuments(match);
    }

    // 2) distinct rows per relation that participate in the FULL join
    const order = spec.relations.map((r) => r.alias);
    const rows = await runPipeline(spec, order, {
      collectionOf: fullCollectionOf(spec), applyLocalFilters: true, now,
      needed: collectNeededFields(spec), rawJoin: true
    });
    const inJoin = {};
    for (const r of spec.relations) inJoin[r.alias] = new Set(rows.map((row) => String(row[`${r.alias}__id`]))).size;

    console.log('[dangling] relation  surviving  in-final-join');
    for (const r of spec.relations) {
      console.log(`[dangling]   ${r.alias.padEnd(6)}  ${String(surviving[r.alias]).padStart(7)}  ${String(inJoin[r.alias]).padStart(10)}`);
    }
    for (const r of spec.relations) {
      assert.strictEqual(
        surviving[r.alias], inJoin[r.alias],
        `dangling tuples in '${r.alias}': ${surviving[r.alias]} survivors vs ${inJoin[r.alias]} in final join`
      );
    }
  } finally {
    await disconnectBench();
  }
});

test('null join keys are dropped and sets are distinct (via distinct())', async (t) => {
  try { await connectBench(); } catch (e) { t.skip(`no bench DB: ${e.message}`); return; }
  try {
    const db = mongoose.connection.db;
    const coll = db.collection('pt_test_nulls');
    await coll.drop().catch(() => {});
    const x = new mongoose.Types.ObjectId();
    await coll.insertMany([
      { k: x }, { k: x },                 // duplicate
      { k: null },                          // explicit null
      { other: 1 }                          // missing k
    ]);
    const distinct = await coll.distinct('k'); // includes null for null/missing
    const set = makeSet(distinct, 'exact');
    console.log(`[nulls] distinct=${JSON.stringify(distinct.map(String))} setSize=${set.size()} hasNull=${set.has(null)}`);
    assert.strictEqual(set.size(), 1, 'only one non-null distinct key expected');
    assert.ok(set.has(x), 'the real key must be present');
    assert.ok(!set.has(null), 'null must be dropped');
    assert.strictEqual(new Set(distinct).size >= set.size(), true, 'sets must be distinct');

    const bloom = new BloomFilterSet(distinct.filter((v) => v != null));
    assert.ok(bloom.has(x) && !bloom.has(null));
    await coll.drop().catch(() => {});
  } finally {
    await disconnectBench();
  }
});
