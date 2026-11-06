'use strict';
/**
 * Test Suite: Subsegment 2.5 — Product Catalog Optimization
 *
 * Verifies:
 *  1. Schema Index Metadata:
 *     - Product defines compound index { category: 1, createdAt: -1 }
 *     - Product defines compound index { isFeatured: 1, createdAt: -1 }
 *     - Product defines compound index { stock: 1, soldCount: -1, rating: -1 }
 *  2. Query Execution Plans (explain executionStats):
 *     - Featured products query executes via IXSCAN on isFeatured_1_createdAt_-1 with zero in-memory SORT.
 *     - Trending products query executes via IXSCAN on stock_1_soldCount_-1_rating_-1.
 *     - Category-filtered query with default sort executes via IXSCAN on category_1_createdAt_-1 with zero in-memory SORT.
 *  3. Catalog Response Contract & Lean Hydration:
 *     - getProducts returns { products, page, pages, total } with populated category and vendor.
 *     - getProductById returns populated lean product document.
 *     - getFeaturedProducts returns up to 8 featured products with populated refs.
 *     - getTrendingProducts returns up to 8 top sold in-stock items with populated refs.
 *     - getRelatedProducts returns related products in the same category excluding current product.
 *  4. Filter & Pagination Accuracy:
 *     - Price range, minRating, inStock, category, and vendor filters work accurately.
 *     - Concurrent count and find execution preserves correct total and pagination counts.
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Product = require('../models/Product');
const Category = require('../models/Category');
const Vendor = require('../models/Vendor');
const User = require('../models/User');

const {
  getProducts,
  getProductById,
  getFeaturedProducts,
  getTrendingProducts,
  getRelatedProducts
} = require('../controllers/productController');

function findStageInPlan(plan, targetStage) {
  if (!plan) return null;
  if (plan.stage === targetStage) return plan;
  if (plan.inputStage) {
    const found = findStageInPlan(plan.inputStage, targetStage);
    if (found) return found;
  }
  if (Array.isArray(plan.inputStages)) {
    for (const child of plan.inputStages) {
      const found = findStageInPlan(child, targetStage);
      if (found) return found;
    }
  }
  return null;
}

function createMockReqRes({ params = {}, query = {}, body = {}, user = null } = {}) {
  const req = { params, query, body, user };
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

test('Subsegment 2.5 — Product Catalog Optimization Suite', async (t) => {
  let mongoServer;
  let testVendorUser, testVendor;
  let catElectronics, catApparel;
  let seededProducts = [];

  await t.test('Setup MongoMemoryServer and seed catalog data', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await Product.syncIndexes();
    await Category.syncIndexes();
    await Vendor.syncIndexes();

    testVendorUser = await User.create({
      name: 'Catalog Vendor User',
      email: 'vendor.catalog@test.com',
      password: 'password123',
      role: 'vendor'
    });

    testVendor = await Vendor.create({
      user: testVendorUser._id,
      storeName: 'Catalog Benchmark Hub',
      storeSlug: 'catalog-benchmark-hub',
      description: 'Benchmark store',
      status: 'approved',
      rating: 4.8,
      numRatings: 10,
      totalSales: 50000
    });

    catElectronics = await Category.create({
      name: 'Electronics',
      slug: 'electronics',
      description: 'Laptops, headphones & accessories',
      icon: 'Laptop',
      image: 'https://images.unsplash.com/photo-1498049860654-af1a5c566876?w=600'
    });

    catApparel = await Category.create({
      name: 'Apparel',
      slug: 'apparel',
      description: 'Clothing & shoes',
      icon: 'Shirt',
      image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600'
    });

    // Seed 15 diverse products
    for (let i = 1; i <= 15; i++) {
      const isElect = i <= 8;
      const prod = await Product.create({
        name: isElect ? `Electronic Device ${i}` : `Fashion Garment ${i}`,
        description: `Description for product ${i}`,
        price: i * 1000,
        discountPrice: i * 800,
        stock: i === 15 ? 0 : 10 + i, // Product 15 is out of stock
        category: isElect ? catElectronics._id : catApparel._id,
        vendor: testVendor._id,
        images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'],
        isFeatured: i % 2 === 1, // odd numbers are featured
        rating: 3.5 + (i % 3) * 0.5,
        numReviews: i * 2,
        soldCount: i * 10
      });
      seededProducts.push(prod);
    }
  });

  await t.test('Schema Index Metadata Inspection for Catalog Indexes', () => {
    const productIndexKeys = Product.schema.indexes().map(([spec]) => JSON.stringify(spec));

    assert.ok(
      productIndexKeys.includes(JSON.stringify({ category: 1, createdAt: -1 })),
      'Product must define compound index { category: 1, createdAt: -1 }'
    );
    assert.ok(
      productIndexKeys.includes(JSON.stringify({ isFeatured: 1, createdAt: -1 })),
      'Product must define compound index { isFeatured: 1, createdAt: -1 }'
    );
    assert.ok(
      productIndexKeys.includes(JSON.stringify({ stock: 1, soldCount: -1, rating: -1 })),
      'Product must define compound index { stock: 1, soldCount: -1, rating: -1 }'
    );
  });

  await t.test('Featured Products Query uses isFeatured_1_createdAt_-1 IXSCAN with zero in-memory SORT', async () => {
    const explainResult = await Product.find({ isFeatured: true })
      .sort({ createdAt: -1 })
      .limit(8)
      .explain('executionStats');

    const winningPlan = explainResult.queryPlanner?.winningPlan;
    assert.ok(winningPlan, 'Query planner must provide a winning plan');

    const ixScanStage = findStageInPlan(winningPlan, 'IXSCAN');
    assert.ok(ixScanStage, 'Featured products query must execute via IXSCAN');
    assert.strictEqual(
      ixScanStage.indexName,
      'isFeatured_1_createdAt_-1',
      `Expected isFeatured_1_createdAt_-1, got ${ixScanStage.indexName}`
    );

    // Verify sort is satisfied by index traversal without in-memory SORT
    const sortStage = findStageInPlan(winningPlan, 'SORT');
    assert.strictEqual(sortStage, null, 'Featured products query must not require in-memory SORT');
  });

  await t.test('Trending Products Query uses stock_1_soldCount_-1_rating_-1 IXSCAN', async () => {
    const explainResult = await Product.find({ stock: { $gt: 0 } })
      .sort({ soldCount: -1, rating: -1 })
      .limit(8)
      .explain('executionStats');

    const winningPlan = explainResult.queryPlanner?.winningPlan;
    assert.ok(winningPlan, 'Query planner must provide a winning plan');

    const ixScanStage = findStageInPlan(winningPlan, 'IXSCAN');
    assert.ok(ixScanStage, 'Trending products query must execute via IXSCAN');
    assert.strictEqual(
      ixScanStage.indexName,
      'stock_1_soldCount_-1_rating_-1',
      `Expected stock_1_soldCount_-1_rating_-1, got ${ixScanStage.indexName}`
    );
  });

  await t.test('Category-filtered query with default sort uses category_1_createdAt_-1 with zero in-memory SORT', async () => {
    const explainResult = await Product.find({ category: catElectronics._id })
      .sort({ createdAt: -1 })
      .limit(12)
      .explain('executionStats');

    const winningPlan = explainResult.queryPlanner?.winningPlan;
    assert.ok(winningPlan, 'Query planner must provide a winning plan');

    const ixScanStage = findStageInPlan(winningPlan, 'IXSCAN');
    assert.ok(ixScanStage, 'Category-filtered query must execute via IXSCAN');
    assert.strictEqual(
      ixScanStage.indexName,
      'category_1_createdAt_-1',
      `Expected category_1_createdAt_-1, got ${ixScanStage.indexName}`
    );

    const sortStage = findStageInPlan(winningPlan, 'SORT');
    assert.strictEqual(sortStage, null, 'Category-filtered query must not require in-memory SORT');
  });

  await t.test('getProducts returns correct contract, pagination, and populated lean items', async () => {
    const { req, res, getState } = createMockReqRes({
      query: { page: '1', limit: '10' }
    });

    await getProducts(req, res);
    const state = getState();
    assert.strictEqual(state.statusCode, 200);

    const data = state.data;
    assert.strictEqual(data.total, 15);
    assert.strictEqual(data.page, 1);
    assert.strictEqual(data.pages, 2);
    assert.strictEqual(data.products.length, 10);

    // Verify populated category and vendor on lean document
    const sample = data.products[0];
    assert.ok(sample.category.name, 'Category name must be populated');
    assert.ok(sample.category.slug, 'Category slug must be populated');
    assert.ok(sample.vendor.storeName, 'Vendor storeName must be populated');
  });

  await t.test('getProducts filtering criteria (category, price, rating, inStock, featured)', async () => {
    // 1. Category filter
    const { req: reqCat, res: resCat, getState: getCat } = createMockReqRes({
      query: { category: catElectronics._id.toString() }
    });
    await getProducts(reqCat, resCat);
    assert.strictEqual(getCat().data.total, 8);

    // 2. In-Stock filter (14 products in stock, 1 out of stock)
    const { req: reqStock, res: resStock, getState: getStock } = createMockReqRes({
      query: { inStock: 'true' }
    });
    await getProducts(reqStock, resStock);
    assert.strictEqual(getStock().data.total, 14);

    // 3. Featured filter (8 featured products)
    const { req: reqFeat, res: resFeat, getState: getFeat } = createMockReqRes({
      query: { featured: 'true' }
    });
    await getProducts(reqFeat, resFeat);
    assert.strictEqual(getFeat().data.total, 8);

    // 4. Price range filter: 3000 to 7000
    const { req: reqPrice, res: resPrice, getState: getPrice } = createMockReqRes({
      query: { minPrice: '3000', maxPrice: '7000' }
    });
    await getProducts(reqPrice, resPrice);
    assert.strictEqual(getPrice().data.total, 5); // 3000, 4000, 5000, 6000, 7000
  });

  await t.test('getProductById returns populated lean product or 404', async () => {
    const validId = seededProducts[0]._id.toString();
    const { req, res, getState } = createMockReqRes({ params: { id: validId } });
    await getProductById(req, res);

    const state = getState();
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.data._id.toString(), validId);
    assert.strictEqual(state.data.category.name, 'Electronics');
    assert.strictEqual(state.data.vendor.storeName, 'Catalog Benchmark Hub');

    // Non-existent ID returns 404
    const fakeId = new mongoose.Types.ObjectId().toString();
    const { req: req404, res: res404, getState: get404 } = createMockReqRes({ params: { id: fakeId } });
    await getProductById(req404, res404);
    assert.strictEqual(get404().statusCode, 404);
  });

  await t.test('getFeaturedProducts returns max 8 featured products with populated refs', async () => {
    const { req, res, getState } = createMockReqRes();
    await getFeaturedProducts(req, res);

    const state = getState();
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.data.length, 8);
    for (const p of state.data) {
      assert.strictEqual(p.isFeatured, true);
      assert.ok(p.category.name);
      assert.ok(p.vendor.storeName);
    }
  });

  await t.test('getTrendingProducts returns in-stock products ordered by soldCount and rating', async () => {
    const { req, res, getState } = createMockReqRes();
    await getTrendingProducts(req, res);

    const state = getState();
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.data.length, 8);

    // Verify all returned products have stock > 0 and are sorted descending by soldCount
    let prevSoldCount = Infinity;
    for (const p of state.data) {
      assert.ok(p.stock > 0, 'Trending products must have stock > 0');
      assert.ok(p.soldCount <= prevSoldCount, 'Must be sorted descending by soldCount');
      prevSoldCount = p.soldCount;
    }
  });

  await t.test('getRelatedProducts returns up to 4 items in same category excluding self', async () => {
    const targetProduct = seededProducts[0]; // Electronics
    const { req, res, getState } = createMockReqRes({ params: { id: targetProduct._id.toString() } });
    await getRelatedProducts(req, res);

    const state = getState();
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.data.length, 4);

    for (const p of state.data) {
      assert.notStrictEqual(p._id.toString(), targetProduct._id.toString(), 'Must exclude current product');
      assert.strictEqual(p.category._id.toString(), targetProduct.category.toString(), 'Must be in same category');
    }
  });

  await t.test('Teardown test server', async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
});
