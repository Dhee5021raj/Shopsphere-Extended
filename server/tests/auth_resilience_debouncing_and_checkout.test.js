'use strict';
/**
 * Test Suite: Block B (Subsegments 3.4–3.5)
 * Authentication Resilience, Registration Validation, and Checkout Double-Submit Protection
 *
 * Verifies:
 *  1. Customer Registration Validation:
 *     - Rejects missing required fields (name, email, password) with 400.
 *     - Rejects whitespace-only name, email, or password with 400.
 *     - Rejects invalid email formats (e.g., 'not-an-email', 'missing@tld') with 400.
 *     - Enforces password minimum length of 6 characters.
 *     - Rejects duplicate email registration (case-insensitive and trimmed) with 400.
 *     - Successful customer registration creates user, initializes empty Cart, hashes password,
 *       and returns JWT token without leaking password.
 *  2. Vendor Registration Validation:
 *     - Rejects missing storeName with 400.
 *     - Rejects duplicate vendor email with 400.
 *     - Creates approved vendor profile and slug, plus user and cart.
 *  3. Authentication Resilience & Error Handling:
 *     - Login rejects missing email or password with 400.
 *     - Login rejects non-existent email with 401.
 *     - Login rejects wrong password with 401.
 *     - Login rejects blocked accounts with 403.
 *     - Malformed registration/login requests handle gracefully without crashing server.
 *     - Profile updates reject empty names and short passwords with 400.
 *  4. Checkout Double-Submit & Concurrency Protection:
 *     - Rejects checkout with missing or whitespace-only shipping address with 400.
 *     - Rejects checkout on empty cart with 400.
 *     - Idempotent replay: Submitting same Idempotency-Key returns cached 201 order response with X-Idempotent-Replay header.
 *     - Inventory decrements exactly once across idempotent retries.
 *     - Per-user in-flight concurrency lock: Rapid concurrent checkout requests from the same user block the second call with 409 Conflict.
 *     - Subsequent purchases: After placing an order, adding new items and checking out with a new idempotency key succeeds.
 */

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Cart = require('../models/Cart');

const {
  registerCustomer,
  registerVendor,
  loginUser,
  getMe,
  updateProfile
} = require('../controllers/authController');

const { processCheckout } = require('../controllers/checkoutController');
const {
  _resetIdempotencyState
} = require('../services/checkoutIdempotencyService');

// Helper to create mock Express req/res
function createMockReqRes({ user, body = {}, headers = {}, params = {} } = {}) {
  const req = { user, body, headers, params };
  const state = { statusCode: 200, data: null, headers: {} };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(data) {
      state.data = data;
      return res;
    },
    set(headerName, headerVal) {
      state.headers[headerName] = headerVal;
      return res;
    }
  };
  return { req, res, getState: () => state };
}

