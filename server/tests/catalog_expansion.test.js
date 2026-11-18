'use strict';
/**
 * Test Suite: Catalog Expansion (data/catalogExpansion.js + scripts/seedCatalogExpansion.js)
 *
 *  1. Generator is deterministic and yields 60 unique products per category.
 *  2. Generated names never collide with the curated 300-product base catalog.
 *  3. Prices, discounts and stock are valid for the Product schema.
 *  4. Every photo comes from a base product of the same category, and model-specific
 *     photos match (e.g. a "Chef's Knife" shows a knife).
 *  5. Seeder inserts once, is idempotent on re-run, and --remove deletes only expansion rows.
 *  6. CLI argument validation.
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Product = require('../models/Product');
const Category = require('../models/Category');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const base = require('../data/products300.json');
const { buildExpansion } = require('../data/catalogExpansion');
const { seedCatalogExpansion, parseArgs } = require('../scripts/seedCatalogExpansion');

const CATEGORIES = [...new Set(base.map((p) => p.categoryName))];

test('Catalog expansion generator', async (t) => {
  const rows = buildExpansion(base, { perCategory: 60 });

  await t.test('1. Deterministic, 60 unique products per category', () => {
    assert.deepStrictEqual(buildExpansion(base, { perCategory: 60 }), rows, 'same output every run');
    assert.strictEqual(rows.length, 60 * CATEGORIES.length);
    assert.strictEqual(new Set(rows.map((r) => r.name)).size, rows.length, 'names are unique');
    for (const c of CATEGORIES) {
      assert.strictEqual(rows.filter((r) => r.categoryName === c).length, 60, c);
    }
  });

  await t.test('2. No collisions with base catalog names', () => {
    const baseNames = new Set(base.map((p) => p.name.toLowerCase()));
    for (const r of rows) assert.ok(!baseNames.has(r.name.toLowerCase()), r.name);
  });

  await t.test('3. Valid prices, discounts and stock', () => {
    for (const r of rows) {
      assert.ok(Number.isInteger(r.price) && r.price > 0, `${r.name} price`);
      assert.ok(r.discountPrice === 0 || (r.discountPrice > 0 && r.discountPrice < r.price), `${r.name} discount`);
      assert.ok(Number.isInteger(r.stock) && r.stock >= 0, `${r.name} stock`);
      assert.ok(r.description.length > 20, `${r.name} description`);
      assert.strictEqual(r.rating, 0, 'no fake ratings');
    }
  });

  await t.test('4. Photos come from same-category base products and match model', () => {
    const photosByCategory = new Map();
    for (const p of base) {
      if (!photosByCategory.has(p.categoryName)) photosByCategory.set(p.categoryName, new Set());
      photosByCategory.get(p.categoryName).add(JSON.stringify(p.images));
    }
    for (const r of rows) {
      assert.ok(r.images.length > 0, `${r.name} has images`);
      assert.ok(photosByCategory.get(r.categoryName).has(JSON.stringify(r.images)), `${r.name} photo from its category`);
    }
    const knifePhotos = new Set(base.filter((p) => /knife/i.test(p.name)).map((p) => JSON.stringify(p.images)));
    const knives = rows.filter((r) => /Chef's Knife/.test(r.name));
    assert.ok(knives.length > 0);
    for (const k of knives) assert.ok(knifePhotos.has(JSON.stringify(k.images)), `${k.name} shows a knife`);
  });
});

test('Catalog expansion seeder', async (t) => {
  let server;

  t.before(async () => {
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri());
    const owner = await User.create({ name: 'V', email: 'v@test.com', password: 'secret12', role: 'vendor' });
    await Vendor.create({ user: owner._id, storeName: 'Nexus Tech Lab', storeSlug: 'nexus', description: 'd', status: 'approved' });
    await Category.insertMany(CATEGORIES.map((name, i) => ({ name, slug: `c${i}`, description: 'd', image: 'i.jpg' })));
    await Product.create({ ...base[0], category: (await Category.findOne({ name: base[0].categoryName }))._id, vendor: (await Vendor.findOne())._id });
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (server) await server.stop();
  });

  await t.test('5a. Inserts the expansion once', async () => {
    const r = await seedCatalogExpansion({ perCategory: 10 });
    assert.strictEqual(r.inserted, 10 * CATEGORIES.length);
    assert.strictEqual(r.total, 1 + 10 * CATEGORIES.length);
  });

  await t.test('5b. Re-running is idempotent; a bigger run only adds the difference', async () => {
    const again = await seedCatalogExpansion({ perCategory: 10 });
    assert.strictEqual(again.inserted, 0);
    const bigger = await seedCatalogExpansion({ perCategory: 15 });
    assert.strictEqual(bigger.inserted, 5 * CATEGORIES.length);
    assert.strictEqual(await Product.countDocuments(), 1 + 15 * CATEGORIES.length);
  });

  await t.test('5c. --remove deletes only expansion products', async () => {
    const r = await seedCatalogExpansion({ remove: true });
    assert.strictEqual(r.removed, 15 * CATEGORIES.length);
    assert.strictEqual(await Product.countDocuments(), 1, 'base product kept');
  });

  await t.test('6. Argument validation', () => {
    assert.deepStrictEqual(parseArgs([]), { perCategory: 60, remove: false });
    assert.strictEqual(parseArgs(['--per-cat=25']).perCategory, 25);
    assert.strictEqual(parseArgs(['--remove']).remove, true);
    assert.throws(() => parseArgs(['--per-cat=0']), /integer/);
    assert.throws(() => parseArgs(['--per-cat=abc']), /integer/);
    assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);
  });
});
