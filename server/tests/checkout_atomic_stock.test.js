'use strict';
/**
 * Test Suite: Subsegment 3.2 — Atomic Conditional Stock Updates & COD Payment Lifecycle
 *
 * Verifies:
 *  1. Concurrent purchases against limited stock: Conditional atomic updates prevent overselling.
 *  2. Insufficient stock: Rejected with descriptive 400 error and no stock alteration.
 *  3. Multi-product checkout: Multiple items atomically decremented in sequential standalone execution.
 *  4. Mid-checkout failure & inventory restoration: If product 2 fails, product 1 is restored atomically.
 *  5. Absolute lower bound: Stock never drops below zero.
 *  6. COD payment lifecycle: Cash on Delivery orders initialize with paymentStatus: 'Pending'.
 *  7. Prepaid payment lifecycle: Card/UPI orders initialize with paymentStatus: 'Paid'.
 *  8. Replica Set ACID transaction compatibility: Transactions commit atomically when supported.
 */

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer, MongoMemoryReplSet } = require('mongodb-memory-server');

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Cart = require('../models/Cart');

const { processCheckout } = require('../controllers/checkoutController');
const { _resetIdempotencyState } = require('../services/checkoutIdempotencyService');

// Helper to create mock Express req/res
function createMockReqRes({ user, body = {}, headers = {} } = {}) {
  const req = { user, body, headers };
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

test('Subsegment 3.2 — Standalone Atomic Stock Decrements & COD Lifecycle', async (t) => {
  let mongoServer;
  let buyer1, buyer2, vendorUser, vendorProfile, category;
  let limitedProduct, prodA, prodB;

  t.beforeEach(async () => {
    _resetIdempotencyState();
  });

  await t.test('Setup standalone MongoMemoryServer & seed test catalog', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    buyer1 = await User.create({
      name: 'Customer One',
      email: 'c1@test.com',
      password: 'password123',
      role: 'customer'
    });

    buyer2 = await User.create({
      name: 'Customer Two',
      email: 'c2@test.com',
      password: 'password123',
      role: 'customer'
    });

    vendorUser = await User.create({
      name: 'Vendor User',
      email: 'v@test.com',
      password: 'password123',
      role: 'vendor'
    });

    vendorProfile = await Vendor.create({
      user: vendorUser._id,
      storeName: 'Atomic Store',
      storeSlug: 'atomic-store',
      description: 'Store with strictly verified inventory',
      status: 'approved'
    });

    category = await Category.create({
      name: 'Hardware',
      slug: 'hardware',
      image: 'https://example.com/hw.jpg'
    });

    limitedProduct = await Product.create({
      name: 'Limited GPU',
      description: 'Ultra rare graphics card',
      price: 50000,
      stock: 3, // Only 3 available
      soldCount: 0,
      category: category._id,
      vendor: vendorProfile._id,
      images: ['https://example.com/gpu.jpg'],
      isActive: true
    });

    prodA = await Product.create({
      name: 'RAM Stick 16GB',
      description: 'Fast memory',
      price: 4000,
      stock: 10,
      soldCount: 0,
      category: category._id,
      vendor: vendorProfile._id,
      images: ['https://example.com/ram.jpg'],
      isActive: true
    });

    prodB = await Product.create({
      name: 'SSD 1TB',
      description: 'Fast storage',
      price: 6000,
      stock: 2, // Only 2 in stock
      soldCount: 0,
      category: category._id,
      vendor: vendorProfile._id,
      images: ['https://example.com/ssd.jpg'],
      isActive: true
    });
  });

  await t.test('1. Concurrent purchases against limited stock: conditional atomic $inc prevents overselling', async () => {
    // Both buyer1 and buyer2 put 2 units of limitedProduct in cart (total requested = 4, but stock = 3)
    await Cart.findOneAndUpdate(
      { user: buyer1._id },
      { user: buyer1._id, items: [{ product: limitedProduct._id, quantity: 2 }] },
      { upsert: true }
    );

    await Cart.findOneAndUpdate(
      { user: buyer2._id },
      { user: buyer2._id, items: [{ product: limitedProduct._id, quantity: 2 }] },
      { upsert: true }
    );

    const shippingAddress = {
      street: '42 Silicon Highway',
      city: 'Hyderabad',
      zipCode: '500081'
    };

    const checkoutBuyer1 = async () => {
      const { req, res, getState } = createMockReqRes({
        user: buyer1,
        body: { shippingAddress, paymentMethod: 'Card' }
      });
      await processCheckout(req, res);
      return getState();
    };

    const checkoutBuyer2 = async () => {
      const { req, res, getState } = createMockReqRes({
        user: buyer2,
        body: { shippingAddress, paymentMethod: 'Card' }
      });
      await processCheckout(req, res);
      return getState();
    };

    // Run simultaneously
    const [res1, res2] = await Promise.all([checkoutBuyer1(), checkoutBuyer2()]);

    const results = [res1, res2];
    const successfulCheckouts = results.filter(r => r.statusCode === 201);
    const failedCheckouts = results.filter(r => r.statusCode === 400);

    assert.strictEqual(successfulCheckouts.length, 1, 'Exactly one buyer must succeed purchasing 2 units');
    assert.strictEqual(failedCheckouts.length, 1, 'The other buyer must fail due to insufficient stock');
    assert.match(failedCheckouts[0].data.message, /insufficient stock/i);

    // Verify stock is now 3 - 2 = 1 (never negative!)
    const currentStock = (await Product.findById(limitedProduct._id)).stock;
    assert.strictEqual(currentStock, 1, 'Remaining stock must be exactly 1');
  });

  await t.test('2. Insufficient stock directly rejected with 400 without mutating stock', async () => {
    // Limited product now has stock 1. Buyer2 tries to purchase 5 units
    await Cart.findOneAndUpdate(
      { user: buyer2._id },
      { user: buyer2._id, items: [{ product: limitedProduct._id, quantity: 5 }] },
      { upsert: true }
    );

    const { req, res, getState } = createMockReqRes({
      user: buyer2,
      body: {
        shippingAddress: { street: 'Main St', city: 'Delhi', zipCode: '110001' },
        paymentMethod: 'Card'
      }
    });

    await processCheckout(req, res);
    const result = getState();

    assert.strictEqual(result.statusCode, 400, 'Insufficient stock must return 400');
    assert.match(result.data.message, /insufficient stock for "Limited GPU"/i);

    // Stock must remain 1
    const stockAfter = (await Product.findById(limitedProduct._id)).stock;
    assert.strictEqual(stockAfter, 1, 'Stock must not change on rejection');
  });

  await t.test('3. Mid-checkout failure & atomic restoration: Failed second item restores first item stock', async () => {
    // Cart contains prodA (qty 2, stock is 10) AND prodB (qty 5, but stock is only 2!)
    const initialStockA = (await Product.findById(prodA._id)).stock;
    const initialSoldA = (await Product.findById(prodA._id)).soldCount;

    await Cart.findOneAndUpdate(
      { user: buyer1._id },
      {
        user: buyer1._id,
        items: [
          { product: prodA._id, quantity: 2 },
          { product: prodB._id, quantity: 5 }
        ]
      },
      { upsert: true }
    );

    const { req, res, getState } = createMockReqRes({
      user: buyer1,
      body: {
        shippingAddress: { street: 'Main St', city: 'Delhi', zipCode: '110001' },
        paymentMethod: 'Card'
      }
    });

    await processCheckout(req, res);
    const result = getState();

    assert.strictEqual(result.statusCode, 400, 'Checkout must fail on second item');
    assert.match(result.data.message, /insufficient stock for "SSD 1TB"/i);

    // Verify prodA was restored via compensation stack
    const restoredProdA = await Product.findById(prodA._id);
    assert.strictEqual(restoredProdA.stock, initialStockA, 'Product A stock must be restored to initial');
    assert.strictEqual(restoredProdA.soldCount, initialSoldA, 'Product A soldCount must be restored to initial');

    // Verify prodB stock was untouched
    const prodBStock = (await Product.findById(prodB._id)).stock;
    assert.strictEqual(prodBStock, 2, 'Product B stock must remain unchanged');
  });

  await t.test('4. COD Payment Lifecycle: Cash on Delivery orders initialize with paymentStatus: "Pending"', async () => {
    await Cart.findOneAndUpdate(
      { user: buyer1._id },
      { user: buyer1._id, items: [{ product: prodA._id, quantity: 1 }] },
      { upsert: true }
    );

    const { req, res, getState } = createMockReqRes({
      user: buyer1,
      body: {
        shippingAddress: { street: '78 Ring Road', city: 'Pune', zipCode: '411001' },
        paymentMethod: 'COD'
      }
    });

    await processCheckout(req, res);
    const result = getState();

    assert.strictEqual(result.statusCode, 201, 'COD checkout must succeed');
    assert.strictEqual(result.data.order.paymentMethod, 'COD', 'paymentMethod must be COD');
    assert.strictEqual(result.data.order.paymentStatus, 'Pending', 'COD order must have paymentStatus "Pending"');
    assert.strictEqual(result.data.order.orderStatus, 'Processing', 'Initial orderStatus must be "Processing"');
  });

  await t.test('5. Prepaid Payment Lifecycle: Card/UPI orders initialize with paymentStatus: "Paid"', async () => {
    await Cart.findOneAndUpdate(
      { user: buyer2._id },
      { user: buyer2._id, items: [{ product: prodA._id, quantity: 1 }] },
      { upsert: true }
    );

    const { req, res, getState } = createMockReqRes({
      user: buyer2,
      body: {
        shippingAddress: { street: '99 Tech Park', city: 'Chennai', zipCode: '600001' },
        paymentMethod: 'Card'
      }
    });

    await processCheckout(req, res);
    const result = getState();

    assert.strictEqual(result.statusCode, 201, 'Card checkout must succeed');
    assert.strictEqual(result.data.order.paymentMethod, 'Card');
    assert.strictEqual(result.data.order.paymentStatus, 'Paid', 'Prepaid order must have paymentStatus "Paid"');
  });

  t.after(async () => {
    _resetIdempotencyState();
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });
});