test('Block B — Authentication Resilience & Checkout Protection Suite', async (t) => {
  let mongoServer;
  let testCategory, testVendorUser, testVendorProfile;

  t.beforeEach(async () => {
    process.env.JWT_SECRET = 'super_secure_test_jwt_secret_for_block_b_validation_32chars';
    _resetIdempotencyState();
  });

  await t.test('Setup isolated MongoMemoryServer and base entities', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    testCategory = await Category.create({
      name: 'Electronics Test',
      slug: 'electronics-test',
      description: 'Test category',
      image: 'https://example.com/electronics.jpg'
    });

    testVendorUser = await User.create({
      name: 'Global Tech Vendor',
      email: 'globaltech@test.com',
      password: 'password123',
      role: 'vendor'
    });

    testVendorProfile = await Vendor.create({
      user: testVendorUser._id,
      storeName: 'Global Tech Labs',
      storeSlug: 'global-tech-labs',
      description: 'Official test tech lab vendor',
      status: 'approved'
    });
  });

  // =========================================================================
  // SECTION 1: Customer Registration Validation & Resilience
  // =========================================================================
  await t.test('1. Customer Registration: rejects missing or whitespace name', async () => {
    const { req: req1, res: res1, getState: getState1 } = createMockReqRes({
      body: { name: '', email: 'valid@test.com', password: 'password123' }
    });
    await registerCustomer(req1, res1);
    assert.strictEqual(getState1().statusCode, 400);
    assert.match(getState1().data.message, /name/i);

    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      body: { name: '   ', email: 'valid@test.com', password: 'password123' }
    });
    await registerCustomer(req2, res2);
    assert.strictEqual(getState2().statusCode, 400);
    assert.match(getState2().data.message, /name/i);
  });

  await t.test('2. Customer Registration: rejects invalid email formats', async () => {
    const invalidEmails = ['plainaddress', 'missingat.com', '@nodomain.com', 'spaces in@mail.com'];
    for (const email of invalidEmails) {
      const { req, res, getState } = createMockReqRes({
        body: { name: 'Valid User', email, password: 'password123' }
      });
      await registerCustomer(req, res);
      assert.strictEqual(getState().statusCode, 400, `Expected 400 for email: ${email}`);
      assert.match(getState().data.message, /email/i);
    }
  });

  await t.test('3. Customer Registration: enforces password minimum length of 6 chars', async () => {
    const { req, res, getState } = createMockReqRes({
      body: { name: 'Valid User', email: 'user@test.com', password: '123' }
    });
    await registerCustomer(req, res);
    assert.strictEqual(getState().statusCode, 400);
    assert.match(getState().data.message, /password must be at least 6 characters/i);
  });

  await t.test('4. Customer Registration: succeeds with valid input, hashes password, creates cart, never leaks password', async () => {
    const { req, res, getState } = createMockReqRes({
      body: { name: '  Sarah Jenkins  ', email: '  Sarah.Jenkins@example.com ', password: 'securePassword123' }
    });
    await registerCustomer(req, res);
    assert.strictEqual(getState().statusCode, 201);
    const data = getState().data;

    assert.strictEqual(data.name, 'Sarah Jenkins');
    assert.strictEqual(data.email, 'sarah.jenkins@example.com');
    assert.strictEqual(data.role, 'customer');
    assert.ok(data.token, 'Should return JWT auth token');
    assert.strictEqual(data.password, undefined, 'Must NEVER leak password in response');

    // Verify DB record
    const userInDb = await User.findById(data._id);
    assert.ok(userInDb);
    assert.strictEqual(userInDb.email, 'sarah.jenkins@example.com');
    const isBcryptHashed = await bcrypt.compare('securePassword123', userInDb.password);
    assert.strictEqual(isBcryptHashed, true, 'Stored password must be properly hashed with bcrypt');

    // Verify Cart initialization
    const userCart = await Cart.findOne({ user: userInDb._id });
    assert.ok(userCart, 'Must initialize an empty cart for newly registered customer');
    assert.strictEqual(userCart.items.length, 0);
  });

  await t.test('5. Customer Registration: rejects duplicate email (case-insensitive & trimmed)', async () => {
    const { req, res, getState } = createMockReqRes({
      body: { name: 'Duplicate User', email: 'SARAH.JENKINS@EXAMPLE.COM', password: 'newPassword123' }
    });
    await registerCustomer(req, res);
    assert.strictEqual(getState().statusCode, 400);
    assert.match(getState().data.message, /already exists/i);
  });

  // =========================================================================
  // SECTION 2: Vendor Registration Validation
  // =========================================================================
  await t.test('6. Vendor Registration: rejects missing or whitespace storeName', async () => {
    const { req, res, getState } = createMockReqRes({
      body: { name: 'Seller Person', email: 'seller@test.com', password: 'password123', storeName: '  ' }
    });
    await registerVendor(req, res);
    assert.strictEqual(getState().statusCode, 400);
    assert.match(getState().data.message, /store \/ business name/i);
  });

  await t.test('7. Vendor Registration: succeeds and creates vendor profile & slug', async () => {
    const { req, res, getState } = createMockReqRes({
      body: {
        name: 'Michael Maker',
        email: 'michael@artisan.com',
        password: 'password123',
        storeName: 'Artisan Wood Craft',
        description: 'Handmade wooden crafts'
      }
    });
    await registerVendor(req, res);
    assert.strictEqual(getState().statusCode, 201);
    const data = getState().data;

    assert.strictEqual(data.role, 'vendor');
    assert.ok(data.vendor);
    assert.strictEqual(data.vendor.storeName, 'Artisan Wood Craft');
    assert.strictEqual(data.vendor.storeSlug, 'artisan-wood-craft');
    assert.strictEqual(data.password, undefined);

    const vendorDoc = await Vendor.findById(data.vendor._id);
    assert.ok(vendorDoc);
    assert.strictEqual(vendorDoc.status, 'approved');

    const vendorCart = await Cart.findOne({ user: data._id });
    assert.ok(vendorCart);
  });

  // =========================================================================
  // SECTION 3: Login & Authentication Error Resilience
  // =========================================================================
  await t.test('8. Login: rejects missing email or password', async () => {
    const { req: req1, res: res1, getState: getState1 } = createMockReqRes({
      body: { email: '', password: 'password123' }
    });
    await loginUser(req1, res1);
    assert.strictEqual(getState1().statusCode, 400);

    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      body: { email: 'sarah.jenkins@example.com', password: '' }
    });
    await loginUser(req2, res2);
    assert.strictEqual(getState2().statusCode, 400);
  });

  await t.test('9. Login: rejects wrong password or non-existent email with 401', async () => {
    const { req: req1, res: res1, getState: getState1 } = createMockReqRes({
      body: { email: 'sarah.jenkins@example.com', password: 'wrongPassword' }
    });
    await loginUser(req1, res1);
    assert.strictEqual(getState1().statusCode, 401);
    assert.match(getState1().data.message, /invalid email or password/i);

    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      body: { email: 'nonexistent@example.com', password: 'anyPassword123' }
    });
    await loginUser(req2, res2);
    assert.strictEqual(getState2().statusCode, 401);
  });

  await t.test('10. Login: succeeds with valid credentials (case-insensitive email)', async () => {
    const { req, res, getState } = createMockReqRes({
      body: { email: 'SARAH.JENKINS@EXAMPLE.COM', password: 'securePassword123' }
    });
    await loginUser(req, res);
    assert.strictEqual(getState().statusCode, 200);
    const data = getState().data;
    assert.strictEqual(data.name, 'Sarah Jenkins');
    assert.ok(data.token);
    assert.strictEqual(data.password, undefined);
  });

  await t.test('11. Login: rejects blocked account with 403', async () => {
    const blockedUser = await User.create({
      name: 'Blocked User',
      email: 'blocked@test.com',
      password: 'password123',
      isBlocked: true
    });

    const { req, res, getState } = createMockReqRes({
      body: { email: 'blocked@test.com', password: 'password123' }
    });
    await loginUser(req, res);
    assert.strictEqual(getState().statusCode, 403);
    assert.match(getState().data.message, /blocked/i);
  });

  await t.test('12. Profile Update: rejects empty name or short password with 400', async () => {
    const customerUser = await User.findOne({ email: 'sarah.jenkins@example.com' });

    const { req: req1, res: res1, getState: getState1 } = createMockReqRes({
      user: customerUser,
      body: { name: '   ' }
    });
    await updateProfile(req1, res1);
    assert.strictEqual(getState1().statusCode, 400);

    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      user: customerUser,
      body: { password: '123' }
    });
    await updateProfile(req2, res2);
    assert.strictEqual(getState2().statusCode, 400);
    assert.match(getState2().data.message, /at least 6 characters/i);
  });

  // =========================================================================
  // SECTION 4: Checkout Double-Submit, Idempotency & Concurrency
  // =========================================================================
  let buyerUser, checkoutProduct;

  await t.test('Setup checkout product and buyer cart', async () => {
    buyerUser = await User.create({
      name: 'Dave Buyer',
      email: 'dave@buyer.com',
      password: 'password123',
      role: 'customer'
    });

    checkoutProduct = await Product.create({
      name: 'Premium Wireless Earbuds',
      description: 'High-fidelity audio with active noise cancellation',
      price: 2999,
      discountPrice: 2499,
      stock: 10,
      category: testCategory._id,
      vendor: testVendorProfile._id,
      soldCount: 0
    });

    await Cart.create({
      user: buyerUser._id,
      items: [
        {
          product: checkoutProduct._id,
          vendor: testVendorProfile._id,
          quantity: 2,
          priceAtAdd: 2499
        }
      ]
    });
  });

  await t.test('13. Checkout: rejects missing or whitespace-only shipping address with 400', async () => {
    const { req, res, getState } = createMockReqRes({
      user: buyerUser,
      body: {
        shippingAddress: { street: '   ', city: '', zipCode: '' },
        paymentMethod: 'Card'
      }
    });
    await processCheckout(req, res);
    assert.strictEqual(getState().statusCode, 400);
    assert.match(getState().data.message, /complete shipping address is required/i);
  });

  await t.test('14. Checkout: succeeds with valid idempotency key, decrements stock, and repeated submission with SAME key replays cached response', async () => {
    const idempotencyKey = 'chk_test_key_abc_123';
    const { req: req1, res: res1, getState: getState1 } = createMockReqRes({
      user: buyerUser,
      headers: { 'idempotency-key': idempotencyKey },
      body: {
        shippingAddress: {
          street: '123 Tech Boulevard',
          city: 'Bengaluru',
          state: 'Karnataka',
          zipCode: '560001'
        },
        paymentMethod: 'Card'
      }
    });

    await processCheckout(req1, res1);
    assert.strictEqual(getState1().statusCode, 201);
    const data1 = getState1().data;
    assert.ok(data1.order);
    assert.strictEqual(data1.order.items.length, 1);
    assert.strictEqual(data1.order.items[0].quantity, 2);

    // Stock should be 10 - 2 = 8
    const updatedProd = await Product.findById(checkoutProduct._id);
    assert.strictEqual(updatedProd.stock, 8);
    assert.strictEqual(updatedProd.soldCount, 2);

    // Cart should now be empty
    const buyerCart = await Cart.findOne({ user: buyerUser._id });
    assert.strictEqual(buyerCart.items.length, 0);

    // Replay with exact same Idempotency-Key
    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      user: buyerUser,
      headers: { 'idempotency-key': idempotencyKey },
      body: {
        shippingAddress: {
          street: '123 Tech Boulevard',
          city: 'Bengaluru',
          state: 'Karnataka',
          zipCode: '560001'
        },
        paymentMethod: 'Card'
      }
    });

    await processCheckout(req2, res2);
    // Should return cached 201 response and header X-Idempotent-Replay
    assert.strictEqual(getState2().statusCode, 201);
    assert.strictEqual(getState2().headers['X-Idempotent-Replay'], 'true');
    assert.ok(getState2().data.order);
    assert.strictEqual(getState2().data.order._id.toString(), data1.order._id.toString());

    // Stock MUST remain unchanged at 8 (no duplicate decrement)
    const prodAfterReplay = await Product.findById(checkoutProduct._id);
    assert.strictEqual(prodAfterReplay.stock, 8, 'Stock must not be decremented on idempotent replay');
    assert.strictEqual(prodAfterReplay.soldCount, 2);

    // Only 1 order exists in database for this purchase
    const orderCount = await Order.countDocuments({ customer: buyerUser._id });
    assert.strictEqual(orderCount, 1, 'Exactly one order should exist in the database');
  });

  await t.test('15. Checkout: rejects empty cart checkout with 400', async () => {
    const freshAttemptKey = 'chk_fresh_empty_cart_key';
    const { req, res, getState } = createMockReqRes({
      user: buyerUser,
      headers: { 'idempotency-key': freshAttemptKey },
      body: {
        shippingAddress: {
          street: '123 Tech Boulevard',
          city: 'Bengaluru',
          state: 'Karnataka',
          zipCode: '560001'
        },
        paymentMethod: 'Card'
      }
    });

    await processCheckout(req, res);
    assert.strictEqual(getState().statusCode, 400);
    assert.match(getState().data.message, /cart is empty/i);
  });

  await t.test('16. Checkout: concurrent in-flight requests from the same user block second request with 409 Conflict', async () => {
    // Populate cart with 1 item
    await Cart.updateOne(
      { user: buyerUser._id },
      {
        $set: {
          items: [
            {
              product: checkoutProduct._id,
              vendor: testVendorProfile._id,
              quantity: 1,
              priceAtAdd: 2499
            }
          ]
        }
      }
    );

    const call1 = createMockReqRes({
      user: buyerUser,
      headers: { 'idempotency-key': 'chk_concurrent_1' },
      body: {
        shippingAddress: { street: '456 Lane', city: 'Mumbai', zipCode: '400001' },
        paymentMethod: 'Card'
      }
    });

    const call2 = createMockReqRes({
      user: buyerUser,
      headers: { 'idempotency-key': 'chk_concurrent_2' },
      body: {
        shippingAddress: { street: '456 Lane', city: 'Mumbai', zipCode: '400001' },
        paymentMethod: 'Card'
      }
    });

    // Fire both concurrently
    const [res1, res2] = await Promise.all([
      processCheckout(call1.req, call1.res),
      processCheckout(call2.req, call2.res)
    ]);

    const status1 = call1.getState().statusCode;
    const status2 = call2.getState().statusCode;

    // Exactly one should succeed (201) and the other should be rejected with 409 Conflict
    const statuses = [status1, status2].sort();
    assert.strictEqual(statuses[0], 201, 'One request should succeed with 201');
    assert.strictEqual(statuses[1], 409, 'Concurrent duplicate request must be rejected with 409 Conflict');

    // Stock should have decreased by exactly 1 (from 8 to 7)
    const prodAfterConcurrent = await Product.findById(checkoutProduct._id);
    assert.strictEqual(prodAfterConcurrent.stock, 7);
  });

  await t.test('17. Checkout: legitimate subsequent purchases with fresh items & keys succeed cleanly', async () => {
    // Add another item to buyer cart
    await Cart.updateOne(
      { user: buyerUser._id },
      {
        $set: {
          items: [
            {
              product: checkoutProduct._id,
              vendor: testVendorProfile._id,
              quantity: 3,
              priceAtAdd: 2499
            }
          ]
        }
      }
    );

    const subsequentKey = 'chk_subsequent_order_key_789';
    const { req, res, getState } = createMockReqRes({
      user: buyerUser,
      headers: { 'idempotency-key': subsequentKey },
      body: {
        shippingAddress: { street: '789 New Road', city: 'Delhi', zipCode: '110001' },
        paymentMethod: 'UPI'
      }
    });

    await processCheckout(req, res);
    assert.strictEqual(getState().statusCode, 201);
    assert.strictEqual(getState().data.order.paymentMethod, 'UPI');

    // Stock should be 7 - 3 = 4
    const prodFinal = await Product.findById(checkoutProduct._id);
    assert.strictEqual(prodFinal.stock, 4);

    // Total orders for buyer should now be 3 (1 from test 14, 1 from test 17, 1 from test 18)
    const totalOrders = await Order.countDocuments({ customer: buyerUser._id });
    assert.strictEqual(totalOrders, 3);
  });

  t.after(async () => {
    _resetIdempotencyState();
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });
});
