'use strict';
/**
 * Test Suite: Subsegment 3.1 — Checkout Idempotency & Per-User Concurrency Protection
 *
 * Verifies:
 *  1. Concurrent checkout requests from the same user: Exactly 1 succeeds, remaining fail with 409 Conflict.
 *  2. Duplicate request keys: Supplying the same Idempotency-Key returns the cached order response.
 *  3. Retry after successful checkout: Does not create a duplicate order or decrement stock again.
 *  4. Retry after failed checkout: Failed requests clear the idempotency record, allowing immediate retries.
 *  5. Lock cleanup after errors: If an error is thrown, the per-user lock is freed cleanly.
 *  6. Cart clearing & inventory consistency: Stock is decremented exactly once, cart is cleared.
 *  7. Independent concurrent users: Two distinct users can check out simultaneously without blocking.
 */

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Cart = require('../models/Cart');

const { processCheckout } = require('../controllers/checkoutController');
const {
  _resetIdempotencyState,
  _activeUserCheckouts,
  _idempotencyStore
} = require('../services/checkoutIdempotencyService');

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

test('Subsegment 3.1 — Checkout Idempotency & Concurrency Suite', async (t) => {
  let mongoServer;
  let buyer1, buyer2, vendorUser, vendorProfile, category;
  let productA, productB;

  t.beforeEach(async () => {
    _resetIdempotencyState();
  });

  await t.test('Setup standalone MongoMemoryServer & seed base entities', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    buyer1 = await User.create({
      name: 'Alice Buyer',
      email: 'alice@test.com',
      password: 'password123',
      role: 'customer'
    });

    buyer2 = await User.create({
      name: 'Bob Buyer',
      email: 'bob@test.com',
      password: 'password123',
      role: 'customer'
    });

    vendorUser = await User.create({
      name: 'Vendor Owner',
      email: 'vendor@test.com',
      password: 'password123',
      role: 'vendor'
    });

    vendorProfile = await Vendor.create({
      user: vendorUser._id,
      storeName: 'Gadget Vault',
      storeSlug: 'gadget-vault',
      description: 'Best gadgets in town',
      status: 'approved'
    });

    category = await Category.create({
      name: 'Electronics',
      slug: 'electronics',
      image: 'https://example.com/cat.jpg'
    });

    productA = await Product.create({
      name: 'Mechanical Keyboard',
      description: 'RGB Mechanical Gaming Keyboard',
      price: 1500,
      discountPrice: 1200,
      stock: 50,
      soldCount: 0,
      category: category._id,
      vendor: vendorProfile._id,
      images: ['https://example.com/kbd.jpg'],
      isActive: true
    });

    productB = await Product.create({
      name: 'Wireless Mouse',
      description: 'Precision wireless mouse',
      price: 800,
      stock: 30,
      soldCount: 0,
      category: category._id,
      vendor: vendorProfile._id,
      images: ['https://example.com/mouse.jpg'],
      isActive: true
    });
  });

  await t.test('1. Concurrent checkouts from the same user: exactly 1 succeeds, other rejected with 409', async () => {
    // Populate cart for buyer1
    await Cart.findOneAndUpdate(
      { user: buyer1._id },
      {
        user: buyer1._id,
        items: [{ product: productA._id, quantity: 2 }]
      },
      { upsert: true, new: true }
    );

    const initialStock = (await Product.findById(productA._id)).stock;

    // Fire 4 parallel checkout requests for buyer1
    const shippingAddress = {
      street: '123 Tech Lane',
      city: 'Bangalore',
      zipCode: '560001'
    };

    const runRequest = async () => {
      const { req, res, getState } = createMockReqRes({
        user: buyer1,
        body: { shippingAddress, paymentMethod: 'Card' }
      });
      await processCheckout(req, res);
      return getState();
    };

    const results = await Promise.all([runRequest(), runRequest(), runRequest(), runRequest()]);

    const successes = results.filter(r => r.statusCode === 201);
    const conflicts = results.filter(r => r.statusCode === 409);

    assert.strictEqual(successes.length, 1, 'Exactly one concurrent checkout must succeed (201)');
    assert.strictEqual(conflicts.length, 3, 'All other concurrent checkouts must be rejected with 409 Conflict');
    assert.match(conflicts[0].data.message, /already in progress/i);

    // Verify stock was decremented exactly once by 2
    const updatedProd = await Product.findById(productA._id);
    assert.strictEqual(updatedProd.stock, initialStock - 2, 'Stock must only be decremented once');
    assert.strictEqual(updatedProd.soldCount, 2, 'soldCount must only be incremented once');

    // Verify buyer1 cart is empty
    const buyerCart = await Cart.findOne({ user: buyer1._id });
    assert.strictEqual(buyerCart.items.length, 0, 'Cart must be emptied after successful checkout');
  });

  await t.test('2. Duplicate request keys: Idempotency-Key returns cached order without duplicate order creation', async () => {
    // Populate cart for buyer1
    await Cart.findOneAndUpdate(
      { user: buyer1._id },
      {
        user: buyer1._id,
        items: [{ product: productB._id, quantity: 1 }]
      },
      { upsert: true, new: true }
    );

    const prodBStartStock = (await Product.findById(productB._id)).stock;
    const idempotencyKey = 'client-req-key-abc-123';
    const shippingAddress = {
      street: '123 Tech Lane',
      city: 'Bangalore',
      zipCode: '560001'
    };

    // First request with idempotency key
    const { req: req1, res: res1, getState: getState1 } = createMockReqRes({
      user: buyer1,
      body: { shippingAddress, paymentMethod: 'Card' },
      headers: { 'idempotency-key': idempotencyKey }
    });
    await processCheckout(req1, res1);
    const result1 = getState1();

    assert.strictEqual(result1.statusCode, 201, 'First request must succeed with 201');
    const createdOrderId = result1.data.order._id.toString();

    // Verify stock decremented by 1
    const midStock = (await Product.findById(productB._id)).stock;
    assert.strictEqual(midStock, prodBStartStock - 1);

    // Re-send identical request with same idempotency key (even though cart is now empty!)
    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      user: buyer1,
      body: { shippingAddress, paymentMethod: 'Card' },
      headers: { 'idempotency-key': idempotencyKey }
    });
    await processCheckout(req2, res2);
    const result2 = getState2();

    assert.strictEqual(result2.statusCode, 201, 'Replayed idempotent request must succeed with 201');
    assert.strictEqual(result2.data.order._id.toString(), createdOrderId, 'Replayed order ID must match original order');

    // Verify total orders in DB is still exactly 2 (1 from test 1, 1 from test 2)
    const totalOrders = await Order.countDocuments();
    assert.strictEqual(totalOrders, 2, 'No duplicate order document should be created');

    // Stock must NOT have decremented again
    const finalStock = (await Product.findById(productB._id)).stock;
    assert.strictEqual(finalStock, midStock, 'Stock must not be decremented on idempotent replay');
  });

  await t.test('3. Retry after failed checkout: Failure clears idempotency key so subsequent retry succeeds', async () => {
    const idempotencyKey = 'retry-fail-key-789';

    // Attempt checkout with missing shipping street (will fail validation with 400)
    const { req: reqFail, res: resFail, getState: getFailState } = createMockReqRes({
      user: buyer1,
      body: {
        shippingAddress: { city: 'Bangalore', zipCode: '560001' }, // Missing street
        paymentMethod: 'Card'
      },
      headers: { 'idempotency-key': idempotencyKey }
    });
    await processCheckout(reqFail, resFail);
    const failState = getFailState();
    assert.strictEqual(failState.statusCode, 400, 'Invalid address must return 400');

    // Populate cart with a valid item
    await Cart.findOneAndUpdate(
      { user: buyer1._id },
      {
        user: buyer1._id,
        items: [{ product: productA._id, quantity: 1 }]
      },
      { upsert: true, new: true }
    );

    // Retry with corrected address using THE SAME idempotency key
    const { req: reqRetry, res: resRetry, getState: getRetryState } = createMockReqRes({
      user: buyer1,
      body: {
        shippingAddress: { street: '456 Correct St', city: 'Bangalore', zipCode: '560001' },
        paymentMethod: 'Card'
      },
      headers: { 'idempotency-key': idempotencyKey }
    });
    await processCheckout(reqRetry, resRetry);
    const retryState = getRetryState();

    assert.strictEqual(retryState.statusCode, 201, 'Retry with same key must succeed after previous failure');
    assert.ok(retryState.data.order, 'Order should be created');
  });

  await t.test('4. Lock cleanup after errors: Mutex is freed so subsequent attempts are not blocked', async () => {
    // Attempt checkout on empty cart (buyer1's cart was emptied in test 3)
    const { req: req1, res: res1, getState: getState1 } = createMockReqRes({
      user: buyer1,
      body: {
        shippingAddress: { street: '123 Tech Lane', city: 'Bangalore', zipCode: '560001' }
      }
    });
    await processCheckout(req1, res1);
    assert.strictEqual(getState1().statusCode, 400, 'Empty cart returns 400');

    // Verify lock is NOT held for buyer1
    assert.strictEqual(_activeUserCheckouts.has(buyer1._id.toString()), false, 'Lock must be released on error');

    // Refill cart and run another checkout immediately - must NOT get 409
    await Cart.findOneAndUpdate(
      { user: buyer1._id },
      {
        user: buyer1._id,
        items: [{ product: productB._id, quantity: 1 }]
      },
      { upsert: true, new: true }
    );

    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      user: buyer1,
      body: {
        shippingAddress: { street: '123 Tech Lane', city: 'Bangalore', zipCode: '560001' }
      }
    });
    await processCheckout(req2, res2);
    assert.strictEqual(getState2().statusCode, 201, 'Subsequent checkout must succeed and not be blocked');
  });

  await t.test('5. Independent concurrent users: Buyer 1 and Buyer 2 check out concurrently without blocking each other', async () => {
    // Populate cart for buyer1
    await Cart.findOneAndUpdate(
      { user: buyer1._id },
      {
        user: buyer1._id,
        items: [{ product: productA._id, quantity: 1 }]
      },
      { upsert: true, new: true }
    );

    // Populate cart for buyer2
    await Cart.findOneAndUpdate(
      { user: buyer2._id },
      {
        user: buyer2._id,
        items: [{ product: productB._id, quantity: 1 }]
      },
      { upsert: true, new: true }
    );

    const shippingAddress = {
      street: 'Common Street',
      city: 'Bangalore',
      zipCode: '560001'
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

    const [resBuyer1, resBuyer2] = await Promise.all([checkoutBuyer1(), checkoutBuyer2()]);

    assert.strictEqual(resBuyer1.statusCode, 201, 'Buyer 1 checkout must succeed');
    assert.strictEqual(resBuyer2.statusCode, 201, 'Buyer 2 checkout must succeed concurrently');
  });

  t.after(async () => {
    _resetIdempotencyState();
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });
});
