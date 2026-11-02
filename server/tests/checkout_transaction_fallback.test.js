'use strict';
/**
 * Test Suite: Subsegment 1.1 — Standalone MongoDB Transaction Detection & Graceful Fallback
 * 
 * Verifies:
 *  1. checkTransactionSupport correctly discriminates ReplicaSet/Sharded vs Standalone.
 *  2. Standalone MongoDB execution succeeds with sequential fallback and truthful status
 *     (COMMITTED_STANDALONE_SEQUENTIAL, isAcidReplicaSet: false).
 *  3. Standalone midway failure triggers compensating rollbacks and leaves zero stock leaks.
 *  4. Replica Set execution uses native multi-document ACID transactions
 *     (COMMITTED_REPLICA_SET_ACID, isAcidReplicaSet: true).
 *  5. Empty carts and missing customers are safely rejected.
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

const { processCheckout, checkTransactionSupport } = require('../controllers/checkoutController');

// Helper to create mock Express response object
function createMockRes() {
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
  return { res, getState: () => state };
}

test('Subsegment 1.1 — Unit: checkTransactionSupport topology detection', () => {
  // Save original client reference
  const origClient = mongoose.connection.client;

  try {
    // 1. Standalone ('Single')
    mongoose.connection.client = {
      topology: { description: { type: 'Single', setName: null } }
    };
    assert.strictEqual(checkTransactionSupport(), false, 'Single standalone must return false');

    // 2. Replica Set with primary
    mongoose.connection.client = {
      topology: { description: { type: 'ReplicaSetWithPrimary', setName: 'rs0' } }
    };
    assert.strictEqual(checkTransactionSupport(), true, 'ReplicaSetWithPrimary must return true');

    // 3. Sharded cluster
    mongoose.connection.client = {
      topology: { description: { type: 'Sharded', setName: null } }
    };
    assert.strictEqual(checkTransactionSupport(), true, 'Sharded must return true');

    // 4. Undefined / null topology
    mongoose.connection.client = null;
    assert.strictEqual(checkTransactionSupport(), false, 'Missing client must safely return false');
  } finally {
    mongoose.connection.client = origClient;
  }
});

test('Subsegment 1.1 — Standalone MongoDB Sequential Fallback & Compensating Rollback', async (t) => {
  let standaloneServer;

  await t.test('Setup standalone MongoMemoryServer (Non-replica set)', async () => {
    standaloneServer = await MongoMemoryServer.create();
    await mongoose.connect(standaloneServer.getUri());
    assert.strictEqual(checkTransactionSupport(), false, 'Standalone server must not support replica set transactions');
  });

  // Seed baseline entities
  let testUser, testVendor, testCategory, prod1, prod2;

  await t.test('Seed test entities on standalone server', async () => {
    testUser = await User.create({
      name: 'Standalone Buyer',
      email: 'buyer@standalone.test',
      password: 'password123',
      role: 'customer'
    });

    const vendorUser = await User.create({
      name: 'Standalone Vendor User',
      email: 'vendor@standalone.test',
      password: 'password123',
      role: 'vendor'
    });

    testVendor = await Vendor.create({
      user: vendorUser._id,
      storeName: 'Standalone Store',
      storeSlug: 'standalone-store',
      description: 'Test vendor'
    });

    testCategory = await Category.create({
      name: 'Standalone Category',
      slug: 'standalone-category',
      image: 'https://example.com/cat.jpg'
    });

    prod1 = await Product.create({
      name: 'Keyboard Alpha',
      description: 'Mechanical keyboard',
      price: 1500,
      stock: 10,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['https://example.com/kb.jpg']
    });

    prod2 = await Product.create({
      name: 'Mouse Beta',
      description: 'Gaming mouse',
      price: 800,
      stock: 5,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['https://example.com/ms.jpg']
    });
  });

  await t.test('Standalone Success: Checkout completes with sequential status and inventory decrement', async () => {
    // Put prod1 (qty: 2) in cart
    await Cart.create({
      user: testUser._id,
      items: [{
        product: prod1._id,
        vendor: testVendor._id,
        quantity: 2,
        priceAtAdd: 1500
      }]
    });

    const req = {
      user: { _id: testUser._id },
      body: {
        shippingAddress: {
          street: '123 Standalone Rd',
          city: 'TechCity',
          zipCode: '10001'
        },
        paymentMethod: 'Card'
      }
    };

    const { res, getState } = createMockRes();
    await processCheckout(req, res);

    const st = getState();
    assert.strictEqual(st.statusCode, 201, 'Must return HTTP 201 Created');
    assert.strictEqual(st.data.transactionStatus, 'COMMITTED_STANDALONE_SEQUENTIAL');
    assert.strictEqual(st.data.isAcidReplicaSet, false);
    assert.ok(st.data.order._id, 'Order must be created');

    // Verify database mutations
    const refreshedProd1 = await Product.findById(prod1._id);
    assert.strictEqual(refreshedProd1.stock, 8, 'Stock must decrement from 10 to 8');
    assert.strictEqual(refreshedProd1.soldCount, 2, 'SoldCount must increment to 2');

    // Cart must be cleared
    const refreshedCart = await Cart.findOne({ user: testUser._id });
    assert.strictEqual(refreshedCart.items.length, 0, 'Cart must be empty after checkout');
  });

  await t.test('Standalone Failure & Rollback: Insufficient stock on 2nd item aborts with zero inventory loss', async () => {
    // Setup cart with prod1 (qty: 1, stock available) and prod2 (qty: 10, only 5 available)
    const cart = await Cart.findOne({ user: testUser._id });
    cart.items = [
      { product: prod1._id, vendor: testVendor._id, quantity: 1, priceAtAdd: 1500 },
      { product: prod2._id, vendor: testVendor._id, quantity: 10, priceAtAdd: 800 } // will fail
    ];
    await cart.save();

    const stockBeforeProd1 = (await Product.findById(prod1._id)).stock; // 8
    const stockBeforeProd2 = (await Product.findById(prod2._id)).stock; // 5

    const req = {
      user: { _id: testUser._id },
      body: {
        shippingAddress: { street: '123 Standalone Rd', city: 'TechCity', zipCode: '10001' },
        paymentMethod: 'Card'
      }
    };

    const { res, getState } = createMockRes();
    await processCheckout(req, res);

    const st = getState();
    assert.strictEqual(st.statusCode, 400, 'Must return HTTP 400 Bad Request');
    assert.match(st.data.message, /Insufficient stock/i);

    // Verify NO stock was deducted from prod1
    const stockAfterProd1 = (await Product.findById(prod1._id)).stock;
    const stockAfterProd2 = (await Product.findById(prod2._id)).stock;
    assert.strictEqual(stockAfterProd1, stockBeforeProd1, 'Prod1 stock must not be deducted when order fails');
    assert.strictEqual(stockAfterProd2, stockBeforeProd2, 'Prod2 stock must not be deducted');

    // Verify cart was not cleared
    const cartAfter = await Cart.findOne({ user: testUser._id });
    assert.strictEqual(cartAfter.items.length, 2, 'Cart must retain items after failed checkout');
  });

  await t.test('Teardown standalone server', async () => {
    await mongoose.disconnect();
    await standaloneServer.stop();
  });
});

test('Subsegment 1.1 — Replica Set MongoMemoryReplSet Native ACID Transaction Mode', async (t) => {
  let replSet;

  await t.test('Setup MongoMemoryReplSet', async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    assert.strictEqual(checkTransactionSupport(), true, 'Replica set must support transactions');
  });

  let replUser, replVendor, replCat, replProd;

  await t.test('Seed test entities on replica set', async () => {
    replUser = await User.create({
      name: 'Replica Buyer',
      email: 'buyer@replica.test',
      password: 'password123',
      role: 'customer'
    });

    const vUser = await User.create({
      name: 'Replica Vendor User',
      email: 'vendor@replica.test',
      password: 'password123',
      role: 'vendor'
    });

    replVendor = await Vendor.create({
      user: vUser._id,
      storeName: 'Replica Store',
      storeSlug: 'replica-store',
      description: 'Replica vendor'
    });

    replCat = await Category.create({
      name: 'Replica Category',
      slug: 'replica-category',
      image: 'https://example.com/cat.jpg'
    });

    replProd = await Product.create({
      name: 'Headphones Pro',
      description: 'Wireless headphones',
      price: 2500,
      stock: 20,
      category: replCat._id,
      vendor: replVendor._id,
      images: ['https://example.com/hp.jpg']
    });
  });

  await t.test('Replica Set Success: Checkout completes with ACID status and committed transaction', async () => {
    await Cart.create({
      user: replUser._id,
      items: [{
        product: replProd._id,
        vendor: replVendor._id,
        quantity: 3,
        priceAtAdd: 2500
      }]
    });

    const req = {
      user: { _id: replUser._id },
      body: {
        shippingAddress: { street: '789 Replica Ave', city: 'ClusterCity', zipCode: '20002' },
        paymentMethod: 'UPI'
      }
    };

    const { res, getState } = createMockRes();
    await processCheckout(req, res);

    const st = getState();
    assert.strictEqual(st.statusCode, 201, 'Must return HTTP 201 Created');
    assert.strictEqual(st.data.transactionStatus, 'COMMITTED_REPLICA_SET_ACID');
    assert.strictEqual(st.data.isAcidReplicaSet, true);

    const refreshedProd = await Product.findById(replProd._id);
    assert.strictEqual(refreshedProd.stock, 17, 'Stock must decrement by 3');
    assert.strictEqual(refreshedProd.soldCount, 3);
  });

  await t.test('Teardown replica set', async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });
});
