'use strict';
/**
 * Seed the mongo-pt benchmark database (`shopsphere_bench`) with a normalized,
 * deliberately SKEWED dataset. Deterministic given --seed.
 *
 * Usage:
 *   node scripts/seedBench.js --small --drop      # tiny, for tests/dev
 *   node scripts/seedBench.js --drop              # full default scale
 *   node scripts/seedBench.js --products=5000 --orders=20000 --items=80000
 *
 * Scale flags (defaults): --products=200000 --orders=1000000 --items=4000000
 *   --vendors=200 --categories=50 --users=100000 --reviews=1000000
 * Other flags: --seed=12345 --batch=5000 --drop
 */
const mongoose = require('mongoose');
const { connectBench, disconnectBench, benchUri } = require('../pt/benchDb');
const { User, Vendor, Category, Product, Order, OrderItem, Review } = require('../pt/schema');

// ── deterministic PRNG (mulberry32) ──────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALLOWED_NUMERIC_KEYS = new Set([
  'products', 'orders', 'items', 'vendors', 'categories',
  'users', 'reviews', 'seed', 'batch'
]);
const NUMERIC_KEYS = ALLOWED_NUMERIC_KEYS;

function parseArgs(argv) {
  const opts = {
    products: 200000, orders: 1000000, items: 4000000,
    vendors: 200, categories: 50, users: 100000, reviews: 1000000,
    seed: 12345, batch: 5000, drop: false
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--small') {
      Object.assign(opts, { products: 3000, orders: 12000, items: 48000, vendors: 20, categories: 12, users: 2000, reviews: 8000 });
    } else if (raw === '--medium') {
      Object.assign(opts, { products: 50000, orders: 100000, items: 400000, vendors: 100, categories: 30, users: 20000, reviews: 100000 });
    } else if (raw === '--drop') {
      opts.drop = true;
    } else {
      const m = /^--([a-zA-Z0-9_-]+)=(.*)$/.exec(raw);
      if (!m) {
        throw new Error('Unknown argument: ' + raw);
      }
      const key = m[1];
      const valStr = m[2];
      if (!ALLOWED_NUMERIC_KEYS.has(key)) {
        throw new Error('Unknown argument: ' + raw);
      }
      if (!/^-?\d+$/.test(valStr)) {
        throw new Error('Value for --' + key + ' must be an integer, got: ' + valStr);
      }
      const val = parseInt(valStr, 10);
      if (!Number.isSafeInteger(val)) {
        throw new Error('Value for --' + key + ' must be an integer, got: ' + valStr);
      }
      if (key === 'seed') {
        if (val < 0) {
          throw new Error('Value for --seed must be a non-negative integer, got: ' + valStr);
        }
      } else {
        if (val <= 0) {
          throw new Error('Value for --' + key + ' must be a positive integer');
        }
      }
      opts[key] = val;
    }
  }
  return opts;
}

const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

