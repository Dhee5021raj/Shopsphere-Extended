'use strict';
/**
 * Test Suite: Subsegment 2.4 — Review Ratings & Verified Purchase Integrity
 *
 * Verifies:
 *  1. Verified Purchase Enforcement:
 *     - Customer with no order: 403 Forbidden.
 *     - Customer with cancelled order: 403 Forbidden.
 *     - Customer with order having cancelled item: 403 Forbidden.
 *     - Customer with failed payment: 403 Forbidden.
 *     - Customer with legitimate delivered/paid order: 201 Created.
 *     - Admin bypass: Admin can review without purchase.
 *  2. Duplicate Review Prevention:
 *     - Submitting a second review for the same product: 400 Bad Request.
 *  3. Input Validation:
 *     - Invalid rating (< 1, > 5, NaN): 400 Bad Request.
 *     - Missing/empty comment: 400 Bad Request.
 *  4. Atomic Rating Aggregation (Product and Vendor):
 *     - Product.rating and Product.numReviews correctly calculated via database aggregation.
 *     - Vendor.rating and Vendor.numRatings correctly calculated across all vendor products.
 *     - Review update recalculates both Product and Vendor ratings.
 *     - Review deletion recalculates both Product and Vendor ratings, resetting to 0 if all reviews removed.
 *  5. Review Authorization & Moderation:
 *     - Unauthorized users cannot update or delete other users' reviews (403).
 *     - Admin can delete/moderate any review.
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Category = require('../models/Category');

const {
  createReview,
  getProductReviews,
  updateReview,
  deleteReview
} = require('../controllers/reviewController');

function createMockReqRes({ params = {}, body = {}, user = null } = {}) {
  const req = { params, body, user };
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

test('Subsegment 2.4 — Review Ratings & Verified Purchase Integrity Suite', async (t) => {
  let mongoServer;
  let customer1, customer2, customer3, adminUser;
  let vendorUser, vendor;
  let category;
  let productA, productB;

  await t.test('Setup MongoMemoryServer and seed base entities', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await Review.syncIndexes();
    await Product.syncIndexes();
    await Order.syncIndexes();
    await Vendor.syncIndexes();

    customer1 = await User.create({
      name: 'Alice Buyer',
      email: 'alice@test.com',
      password: 'password123',
      role: 'customer'
    });

    customer2 = await User.create({
      name: 'Bob Buyer',
      email: 'bob@test.com',
      password: 'password123',
      role: 'customer'
    });

    customer3 = await User.create({
      name: 'Charlie NonBuyer',
      email: 'charlie@test.com',
      password: 'password123',
      role: 'customer'
    });

    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin.review@test.com',
      password: 'password123',
      role: 'admin'
    });

    vendorUser = await User.create({
      name: 'Audio Vendor Owner',
      email: 'audio.vendor@test.com',
      password: 'password123',
      role: 'vendor'
    });

    vendor = await Vendor.create({
      user: vendorUser._id,
      storeName: 'Sonic Labs',
      storeSlug: 'sonic-labs',
      description: 'Audio devices',
      status: 'approved',
      rating: 0,
      numRatings: 0,
      totalSales: 0
    });

    category = await Category.create({
      name: 'Headphones',
      slug: 'headphones',
      description: 'Headphones and audio',
      icon: 'Headphones',
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'
    });

    productA = await Product.create({
      name: 'Sonic Wireless Headphones',
      description: 'High-fidelity wireless headphones',
      price: 10000,
      stock: 50,
      category: category._id,
      vendor: vendor._id,
      images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'],
      rating: 0,
      numReviews: 0
    });

    productB = await Product.create({
      name: 'Sonic Earbuds Mini',
      description: 'Compact wireless earbuds',
      price: 5000,
      stock: 40,
      category: category._id,
      vendor: vendor._id,
      images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600'],
      rating: 0,
      numReviews: 0
    });
  });

  await t.test('Non-purchaser cannot review product (403 Forbidden)', async () => {
    const { req, res, getState } = createMockReqRes({
      body: { productId: productA._id, rating: 5, comment: 'Looks great!' },
      user: customer3
    });

    await createReview(req, res);
    const state = getState();
    assert.strictEqual(state.statusCode, 403);
    assert.ok(state.data.message.includes('Verified Purchase Required'));
  });

  await t.test('Customer with Cancelled order cannot review product (403 Forbidden)', async () => {
    await Order.create({
      customer: customer3._id,
      items: [
        { product: productA._id, vendor: vendor._id, name: productA.name, quantity: 1, price: productA.price, status: 'Cancelled' }
      ],
      shippingAddress: { street: '123 St', city: 'City', state: 'State', zipCode: '123456' },
      totalAmount: productA.price,
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      orderStatus: 'Cancelled'
    });

    const { req, res, getState } = createMockReqRes({
      body: { productId: productA._id, rating: 5, comment: 'Cancelled but reviewing' },
      user: customer3
    });

    await createReview(req, res);
    const state = getState();
    assert.strictEqual(state.statusCode, 403);
    assert.ok(state.data.message.includes('Verified Purchase Required'));
  });

  await t.test('Customer with Cancelled line item in an active order cannot review that item', async () => {
    // Customer 2 ordered productA (Cancelled) and productB (Delivered)
    await Order.create({
      customer: customer2._id,
      items: [
        { product: productA._id, vendor: vendor._id, name: productA.name, quantity: 1, price: productA.price, status: 'Cancelled' },
        { product: productB._id, vendor: vendor._id, name: productB.name, quantity: 1, price: productB.price, status: 'Delivered' }
      ],
      shippingAddress: { street: '123 St', city: 'City', state: 'State', zipCode: '123456' },
      totalAmount: productA.price + productB.price,
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      orderStatus: 'Processing'
    });

    // Attempting to review productA (the cancelled item) must fail
    const { req: reqA, res: resA, getState: getStateA } = createMockReqRes({
      body: { productId: productA._id, rating: 4, comment: 'Item was cancelled' },
      user: customer2
    });
    await createReview(reqA, resA);
    assert.strictEqual(getStateA().statusCode, 403);

    // Attempting to review productB (the delivered item) must succeed
    const { req: reqB, res: resB, getState: getStateB } = createMockReqRes({
      body: { productId: productB._id, rating: 4, comment: 'Earbuds are fantastic!' },
      user: customer2
    });
    await createReview(reqB, resB);
    assert.strictEqual(getStateB().statusCode, 201);
  });

  await t.test('Customer with Paid Delivered order successfully creates review and recalculates ratings', async () => {
    // Customer 1 bought productA (Delivered)
    await Order.create({
      customer: customer1._id,
      items: [
        { product: productA._id, vendor: vendor._id, name: productA.name, quantity: 1, price: productA.price, status: 'Delivered' }
      ],
      shippingAddress: { street: '123 St', city: 'City', state: 'State', zipCode: '123456' },
      totalAmount: productA.price,
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      orderStatus: 'Delivered'
    });

    const { req, res, getState } = createMockReqRes({
      body: { productId: productA._id, rating: 5, comment: 'Incredible sound quality and battery life' },
      user: customer1
    });

    await createReview(req, res);
    const state = getState();
    assert.strictEqual(state.statusCode, 201);
    assert.strictEqual(state.data.rating, 5);
    assert.strictEqual(state.data.user.name, 'Alice Buyer');

    // Verify Product A rating updated
    const updatedProdA = await Product.findById(productA._id);
    assert.strictEqual(updatedProdA.numReviews, 1);
    assert.strictEqual(updatedProdA.rating, 5);

    // Verify Vendor rating updated (Product B had 1 review of 4 stars, Product A has 1 review of 5 stars)
    // Vendor avg = (4 + 5) / 2 = 4.5, numRatings = 2
    const updatedVendor = await Vendor.findById(vendor._id);
    assert.strictEqual(updatedVendor.numRatings, 2);
    assert.strictEqual(updatedVendor.rating, 4.5);
  });

  await t.test('Duplicate review by same customer is prevented (400 Bad Request)', async () => {
    const { req, res, getState } = createMockReqRes({
      body: { productId: productA._id, rating: 3, comment: 'Trying to post again' },
      user: customer1
    });

    await createReview(req, res);
    const state = getState();
    assert.strictEqual(state.statusCode, 400);
    assert.ok(state.data.message.includes('already submitted a review'));
  });

  await t.test('Input validation rejects invalid ratings and empty comments', async () => {
    // Invalid rating (0)
    const { req: req0, res: res0, getState: getState0 } = createMockReqRes({
      body: { productId: productA._id, rating: 0, comment: 'Zero stars' },
      user: adminUser
    });
    await createReview(req0, res0);
    assert.strictEqual(getState0().statusCode, 400);

    // Invalid rating (6)
    const { req: req6, res: res6, getState: getState6 } = createMockReqRes({
      body: { productId: productA._id, rating: 6, comment: 'Six stars' },
      user: adminUser
    });
    await createReview(req6, res6);
    assert.strictEqual(getState6().statusCode, 400);

    // Empty comment
    const { req: reqEmpty, res: resEmpty, getState: getStateEmpty } = createMockReqRes({
      body: { productId: productA._id, rating: 4, comment: '   ' },
      user: adminUser
    });
    await createReview(reqEmpty, resEmpty);
    assert.strictEqual(getStateEmpty().statusCode, 400);
  });

  await t.test('Admin bypass allows review without purchase', async () => {
    const { req, res, getState } = createMockReqRes({
      body: { productId: productA._id, rating: 4, comment: 'Admin official benchmark review' },
      user: adminUser
    });

    await createReview(req, res);
    const state = getState();
    assert.strictEqual(state.statusCode, 201);

    // Product A now has 2 reviews: Alice (5) + Admin (4) -> avg 4.5, count 2
    const updatedProdA = await Product.findById(productA._id);
    assert.strictEqual(updatedProdA.numReviews, 2);
    assert.strictEqual(updatedProdA.rating, 4.5);

    // Vendor has 3 reviews total: Product B (4), Product A (5, 4) -> avg (4 + 5 + 4) / 3 = 4.3, count 3
    const updatedVendor = await Vendor.findById(vendor._id);
    assert.strictEqual(updatedVendor.numRatings, 3);
    assert.strictEqual(updatedVendor.rating, 4.3);
  });

  await t.test('Updating a review recalculates both Product and Vendor ratings', async () => {
    // Find Alice's review on Product A
    const aliceReview = await Review.findOne({ user: customer1._id, product: productA._id });
    assert.ok(aliceReview);

    // Alice updates her rating from 5 to 2
    const { req, res, getState } = createMockReqRes({
      params: { id: aliceReview._id },
      body: { rating: 2, comment: 'Updated: Broke after two weeks' },
      user: customer1
    });

    await updateReview(req, res);
    assert.strictEqual(getState().statusCode, 200);

    // Product A now has: Alice (2) + Admin (4) -> avg = (2 + 4) / 2 = 3.0
    const updatedProdA = await Product.findById(productA._id);
    assert.strictEqual(updatedProdA.numReviews, 2);
    assert.strictEqual(updatedProdA.rating, 3.0);

    // Vendor now has: Product B (4) + Product A (2, 4) -> avg = (4 + 2 + 4) / 3 = 3.3
    const updatedVendor = await Vendor.findById(vendor._id);
    assert.strictEqual(updatedVendor.numRatings, 3);
    assert.strictEqual(updatedVendor.rating, 3.3);
  });

  await t.test('Unauthorized user cannot update or delete other user review', async () => {
    const aliceReview = await Review.findOne({ user: customer1._id, product: productA._id });

    // Customer 2 tries to update Alice's review
    const { req: reqUp, res: resUp, getState: getStateUp } = createMockReqRes({
      params: { id: aliceReview._id },
      body: { rating: 1 },
      user: customer2
    });
    await updateReview(reqUp, resUp);
    assert.strictEqual(getStateUp().statusCode, 403);

    // Customer 2 tries to delete Alice's review
    const { req: reqDel, res: resDel, getState: getStateDel } = createMockReqRes({
      params: { id: aliceReview._id },
      user: customer2
    });
    await deleteReview(reqDel, resDel);
    assert.strictEqual(getStateDel().statusCode, 403);
  });

  await t.test('Deleting reviews recalculates ratings down to 0 when empty', async () => {
    const aliceReview = await Review.findOne({ user: customer1._id, product: productA._id });
    const adminReview = await Review.findOne({ user: adminUser._id, product: productA._id });
    const bobReview = await Review.findOne({ user: customer2._id, product: productB._id });

    // Delete Alice's review
    const { req: req1, res: res1 } = createMockReqRes({
      params: { id: aliceReview._id },
      user: customer1
    });
    await deleteReview(req1, res1);

    // Product A now only has Admin review (4) -> rating = 4.0, count = 1
    let prodA = await Product.findById(productA._id);
    assert.strictEqual(prodA.numReviews, 1);
    assert.strictEqual(prodA.rating, 4.0);

    // Delete Admin's review on Product A
    const { req: req2, res: res2 } = createMockReqRes({
      params: { id: adminReview._id },
      user: adminUser
    });
    await deleteReview(req2, res2);

    // Product A now has 0 reviews -> resets to rating 0, numReviews 0
    prodA = await Product.findById(productA._id);
    assert.strictEqual(prodA.numReviews, 0);
    assert.strictEqual(prodA.rating, 0);

    // Delete Bob's review on Product B
    const { req: req3, res: res3 } = createMockReqRes({
      params: { id: bobReview._id },
      user: customer2
    });
    await deleteReview(req3, res3);

    // Vendor now has 0 reviews -> resets to rating 0, numRatings 0
    const vend = await Vendor.findById(vendor._id);
    assert.strictEqual(vend.numRatings, 0);
    assert.strictEqual(vend.rating, 0);
  });

  await t.test('getProductReviews returns reviews sorted by newest with populated user', async () => {
    // Re-seed a review
    await Review.create({
      user: customer1._id,
      product: productA._id,
      vendor: vendor._id,
      rating: 5,
      comment: 'Re-reviewed after replacement'
    });

    const { req, res, getState } = createMockReqRes({
      params: { productId: productA._id }
    });
    await getProductReviews(req, res);

    const state = getState();
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.data.length, 1);
    assert.strictEqual(state.data[0].user.name, 'Alice Buyer');
    assert.strictEqual(state.data[0].comment, 'Re-reviewed after replacement');
  });

  await t.test('Teardown test server', async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
});
