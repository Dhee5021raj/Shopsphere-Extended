'use strict';
/**
 * Test Suite: Subsegment 2.1 — Multikey Compound Indexing Architecture
 *
 * Verifies:
 *  1. Schema Index Metadata: Order, Review, and Vendor have defined targeted compound/multikey indexes.
 *  2. Real Index Synchronization: syncIndexes creates all indexes on MongoDB without error.
 *  3. Query Plan Verification (explain executionStats):
 *     - Review.find({ product }).sort({ createdAt: -1 }) uses IXSCAN on product_1_createdAt_-1 with zero in-memory SORT.
 *     - Review.find({ vendor }).sort({ rating: 1 }) uses IXSCAN on vendor_1_rating_1.
 *     - Order.find({ 'items.vendor': id }).sort({ createdAt: -1 }) uses multikey IXSCAN on items.vendor_1_items.status_1_createdAt_-1.
 *     - Order.find({ orderStatus: 'Delivered' }).sort({ createdAt: -1 }) uses IXSCAN on orderStatus_1_createdAt_-1.
 *     - Order.findOne({ customer, 'items.product': id }) uses IXSCAN on customer_1_items.product_1.
 *     - Vendor.find({ status: 'approved' }).sort({ rating: -1, totalSales: -1 }) uses IXSCAN with zero in-memory SORT.
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Order = require('../models/Order');
const Review = require('../models/Review');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');

// Helper to inspect winning plan recursively for stage and indexName
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

test('Subsegment 2.1 — Multikey Compound Indexing Architecture Suite', async (t) => {
  let mongoServer;
  let testCustomer, testVendorUser, testVendor, testCategory, testProduct;

  await t.test('Setup MongoMemoryServer and seed base models', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Ensure all model indexes are built in the database
    await Order.syncIndexes();
    await Review.syncIndexes();
    await Vendor.syncIndexes();
    await Product.syncIndexes();

    testCustomer = await User.create({
      name: 'Index Test Customer',
      email: 'customer.index@test.com',
      password: 'password123',
      role: 'customer'
    });

    testVendorUser = await User.create({
      name: 'Index Test Vendor Owner',
      email: 'vendor.index@test.com',
      password: 'password123',
      role: 'vendor'
    });

    testVendor = await Vendor.create({
      user: testVendorUser._id,
      storeName: 'Index Audio Labs',
      storeSlug: 'index-audio-labs',
      description: 'High fidelity audio equipment',
      status: 'approved',
      rating: 4.8,
      numRatings: 25,
      totalSales: 150000
    });

    testCategory = await Category.create({
      name: 'Index Audio',
      slug: 'index-audio',
      description: 'Audio devices and headphones',
      icon: 'Headphones',
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'
    });

    testProduct = await Product.create({
      name: 'Wireless Studio Headphones',
      description: 'Active noise cancelling studio monitors',
      price: 15000,
      stock: 50,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600']
    });

    // Seed multiple reviews
    for (let i = 1; i <= 5; i++) {
      const u = await User.create({
        name: `Reviewer ${i}`,
        email: `reviewer${i}@test.com`,
        password: 'password123',
        role: 'customer'
      });
      await Review.create({
        user: u._id,
        product: testProduct._id,
        vendor: testVendor._id,
        rating: 4 + (i % 2),
        comment: `Excellent product review ${i}`
      });
    }

    // Seed multiple orders
    for (let i = 1; i <= 4; i++) {
      await Order.create({
        customer: testCustomer._id,
        items: [
          {
            product: testProduct._id,
            vendor: testVendor._id,
            name: testProduct.name,
            quantity: i,
            price: testProduct.price,
            status: i === 4 ? 'Cancelled' : 'Delivered'
          }
        ],
        shippingAddress: {
          street: '123 Audio Lane',
          city: 'Bengaluru',
          state: 'Karnataka',
          zipCode: '560001'
        },
        totalAmount: testProduct.price * i,
        paymentStatus: 'Paid',
        paymentMethod: 'Card',
        orderStatus: i === 4 ? 'Cancelled' : 'Delivered'
      });
    }
  });

  await t.test('Schema Index Metadata Inspection', () => {
    // 1. Order Indexes
    const orderIndexKeys = Order.schema.indexes().map(([spec]) => JSON.stringify(spec));
    assert.ok(
      orderIndexKeys.includes(JSON.stringify({ customer: 1, createdAt: -1 })),
      'Order must retain { customer: 1, createdAt: -1 }'
    );
    assert.ok(
      orderIndexKeys.includes(JSON.stringify({ 'items.vendor': 1, 'items.status': 1, createdAt: -1 })),
      'Order must define multikey index { "items.vendor": 1, "items.status": 1, createdAt: -1 }'
    );
    assert.ok(
      orderIndexKeys.includes(JSON.stringify({ orderStatus: 1, createdAt: -1 })),
      'Order must define compound index { orderStatus: 1, createdAt: -1 }'
    );
    assert.ok(
      orderIndexKeys.includes(JSON.stringify({ customer: 1, 'items.product': 1 })),
      'Order must define compound multikey index { customer: 1, "items.product": 1 }'
    );

    // 2. Review Indexes
    const reviewIndexKeys = Review.schema.indexes().map(([spec]) => JSON.stringify(spec));
    assert.ok(
      reviewIndexKeys.includes(JSON.stringify({ user: 1, product: 1 })),
      'Review must retain unique compound index { user: 1, product: 1 }'
    );
    assert.ok(
      reviewIndexKeys.includes(JSON.stringify({ product: 1, createdAt: -1 })),
      'Review must define index { product: 1, createdAt: -1 }'
    );
    assert.ok(
      reviewIndexKeys.includes(JSON.stringify({ vendor: 1, rating: 1 })),
      'Review must define index { vendor: 1, rating: 1 }'
    );

    // 3. Vendor Indexes
    const vendorIndexKeys = Vendor.schema.indexes().map(([spec]) => JSON.stringify(spec));
    assert.ok(
      vendorIndexKeys.includes(JSON.stringify({ status: 1, rating: -1, totalSales: -1 })),
      'Vendor must define compound index { status: 1, rating: -1, totalSales: -1 }'
    );
  });

  await t.test('Review Product Date-Sorted Queries use IXSCAN with Zero In-Memory SORT', async () => {
    const explainResult = await Review.find({ product: testProduct._id })
      .sort({ createdAt: -1 })
      .explain('executionStats');

    const winningPlan = explainResult.queryPlanner?.winningPlan;
    assert.ok(winningPlan, 'Query planner must provide a winning plan');

    // Winning plan must use IXSCAN on product_1_createdAt_-1
    const ixScanStage = findStageInPlan(winningPlan, 'IXSCAN');
    assert.ok(ixScanStage, 'Query must execute via IXSCAN');
    assert.strictEqual(
      ixScanStage.indexName,
      'product_1_createdAt_-1',
      `Expected index product_1_createdAt_-1, got ${ixScanStage.indexName}`
    );

    // Verify sort is satisfied by the index (NO in-memory SORT stage)
    const sortStage = findStageInPlan(winningPlan, 'SORT');
    assert.strictEqual(sortStage, null, 'Query must satisfy sorting via index without an in-memory SORT stage');

    // ExecutionStats verification
    assert.strictEqual(
      explainResult.executionStats.nReturned,
      5,
      'Must return exactly 5 reviews'
    );
    assert.strictEqual(
      explainResult.executionStats.totalDocsExamined,
      5,
      'totalDocsExamined must equal nReturned (exact index coverage)'
    );
  });

  await t.test('Vendor Order Queries use Multikey IXSCAN on items.vendor', async () => {
    const explainResult = await Order.find({ 'items.vendor': testVendor._id })
      .sort({ createdAt: -1 })
      .explain('executionStats');

    const winningPlan = explainResult.queryPlanner?.winningPlan;
    assert.ok(winningPlan, 'Query planner must provide a winning plan');

    const ixScanStage = findStageInPlan(winningPlan, 'IXSCAN');
    assert.ok(ixScanStage, 'Order query by vendor must execute via IXSCAN');
    assert.strictEqual(
      ixScanStage.indexName,
      'items.vendor_1_items.status_1_createdAt_-1',
      `Expected multikey index items.vendor_1_items.status_1_createdAt_-1, got ${ixScanStage.indexName}`
    );
    assert.strictEqual(ixScanStage.isMultiKey, true, 'Index must be marked as multikey by MongoDB');
  });

  await t.test('Admin Order Status Queries use IXSCAN on orderStatus_1_createdAt_-1', async () => {
    const explainResult = await Order.find({ orderStatus: 'Delivered' })
      .sort({ createdAt: -1 })
      .explain('executionStats');

    const winningPlan = explainResult.queryPlanner?.winningPlan;
    assert.ok(winningPlan, 'Query planner must provide a winning plan');

    const ixScanStage = findStageInPlan(winningPlan, 'IXSCAN');
    assert.ok(ixScanStage, 'Order query by status must execute via IXSCAN');
    assert.strictEqual(
      ixScanStage.indexName,
      'orderStatus_1_createdAt_-1',
      `Expected index orderStatus_1_createdAt_-1, got ${ixScanStage.indexName}`
    );

    const sortStage = findStageInPlan(winningPlan, 'SORT');
    assert.strictEqual(sortStage, null, 'Sorting must be satisfied by compound index without in-memory SORT');
  });

  await t.test('Customer Verified Purchase Queries use customer_1_items.product_1 Index', async () => {
    const explainResult = await Order.find({
      customer: testCustomer._id,
      'items.product': testProduct._id
    }).explain('executionStats');

    const winningPlan = explainResult.queryPlanner?.winningPlan;
    assert.ok(winningPlan, 'Query planner must provide a winning plan');

    const ixScanStage = findStageInPlan(winningPlan, 'IXSCAN');
    assert.ok(ixScanStage, 'Verified purchase lookup must execute via IXSCAN');
    assert.strictEqual(
      ixScanStage.indexName,
      'customer_1_items.product_1',
      `Expected index customer_1_items.product_1, got ${ixScanStage.indexName}`
    );
  });

  await t.test('Public Vendor Directory Query uses status_1_rating_-1_totalSales_-1 Index', async () => {
    const explainResult = await Vendor.find({ status: 'approved' })
      .sort({ rating: -1, totalSales: -1 })
      .explain('executionStats');

    const winningPlan = explainResult.queryPlanner?.winningPlan;
    assert.ok(winningPlan, 'Query planner must provide a winning plan');

    const ixScanStage = findStageInPlan(winningPlan, 'IXSCAN');
    assert.ok(ixScanStage, 'Vendor directory lookup must execute via IXSCAN');
    assert.strictEqual(
      ixScanStage.indexName,
      'status_1_rating_-1_totalSales_-1',
      `Expected index status_1_rating_-1_totalSales_-1, got ${ixScanStage.indexName}`
    );

    const sortStage = findStageInPlan(winningPlan, 'SORT');
    assert.strictEqual(sortStage, null, 'Vendor directory query must not require in-memory SORT');
  });

  await t.test('Teardown database connection', async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
});
