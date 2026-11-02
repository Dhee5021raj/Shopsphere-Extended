/**
 * semijoin-benchmark.js
 * Naive $lookup pipeline vs manual semi-join reduction (predicate-transfer style).
 *
 * Query: revenue per vendor for products in a category, orders in the last N days.
 *
 * Run from server/:  node benchmarks/semijoin-benchmark.js Electronics 30
 *
 * ASSUMPTIONS (edit to match your schemas):
 *   Order   { createdAt, items: [{ product: ObjectId, price: Number, quantity: Number }] }
 *   Product { category: String, vendor: ObjectId }
 *   Vendor  { name: String }
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// ---- adjust these paths/names to your project ----
const Order = require('../models/Order');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
// --------------------------------------------------

const MAX_IN_LIST = 50000; // guard against huge $in lists
const RUNS = 7;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'optimizer-log.jsonl');

// ---------- Variant A: naive, lookup-based ----------
function naivePipeline(category, since) {
  return [
    { $match: { createdAt: { $gte: since } } },
    { $unwind: '$items' },
    { $lookup: { from: Product.collection.name, localField: 'items.product', foreignField: '_id', as: 'p' } },
    { $unwind: '$p' },
    { $match: { 'p.category': category } },
    { $group: { _id: '$p.vendor', revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
    { $lookup: { from: Vendor.collection.name, localField: '_id', foreignField: '_id', as: 'v' } },
    { $unwind: '$v' },
    { $project: { _id: 0, vendor: '$v.name', revenue: 1 } },
    { $sort: { vendor: 1 } },
  ];
}
async function runNaive(category, since) {
  return Order.aggregate(naivePipeline(category, since));
}

// ---------- Variant B: semi-join reduction ----------
// Step 1: small, selective side first. Collect qualifying product ids (+ vendor map).
// Step 2: "transfer" those ids to Order as a filter, before any join work.
// Step 3: group by product, map product -> vendor in application code (no $lookup).
async function optimizedPipelineInput(category) {
  const products = await Product.find({ category }, { vendor: 1 }).lean();
  const ids = products.map((p) => p._id);
  const vendorOf = new Map(products.map((p) => [String(p._id), String(p.vendor)]));
  return { ids, vendorOf };
}
function optimizedPipeline(ids, since) {
  return [
    // first $match uses the multikey index to skip orders with no qualifying product
    { $match: { createdAt: { $gte: since }, 'items.product': { $in: ids } } },
    { $unwind: '$items' },
    // second $match drops non-qualifying line items inside surviving orders
    { $match: { 'items.product': { $in: ids } } },
    { $group: { _id: '$items.product', revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
  ];
}
async function runOptimized(category, since) {
  const { ids, vendorOf } = await optimizedPipelineInput(category);
  if (ids.length > MAX_IN_LIST) throw new Error(`in-list too large (${ids.length}); batch it`);
  const perProduct = await Order.aggregate(optimizedPipeline(ids, since));
  const perVendor = new Map();
  for (const row of perProduct) {
    const v = vendorOf.get(String(row._id));
    perVendor.set(v, (perVendor.get(v) || 0) + row.revenue);
  }
  const vendors = await Vendor.find({ _id: { $in: [...perVendor.keys()] } }, { name: 1 }).lean();
  return vendors
    .map((v) => ({ vendor: v.name, revenue: perVendor.get(String(v._id)) }))
    .sort((a, b) => a.vendor.localeCompare(b.vendor));
}

// ---------- helpers ----------
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

async function timeIt(fn) {
  const t0 = process.hrtime.bigint();
  const out = await fn();
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, out };
}

// walk an explain() result and sum docs/keys examined
function sumStat(obj, key) {
  let total = 0;
  (function walk(o) {
    if (o && typeof o === 'object') {
      if (typeof o[key] === 'number') total += o[key];
      Object.values(o).forEach(walk);
    }
  })(obj);
  return total;
}

async function explainStats(pipeline) {
  const ex = await Order.aggregate(pipeline).explain('executionStats');
  return { docsExamined: sumStat(ex, 'totalDocsExamined'), keysExamined: sumStat(ex, 'totalKeysExamined') };
}

const sameResult = (a, b) =>
  JSON.stringify(a.map((r) => [r.vendor, Math.round(r.revenue * 100)])) ===
  JSON.stringify(b.map((r) => [r.vendor, Math.round(r.revenue * 100)]));

async function main() {
  const category = process.argv[2] || 'Electronics';
  const days = Number(process.argv[3] || 30);
  const since = new Date(Date.now() - days * 864e5);
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shopsphere');

  // indexes the optimized variant relies on
  await Product.collection.createIndex({ category: 1, vendor: 1 });
  await Order.collection.createIndex({ createdAt: 1, 'items.product': 1 });

  // correctness first: both variants must return the same answer
  const a = await runNaive(category, since);
  const b = await runOptimized(category, since);
  if (!sameResult(a, b)) {
    console.error('RESULT MISMATCH between naive and optimized. Check assumptions.');
    process.exit(1);
  }

  const times = { naive: [], optimized: [] };
  for (let i = 0; i < RUNS; i++) {
    // alternate order so cache effects hit both variants equally
    const order = i % 2 ? ['optimized', 'naive'] : ['naive', 'optimized'];
    for (const v of order) {
      const r = await timeIt(() => (v === 'naive' ? runNaive(category, since) : runOptimized(category, since)));
      times[v].push(r.ms);
    }
  }

  const { ids } = await optimizedPipelineInput(category);
  const stats = {
    naive: await explainStats(naivePipeline(category, since)),
    optimized: await explainStats(optimizedPipeline(ids, since)), // aggregate step only
  };

  const record = {
    ts: new Date().toISOString(),
    query: 'revenue_per_vendor',
    params: { category, days },
    qualifyingProducts: ids.length,
    naive: { medianMs: median(times.naive), ...stats.naive },
    optimized: { medianMs: median(times.optimized), ...stats.optimized },
    speedup: median(times.naive) / median(times.optimized),
  };
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');
  console.log(JSON.stringify(record, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
