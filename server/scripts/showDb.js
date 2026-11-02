'use strict';
/**
 * One-command DBMS viva snapshot — what a teacher wants to see, no mongosh needed.
 *
 * Usage:
 *   npm run db:show
 *
 * Shows, for both databases on the bundled mongod (port 27018):
 *   1. which databases exist
 *   2. collection counts + storage sizes
 *   3. the deliberate skew (rare/common category, 7-day window) that enables the speedup
 *   4. one sample document per collection (schema shape, embedded vs referenced)
 *   5. indexes on the join-key collections
 *   6. the mongo-pt shadow log (last 6 runs)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const CONN = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/shopsphere';
const base = CONN.split('/').slice(0, -1).join('/');

const hr = (t) => console.log('\n────────── ' + t + ' ──────────');
const pad = (v, n) => String(v).padEnd(n);
const dim = (s) => '\x1b[2m' + s + '\x1b[0m';

async function main() {
  const client = new MongoClient(base);
  await client.connect();

  try {
    // ── 1. databases ─────────────────────────────────────
    hr('DATABASES on ' + base);
    const dbs = await client.db('admin').admin().listDatabases();
    for (const d of dbs.databases.filter((x) => !['admin', 'local', 'config'].includes(x.name))) {
      console.log('  ' + pad(d.name, 24) + ((d.sizeOnDisk / 1024 / 1024).toFixed(1)) + ' MB');
    }

    // ── 2. collections + counts ──────────────────────────
    for (const [dbName, filter] of [['shopsphere', null], ['shopsphere_bench', null]]) {
      hr('DATABASE: ' + dbName);
      const conn = client.db(dbName);
      const names = (await conn.listCollections().toArray()).map((c) => c.name);
      for (const c of names) {
        const count = await conn.collection(c).countDocuments();
        const stats = await conn.command({ collStats: c }).catch(() => null);
        const size = stats && stats.size ? (stats.size / 1024).toFixed(0) + ' KB' : 'n/a';
        console.log('  ' + pad(c, 14) + String(count).padStart(9) + ' docs   ' + size);
      }
    }

    // ── 3. skew ──────────────────────────────────────────
    hr('DELIBERATE SKEW in shopsphere_bench (why transfer wins here)');
    const b = client.db('shopsphere_bench');
    const totalProducts = await b.collection('products').countDocuments();
    for (const cat of await b.collection('categories').find().limit(6).toArray()) {
      const n = await b.collection('products').countDocuments({ category_id: cat._id });
      console.log('  ' + pad(cat.name, 18) + '   ' + (100 * n / totalProducts).toFixed(1) + '% of products' + (cat.is_rare ? '   ← is_rare: true (SELECTIVE)' : ''));
    }
    const week = await b.collection('orders').countDocuments({ created_at: { $gte: new Date(Date.now() - 7 * 86400e3) } });
    const totalOrders = await b.collection('orders').countDocuments();
    console.log('  orders in last 7 days: ' + week + ' of ' + totalOrders + ' (' + (100 * week / Math.max(totalOrders, 1)).toFixed(1) + '% — the 7d window filter)');
    console.log(dim('  → rare category × recent week prunes the join to ~100s of rows out of ~400k order items'));

    // ── 4. schema samples ────────────────────────────────
    hr('SCHEMA SHAPE — one sample document per collection');
    for (const [dbName, coll] of [['shopsphere_bench', 'order_items'], ['shopsphere_bench', 'products'], ['shopsphere', 'orders']]) {
      const doc = await client.db(dbName).collection(coll).findOne();
      console.log('\n  [' + dbName + '.' + coll + ']' + (dbName === 'shopsphere' && coll === 'orders' ? '  (EMBEDDED design — items array, no join needed)' : ''));
      console.log('    ' + JSON.stringify(doc).slice(0, 240) + ' …');
    }

    // ── 5. indexes ───────────────────────────────────────
    hr('INDEXES on join-key collections (why the reduced $lookup is fast)');
    for (const c of ['order_items', 'products', 'orders']) {
      const idx = await b.collection(c).indexes();
      console.log('  ' + c + ': ' + idx.map((i) => JSON.stringify(i.key) + (i.name && !i.name.includes('_id') ? i.name : '')).join('   '));
    }

    // ── 6. shadow log ────────────────────────────────────
    hr('mongo-pt shadow log (last 6 runs)');
    const logFile = path.join(__dirname, '..', 'logs', 'pt-log.jsonl');
    if (!fs.existsSync(logFile)) {
      console.log('  (empty — search products on the site with PT_SHADOW=1, or run npm run repro)');
    } else {
      fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-6).reverse().forEach((l) => {
        try {
          const r = JSON.parse(l);
          if (r.kind === 'shadow') {
            console.log('  ' + r.ts + '  naive ' + r.naive_ms + 'ms vs reduced ' + Math.round(r.reduced_ms) + 'ms  → ' + r.speedup + 'x   equal: ' + r.equal);
          } else {
            console.log('  [' + r.kind + ']');
          }
        } catch (_) { /* skip */ }
      });
    }

    hr('VIVA NOTES');
    console.log('  demo DB  (shopsphere):        embedded schema, powers the React app UI');
    console.log('  bench DB (shopsphere_bench):  referenced schema — real joins, deliberately skewed data.');
    console.log('                                The mongo-pt predicate-transfer engine runs ONLY here');
    console.log('                                (server/pt/* refuses any other DB name by design).');
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error('[showDb] FAILED:', e.message, '— start the mongod first:  cd server && npm run mongod');
  process.exit(1);
});
