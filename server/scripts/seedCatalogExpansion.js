'use strict';
/**
 * Catalog Expansion Seeder
 *
 * Adds the generated expansion products (data/catalogExpansion.js) to the main
 * ShopSphere database on top of the curated 300-product base catalog.
 *
 *   node scripts/seedCatalogExpansion.js               # add 60 per category (+480)
 *   node scripts/seedCatalogExpansion.js --per-cat=30  # a smaller expansion
 *   node scripts/seedCatalogExpansion.js --remove      # remove all expansion products
 *
 * Idempotent: products are matched by name, so re-running inserts only what is
 * missing and never duplicates. Categories and vendors must already exist
 * (start the server once, or run `npm run seed`). Run from the server folder.
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Product = require('../models/Product');
const Category = require('../models/Category');
const Vendor = require('../models/Vendor');
const { buildExpansion } = require('../data/catalogExpansion');
const baseProducts = require('../data/products300.json');

// Prefer the demo store that specialises in each category.
const PREFERRED_STORE = {
  Electronics: /nexus/i,
  Clothing: /urban/i,
  Shoes: /urban/i,
  'Home & Kitchen': /aura/i,
  'Beauty & Skincare': /glow/i,
  'Sports & Fitness': /nexus/i,
  'Books & Stationery': /aura/i,
  'Plants & Garden': /botanica/i
};

function parseArgs(argv) {
  const opts = { perCategory: 60, remove: false };
  for (const a of argv) {
    if (a === '--remove') opts.remove = true;
    else if (a.startsWith('--per-cat=')) {
      const n = Number(a.slice('--per-cat='.length));
      if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error('--per-cat must be an integer from 1 to 200');
      opts.perCategory = n;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

async function seedCatalogExpansion({ perCategory = 60, remove = false } = {}) {
  // Enumerate every possible generated name so --remove also clears larger or
  // differently ordered earlier runs.
  const allGenerated = buildExpansion(baseProducts, { perCategory: Infinity });

  if (remove) {
    const { deletedCount } = await Product.deleteMany({ name: { $in: allGenerated.map((p) => p.name) } });
    return { inserted: 0, removed: deletedCount, total: await Product.countDocuments() };
  }

  const rows = buildExpansion(baseProducts, { perCategory });
  const categories = await Category.find().lean();
  const vendors = await Vendor.find({ status: 'approved' }).sort({ createdAt: 1 }).lean();
  if (!categories.length || !vendors.length) {
    throw new Error('Categories and approved vendors must exist first (start the server once, or run `npm run seed`).');
  }
  const categoryId = new Map(categories.map((c) => [c.name, c._id]));

  const existing = new Set(
    (await Product.find({ name: { $in: rows.map((r) => r.name) } }).select('name').lean()).map((p) => p.name)
  );

  const docs = [];
  let skippedCategory = 0;
  rows.forEach((r, i) => {
    if (existing.has(r.name)) return;
    const category = categoryId.get(r.categoryName);
    if (!category) { skippedCategory++; return; }
    const preferred = vendors.find((v) => PREFERRED_STORE[r.categoryName]?.test(v.storeName));
    const vendor = preferred || vendors[i % vendors.length];
    const { categoryName, ...fields } = r;
    docs.push({ ...fields, category, vendor: vendor._id });
  });

  if (docs.length) await Product.insertMany(docs, { ordered: false });
  return {
    inserted: docs.length,
    alreadyPresent: existing.size,
    skippedCategory,
    total: await Product.countDocuments()
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shopsphere';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    const r = await seedCatalogExpansion(opts);
    if (opts.remove) {
      console.log(`[Catalog Expansion] Removed ${r.removed} expansion products. Catalog now has ${r.total} products.`);
    } else {
      console.log(`[Catalog Expansion] Inserted ${r.inserted} new products (${r.alreadyPresent} already present). Catalog now has ${r.total} products.`);
      if (r.skippedCategory) console.warn(`[Catalog Expansion] Skipped ${r.skippedCategory} rows whose category does not exist.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[Catalog Expansion] FAILED:', e.message);
    process.exit(1);
  });
}

module.exports = { seedCatalogExpansion, parseArgs };
