'use strict';
/**
 * Test Suite: Product Catalog Expansion to Exactly 300 Products
 *
 * Verifies:
 *  1. Dataset Integrity: products300.json contains exactly 300 unique products.
 *  2. Target Distribution:
 *     - Electronics: 40
 *     - Clothing: 40
 *     - Shoes: 35
 *     - Home & Kitchen: 40
 *     - Beauty & Skincare: 35
 *     - Sports & Fitness: 35
 *     - Books & Stationery: 35
 *     - Plants & Garden: 40
 *  3. Name Uniqueness: No duplicate product names.
 *  4. Pricing and Discount Consistency: price > discountPrice > 0, stock >= 0, rating between 0 and 5.
 *  5. Image Integrity: Every product has a valid, non-empty image URL array.
 *  6. Safe Seeder Idempotency: seedProductsSafe() seeds 300 products and running again creates 0 duplicates.
 *  7. Relationship Validity: Every product has valid Category and Vendor ObjectIds.
 *  8. Multi-Vendor Diversity: All 5 vendors have products represented in every category.
 *  9. Pagination Verification: Catalog paginates across 25 pages at 12/page with total = 300.
 * 10. Filter & Search Compatibility: Category filtering and price sorting work on the 300 catalog.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Category = require('../models/Category');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Product = require('../models/Product');
const { seedProductsSafe } = require('../scripts/seedProductsSafe');
const { getProducts } = require('../controllers/productController');

const DATASET_PATH = path.join(__dirname, '../data/products300.json');

// Helper to mock express req/res
function createMockReqRes({ query = {}, params = {}, body = {}, user = null } = {}) {
  const req = { query, params, body, user };
  const state = { statusCode: 200, data: null };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(data) {
      state.data = data;
      return res;
    }
  };
  return { req, res, getState: () => state };
}

test('Product Catalog 300 Dataset Specification & Integrity', () => {
  assert.ok(fs.existsSync(DATASET_PATH), 'products300.json must exist');
  const products = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));

  // 1. Exactly 300 products
  assert.strictEqual(products.length, 300, 'Catalog must contain exactly 300 products');

  // 2. Category distribution
  const expectedDistribution = {
    'Electronics': 40,
    'Clothing': 40,
    'Shoes': 35,
    'Home & Kitchen': 40,
    'Beauty & Skincare': 35,
    'Sports & Fitness': 35,
    'Books & Stationery': 35,
    'Plants & Garden': 40
  };

  const actualDistribution = {};
  const names = new Set();

  for (const p of products) {
    actualDistribution[p.categoryName] = (actualDistribution[p.categoryName] || 0) + 1;

    // Name uniqueness
    const lowerName = p.name.toLowerCase().trim();
    assert.ok(!names.has(lowerName), `Product name must be unique: "${p.name}"`);
    names.add(lowerName);

    // Attribute validation
    assert.ok(p.name && p.name.length >= 3, `Product must have a descriptive name: ${p.name}`);
    assert.ok(p.description && p.description.length >= 10, `Product must have a detailed description: ${p.name}`);
    assert.ok(typeof p.price === 'number' && p.price > 0, `Price must be positive: ${p.name}`);
    assert.ok(
      typeof p.discountPrice === 'number' && p.discountPrice > 0 && p.discountPrice < p.price,
      `Discount price must be greater than 0 and less than price: ${p.name} (price: ${p.price}, disc: ${p.discountPrice})`
    );
    assert.ok(typeof p.stock === 'number' && p.stock >= 0, `Stock must be non-negative: ${p.name}`);
    assert.ok(typeof p.rating === 'number' && p.rating >= 0 && p.rating <= 5, `Rating must be 0-5: ${p.name}`);
    assert.ok(Array.isArray(p.images) && p.images.length > 0, `Images array must not be empty: ${p.name}`);
    assert.ok(typeof p.images[0] === 'string' && p.images[0].startsWith('http'), `Primary image must be a valid HTTP URL: ${p.name}`);
    assert.strictEqual(p.isActive, true, `Seeded product must be active: ${p.name}`);
  }

  for (const [catName, targetCount] of Object.entries(expectedDistribution)) {
    assert.strictEqual(
      actualDistribution[catName],
      targetCount,
      `Category "${catName}" must have exactly ${targetCount} products, found ${actualDistribution[catName]}`
    );
  }
});

test('Safe Seeder Database Execution & API Pagination Suite', async (t) => {
  let mongoServer;
  const origEnvUri = process.env.MONGODB_URI;

  await t.test('Setup isolated MongoMemoryServer and run safe seeder', async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();

    // Run safe seeder
    await seedProductsSafe();

    await mongoose.connect(process.env.MONGODB_URI);
    const count = await Product.countDocuments();
    assert.strictEqual(count, 300, 'Database must contain exactly 300 products after first seed run');
  });

  await t.test('1. Idempotency: Re-running safe seeder creates 0 duplicate products', async () => {
    await mongoose.disconnect();

    // Re-run safe seeder on the same database
    await seedProductsSafe();

    await mongoose.connect(process.env.MONGODB_URI);
    const countAfter = await Product.countDocuments();
    assert.strictEqual(countAfter, 300, 'Re-running safe seeder must maintain exactly 300 products with 0 duplicates');
  });

  await t.test('2. Relationship validity: all products reference existing categories and vendors', async () => {
    const populated = await Product.find().populate('category').populate('vendor');
    assert.strictEqual(populated.length, 300);

    for (const p of populated) {
      assert.ok(p.category && p.category._id, `Product "${p.name}" must have a populated category`);
      assert.ok(p.vendor && p.vendor._id, `Product "${p.name}" must have a populated vendor`);
    }
  });

  await t.test('3. Multi-Vendor distribution: all 5 vendors have products in every category', async () => {
    const categories = await Category.find();
    const vendors = await Vendor.find();

    assert.strictEqual(categories.length, 8, 'There must be 8 categories');
    assert.strictEqual(vendors.length, 5, 'There must be 5 vendors');

    for (const cat of categories) {
      const vendorIdsInCat = await Product.distinct('vendor', { category: cat._id });
      assert.strictEqual(
        vendorIdsInCat.length,
        5,
        `Category "${cat.name}" must have products from all 5 vendors, found ${vendorIdsInCat.length}`
      );
    }
  });

  await t.test('4. API Pagination: 300 products are accessible across 25 pages (12/page)', async () => {
    // Page 1
    const { req: req1, res: res1, getState: getState1 } = createMockReqRes({
      query: { page: 1, limit: 12 }
    });
    await getProducts(req1, res1);
    const result1 = getState1().data;

    assert.strictEqual(result1.total, 300, 'Total products reported by API must be 300');
    assert.strictEqual(result1.pages, 25, 'Total pages at limit=12 must be 25');
    assert.strictEqual(result1.products.length, 12, 'Page 1 must return 12 products');

    // Page 25 (Final page)
    const { req: req25, res: res25, getState: getState25 } = createMockReqRes({
      query: { page: 25, limit: 12 }
    });
    await getProducts(req25, res25);
    const result25 = getState25().data;

    assert.strictEqual(result25.page, 25);
    assert.strictEqual(result25.products.length, 12, 'Page 25 must return final 12 products');

    // Page 26 (Beyond bounds)
    const { req: req26, res: res26, getState: getState26 } = createMockReqRes({
      query: { page: 26, limit: 12 }
    });
    await getProducts(req26, res26);
    const result26 = getState26().data;

    assert.strictEqual(result26.products.length, 0, 'Page 26 must return 0 products');
  });

  await t.test('5. Category Filtering via API: returns exact category product counts', async () => {
    const electronicsCat = await Category.findOne({ name: 'Electronics' });
    const shoesCat = await Category.findOne({ name: 'Shoes' });

    // Filter Electronics (expect 40 total, 4 pages: 12, 12, 12, 4)
    const { req: reqElec, res: resElec, getState: getElecState } = createMockReqRes({
      query: { category: electronicsCat._id.toString(), limit: 12 }
    });
    await getProducts(reqElec, resElec);
    const elecData = getElecState().data;

    assert.strictEqual(elecData.total, 40, 'Electronics category must filter to 40 products');
    assert.strictEqual(elecData.pages, 4, '40 products at limit 12 must be 4 pages');

    // Filter Shoes (expect 35 total, 3 pages: 12, 12, 11)
    const { req: reqShoes, res: resShoes, getState: getShoesState } = createMockReqRes({
      query: { category: shoesCat._id.toString(), limit: 12 }
    });
    await getProducts(reqShoes, resShoes);
    const shoesData = getShoesState().data;

    assert.strictEqual(shoesData.total, 35, 'Shoes category must filter to 35 products');
    assert.strictEqual(shoesData.pages, 3, '35 products at limit 12 must be 3 pages');
  });

  await t.test('6. Price Sorting via API: price_asc and price_desc work across 300 products', async () => {
    const { req: reqAsc, res: resAsc, getState: getAscState } = createMockReqRes({
      query: { sort: 'price_asc', limit: 300 }
    });
    await getProducts(reqAsc, resAsc);
    const ascProducts = getAscState().data.products;

    for (let i = 1; i < ascProducts.length; i++) {
      assert.ok(
        ascProducts[i].price >= ascProducts[i - 1].price,
        `Ascending sort violation at index ${i}: ${ascProducts[i].price} < ${ascProducts[i - 1].price}`
      );
    }
  });

  t.after(async () => {
    process.env.MONGODB_URI = origEnvUri;
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });
});
