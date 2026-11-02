'use strict';
/**
 * Bloom filter property test + client/server hashing agreement.
 * Run: node --test tests/bloom.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { BloomFilterSet, ExactSet } = require('../pt/filters');
const { connectBench, disconnectBench } = require('../pt/benchDb');

function objectIdString() { return new mongoose.Types.ObjectId().toString(); }

test('Bloom: 120k keys (mixed ObjectIds) have zero false negatives', () => {
  const N = 120000;
  const keys = [];
  for (let i = 0; i < N; i++) keys.push(i % 2 === 0 ? objectIdString() : `k-${i}`);
  const b = new BloomFilterSet(keys);
  let fn = 0;
  for (const k of keys) if (!b.has(k)) fn++;
  assert.strictEqual(fn, 0, `false negatives must be 0 (got ${fn})`);
  assert.strictEqual(b.size(), N);
  console.log(`[bloom] members=${N} bits=${b._bits} false-negatives=${fn}`);
});

test('Bloom: measured false-positive rate on 100k non-members', () => {
  const N = 120000;
  const keys = [];
  for (let i = 0; i < N; i++) keys.push(objectIdString());
  const b = new BloomFilterSet(keys);
  const probes = 100000;
  let fp = 0;
  for (let i = 0; i < probes; i++) {
    const nm = objectIdString();
    if (b.has(nm)) fp++;
  }
  const fpr = fp / probes;
  console.log(`[bloom] bits=${b._bits} k=3 probes=${probes} false-positives=${fp} FPR=${(fpr * 100).toFixed(3)}%`);
  assert.ok(fpr < 0.05, `FPR should be small (got ${fpr})`);
});

test('ExactSet: dedupes and drops null/undefined keys', () => {
  const s = new ExactSet([1, 1, 'a', 'a', 2, null, undefined, null]);
  assert.strictEqual(s.size(), 3);
  assert.ok(s.has(1) && s.has('a') && s.has(2));
  assert.ok(!s.has(null) && !s.has(undefined));
});

test('ExactSet: values are distinct', () => {
  const s = new ExactSet([1, 2, 2, '2']);
  // '2' and 2 are distinct string forms? String(2)==='2' -> deduped. size 2.
  assert.strictEqual(s.size(), 2);
  assert.strictEqual(new Set(s.values().map(String)).size, s.size());
});

test('Bloom and Exact agree with server-side $function (zero false negatives)', async (t) => {
  let connected = false;
  try { await connectBench(); connected = true; } catch (e) { t.skip(`no bench DB: ${e.message}`); return; }
  try {
    const db = mongoose.connection.db;
    const coll = db.collection('pt_test_bloom');
    await coll.drop().catch(() => {});
    const members = Array.from({ length: 3000 }, () => new mongoose.Types.ObjectId());
    const nonMembers = Array.from({ length: 3000 }, () => new mongoose.Types.ObjectId());
    const docs = [
      ...members.map((k) => ({ k })),
      ...nonMembers.map((k) => ({ k }))
    ];
    await coll.insertMany(docs);

    const bloom = new BloomFilterSet(members);
    const clause = bloom.toMongoClause('k');
    const matched = await coll.find(clause).project({ k: 1 }).toArray();
    const matchedSet = new Set(matched.map((d) => String(d.k)));
    const memberSet = new Set(members.map(String));

    const fn = [...memberSet].filter((m) => !matchedSet.has(m)).length;
    const fp = [...matchedSet].filter((m) => !memberSet.has(m)).length;
    console.log(`[bloom-db] members=${members.length} matched=${matchedSet.size} FN=${fn} FP=${fp} FPR=${(fp / nonMembers.length * 100).toFixed(3)}%`);
    assert.strictEqual(fn, 0, 'server-side $function must have zero false negatives');

    await coll.drop().catch(() => {});
  } finally {
    if (connected) await disconnectBench();
  }
});