async function main() {
  const opts = parseArgs(process.argv);
  const rng = mulberry32(opts.seed);
  const randInt = (n) => Math.floor(rng() * n);

  console.log(`[seedBench] uri=${benchUri()} seed=${opts.seed}`);
  console.log(`[seedBench] scale:`, opts);
  await connectBench();
  const db = mongoose.connection.db;

  if (opts.drop) {
    console.log('[seedBench] dropping existing bench collections...');
    for (const c of ['users', 'vendors', 'categories', 'products', 'orders', 'order_items', 'reviews']) {
      await db.collection(c).drop().catch(() => {});
    }
  }

  const t0 = Date.now();

  // ── categories ────────────────────────────────────────────────
  const categories = [];
  for (let i = 0; i < opts.categories; i++) {
    categories.push({
      _id: new mongoose.Types.ObjectId(),
      name: i === 0 ? 'Rare Collectibles' : `Category ${i}`,
      is_rare: i === 0,
      created_at: new Date()
    });
  }
  await Category.insertMany(categories, { ordered: false });
  // category weights: rare 0.5%, common(#1) 40%, rest split evenly
  const catWeights = new Array(opts.categories).fill(0).map((_, i) => {
    if (i === 0) return 0.005;
    if (i === 1) return 0.40;
    return categories.length > 2 ? 0.595 / (opts.categories - 2) : 0.595;
  });
  let s = catWeights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < catWeights.length; i++) catWeights[i] /= s;
  const catCum = cum(catWeights);
  console.log(`[seedBench] categories: ${categories.length} (rare=${categories[0]._id}, common=${categories[1]._id})`);

  // ── vendors (skewed sizes) ────────────────────────────────────
  const vendors = [];
  const vendorWeights = [];
  for (let i = 0; i < opts.vendors; i++) {
    vendors.push({ _id: new mongoose.Types.ObjectId(), name: `Vendor ${i}`, rating: 3 + rng() * 2, created_at: new Date() });
    vendorWeights.push(1 / (i + 1));
  }
  await Vendor.insertMany(vendors, { ordered: false });
  const vendorCum = cum(normalize(vendorWeights));
  console.log(`[seedBench] vendors: ${vendors.length} (Zipf-skewed)`);

  // ── users ─────────────────────────────────────────────────────
  const users = new Array(opts.users);
  for (let i = 0; i < opts.users; i++) {
    users[i] = { _id: new mongoose.Types.ObjectId(), name: `User ${i}`, email: `user${i}@bench.local`, created_at: new Date() };
  }
  await insertBatched(User, users, opts.batch);
  const userIds = users.map((u) => u._id);
  console.log(`[seedBench] users: ${users.length}`);

  // ── products ──────────────────────────────────────────────────
  const productIds = new Array(opts.products);
  const productVendor = new Array(opts.products);
  const productCategory = new Array(opts.products);
  const productPrice = new Array(opts.products);
  // Rich, demo-like names so live search terms ("laptop", "earbuds", …) can
  // actually match rows in the bench DB — plain "Product 12" names would make
  // every spliced search term filter to zero rows. Demo-ish names are not
  // needed elsewhere: the fixed specs join on _id keys only.
  const NAME_POOL = [
    'AeroBlade Gaming Laptop Pro', 'SonicPulse Wireless Earbuds', 'Chronos Smartwatch Titanium',
    'NovaMech Mechanical Keyboard', 'QuantumPixel 4K Monitor', 'HyperCool Liquid Cooler',
    'StealthPad Drawing Tablet', 'OmniCam 4K Action Camera', 'Leather Field Jacket',
    'Fleece Hoodie Organic', 'Merino Wool Blazer', 'Technical Cargo Joggers',
    'Bamboo V-Neck Tee', 'Selvedge Denim Jeans', 'Carbon Runner Sneakers', 'Hiking Boots'
  ];
  let pBatch = [];
  for (let i = 0; i < opts.products; i++) {
    const id = new mongoose.Types.ObjectId();
    const price = 100 + randInt(99900);
    // Uniform rating in [1.0, 5.0] so minRating filter selectivity varies.
    const rating = Math.round((1 + rng() * 4) * 10) / 10;
    productIds[i] = id;
    productVendor[i] = vendors[pick(vendorCum, rng())]._id;
    productCategory[i] = categories[pick(catCum, rng())]._id;
    productPrice[i] = price;
    pBatch.push({
      _id: id,
      name: `${NAME_POOL[i % NAME_POOL.length]} ${i}`,
      vendor_id: productVendor[i],
      category_id: productCategory[i],
      price,
      stock: randInt(500),
      rating,
      isFeatured: rng() < 0.05,
      created_at: new Date()
    });
    if (pBatch.length >= opts.batch) { await Product.insertMany(pBatch, { ordered: false }); pBatch = []; }
  }
  if (pBatch.length) await Product.insertMany(pBatch, { ordered: false });
  console.log(`[seedBench] products: ${opts.products} (hot set = first ${hotCount(opts.products)}, searchable names)`);

  // ── orders + order_items ──────────────────────────────────────
  const now = Date.now();
  const YEAR = 365 * 24 * 3600 * 1000;
  const avgItems = Math.max(1, opts.items / opts.orders);
  const hot = hotCount(opts.products);
  let oBatch = [];
  let iBatch = [];
  let totalItems = 0;
  for (let o = 0; o < opts.orders; o++) {
    const orderId = new mongoose.Types.ObjectId();
    const createdAt = new Date(now - Math.floor(rng() * YEAR));
    const nItems = Math.max(1, Math.round(avgItems + (rng() * 2 - 1) * avgItems * 0.6));
    let total = 0;
    for (let k = 0; k < nItems; k++) {
      // hot products get 30% of the picks
      const pi = rng() < 0.3 ? randInt(hot) : randInt(opts.products);
      const qty = 1 + randInt(5);
      const price = productPrice[pi];
      const line = price * qty;
      total += line;
      totalItems++;
      iBatch.push({
        _id: new mongoose.Types.ObjectId(),
        order_id: orderId,
        product_id: productIds[pi],
        vendor_id: productVendor[pi],
        quantity: qty, price, line_total: line,
        created_at: createdAt
      });
    }
    oBatch.push({
      _id: orderId,
      user_id: userIds[randInt(opts.users)],
      status: STATUSES[randInt(STATUSES.length)],
      total_amount: total,
      created_at: createdAt
    });
    if (oBatch.length >= Math.max(1, Math.floor(opts.batch / Math.max(1, avgItems)))) {
      await Order.insertMany(oBatch, { ordered: false });
      await OrderItem.insertMany(iBatch, { ordered: false });
      oBatch = []; iBatch = [];
      if ((o + 1) % 100000 === 0) console.log(`[seedBench] orders ${o + 1}/${opts.orders} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }
  if (oBatch.length) await Order.insertMany(oBatch, { ordered: false });
  if (iBatch.length) await OrderItem.insertMany(iBatch, { ordered: false });
  console.log(`[seedBench] orders: ${opts.orders}, order_items: ${totalItems}`);

  // ── reviews ───────────────────────────────────────────────────
  let rBatch = [];
  for (let i = 0; i < opts.reviews; i++) {
    const pi = randInt(opts.products);
    rBatch.push({
      _id: new mongoose.Types.ObjectId(),
      user_id: userIds[randInt(opts.users)],
      product_id: productIds[pi],
      vendor_id: productVendor[pi],
      rating: 1 + randInt(5),
      created_at: new Date(now - Math.floor(rng() * YEAR))
    });
    if (rBatch.length >= opts.batch) { await Review.insertMany(rBatch, { ordered: false }); rBatch = []; }
  }
  if (rBatch.length) await Review.insertMany(rBatch, { ordered: false });
  console.log(`[seedBench] reviews: ${opts.reviews}`);

  // ── indexes on every join key ─────────────────────────────────
  console.log('[seedBench] creating indexes on join keys...');
  await Promise.all([
    Product.collection.createIndex({ vendor_id: 1 }),
    Product.collection.createIndex({ category_id: 1 }),
    Order.collection.createIndex({ user_id: 1 }),
    Order.collection.createIndex({ created_at: 1 }),
    OrderItem.collection.createIndex({ order_id: 1 }),
    OrderItem.collection.createIndex({ product_id: 1 }),
    OrderItem.collection.createIndex({ vendor_id: 1 }),
    OrderItem.collection.createIndex({ created_at: 1 }),
    Review.collection.createIndex({ product_id: 1 }),
    Review.collection.createIndex({ user_id: 1 }),
    Review.collection.createIndex({ vendor_id: 1 }),
    User.collection.createIndex({ email: 1 })
  ]);

  const counts = {
    users: await User.estimatedDocumentCount(),
    vendors: await Vendor.estimatedDocumentCount(),
    categories: await Category.estimatedDocumentCount(),
    products: await Product.estimatedDocumentCount(),
    orders: await Order.estimatedDocumentCount(),
    order_items: await OrderItem.estimatedDocumentCount(),
    reviews: await Review.estimatedDocumentCount()
  };
  console.log('[seedBench] done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  console.table(counts);
  await disconnectBench();
}

// ── helpers ───────────────────────────────────────────────────────
function hotCount(products) { return Math.max(5, Math.floor(products * 0.001)); }
function normalize(w) { const s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); }
function cum(w) { const c = new Array(w.length); let a = 0; for (let i = 0; i < w.length; i++) { a += w[i]; c[i] = a; } return c; }
function pick(cumArr, r) { let lo = 0, hi = cumArr.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cumArr[m] < r) lo = m + 1; else hi = m; } return lo; }

async function insertBatched(Model, docs, batch) {
  for (let i = 0; i < docs.length; i += batch) {
    await Model.insertMany(docs.slice(i, i + batch), { ordered: false });
  }
}

if (require.main === module) {
  main().catch((err) => { console.error('[seedBench] FAILED:', err); process.exit(1); });
}

module.exports = { parseArgs, ALLOWED_NUMERIC_KEYS, NUMERIC_KEYS, main };