test('Subsegment 3.2 — Replica Set ACID Transaction Coordination Mode', async (t) => {
  let replSet;
  let buyer, vendorUser, vendorProfile, category, prod;

  t.beforeEach(async () => {
    _resetIdempotencyState();
  });

  await t.test('Setup MongoMemoryReplSet (ACID Transaction mode)', async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());

    buyer = await User.create({
      name: 'Replica Buyer',
      email: 'rbuyer@test.com',
      password: 'password123',
      role: 'customer'
    });

    vendorUser = await User.create({
      name: 'Replica Vendor',
      email: 'rvendor@test.com',
      password: 'password123',
      role: 'vendor'
    });

    vendorProfile = await Vendor.create({
      user: vendorUser._id,
      storeName: 'Replica Store',
      storeSlug: 'replica-store',
      description: 'Replica verified inventory',
      status: 'approved'
    });

    category = await Category.create({
      name: 'Computing',
      slug: 'computing',
      image: 'https://example.com/comp.jpg'
    });

    prod = await Product.create({
      name: 'ACID Processor',
      description: 'Octa-core processor',
      price: 25000,
      stock: 5,
      soldCount: 0,
      category: category._id,
      vendor: vendorProfile._id,
      images: ['https://example.com/cpu.jpg'],
      isActive: true
    });
  });

  await t.test('Replica Set Success: Checkout commits atomically and marks COD as Pending', async () => {
    await Cart.findOneAndUpdate(
      { user: buyer._id },
      { user: buyer._id, items: [{ product: prod._id, quantity: 2 }] },
      { upsert: true }
    );

    const { req, res, getState } = createMockReqRes({
      user: buyer,
      body: {
        shippingAddress: { street: '1 Replica Road', city: 'Mumbai', zipCode: '400001' },
        paymentMethod: 'COD'
      }
    });

    await processCheckout(req, res);
    const result = getState();

    assert.strictEqual(result.statusCode, 201);
    assert.strictEqual(result.data.transactionStatus, 'COMMITTED_REPLICA_SET_ACID');
    assert.strictEqual(result.data.isAcidReplicaSet, true);
    assert.strictEqual(result.data.order.paymentStatus, 'Pending');

    const updatedProd = await Product.findById(prod._id);
    assert.strictEqual(updatedProd.stock, 3);
    assert.strictEqual(updatedProd.soldCount, 2);
  });

  t.after(async () => {
    _resetIdempotencyState();
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });
});
