'use strict';
/**
 * Test Suite: Marketplace Integrity & Privacy Hardening
 *
 * Regression coverage for the review-driven fixes:
 *  1. Vendor approval gates vendor-only routes (authorizeVendor).
 *  2. Mixed-status cancellation keeps shipped items and derives order status.
 *  3. Stock restoration is atomic with concurrent checkout decrements.
 *  4. Guest cart session IDs reject query operators.
 *  5. Cart quantities must be whole numbers.
 *  6. Text search ranks by relevance unless another sort is chosen.
 *  7. Admin status changes that items would override are rejected.
 *  8. Reviews require a DELIVERED line item.
 *  9. Public vendor endpoints never expose owner emails.
 * 10. Deleting a product removes its reviews and recomputes the vendor rating.
 * 11. Categories still referenced by products cannot be deleted.
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const Review = require('../models/Review');
const GuestCart = require('../models/GuestCart');

const inventoryService = require('../services/inventoryService');
const { authorizeVendor } = require('../middleware/authMiddleware');
const { addToCart, updateCartItem, syncGuestCart } = require('../controllers/cartController');
const { getProducts, deleteProduct } = require('../controllers/productController');
const { updateOrderStatusAdmin } = require('../controllers/adminController');
const { createReview } = require('../controllers/reviewController');
const { getVendors, getVendorStoreBySlug } = require('../controllers/vendorController');
const { deleteCategory } = require('../controllers/categoryController');

function call(handler, req) {
  const state = { statusCode: 200, data: null };
  const res = {
    status(code) { state.statusCode = code; return res; },
    json(data) { state.data = data; return res; }
  };
  return Promise.resolve(handler({ params: {}, body: {}, query: {}, headers: {}, ...req }, res)).then(() => state);
}

const ADDR = { street: '1 Test St', city: 'City', state: 'State', zipCode: '10001' };

test('Marketplace integrity & privacy hardening', async (t) => {
  let server;
  let customer, admin, vendorUser, vendor, category;

  const makeProduct = (overrides = {}) => Product.create({
    name: 'Item', description: 'An item', price: 100, stock: 10, soldCount: 5,
    category: category._id, vendor: vendor._id, images: ['i.jpg'], ...overrides
  });
  const makeOrder = (items, overrides = {}) => Order.create({
    customer: customer._id, shippingAddress: ADDR, totalAmount: 100, orderStatus: 'Processing',
    items: items.map((it) => ({ vendor: vendor._id, name: 'Item', quantity: 1, price: 100, ...it })),
    ...overrides
  });

  t.before(async () => {
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri());
    await Promise.all([Product.init(), Review.init(), GuestCart.init()]);
    customer = await User.create({ name: 'Cust', email: 'cust@test.com', password: 'secret12' });
    admin = await User.create({ name: 'Admin', email: 'admin@test.com', password: 'secret12', role: 'admin' });
    vendorUser = await User.create({ name: 'Vend', email: 'vend@test.com', password: 'secret12', role: 'vendor' });
    vendor = await Vendor.create({ user: vendorUser._id, storeName: 'Store', storeSlug: 'store', description: 'd', status: 'approved' });
    category = await Category.create({ name: 'Cat', slug: 'cat', description: 'd', image: 'i.jpg' });
  });

  t.after(async () => {
    inventoryService._resetCancellationLocks();
    await mongoose.disconnect();
    if (server) await server.stop();
  });

  await t.test('1. Rejected and pending vendors are blocked by authorizeVendor', async () => {
    for (const status of ['rejected', 'pending']) {
      await Vendor.updateOne({ _id: vendor._id }, { status });
      let passed = false;
      const state = await call((req, res) => authorizeVendor(req, res, () => { passed = true; }), { user: vendorUser });
      assert.strictEqual(passed, false, `${status} vendor must not pass`);
      assert.strictEqual(state.statusCode, 403);
    }
    await Vendor.updateOne({ _id: vendor._id }, { status: 'approved' });
    let passed = false;
    await call((req, res) => authorizeVendor(req, res, () => { passed = true; }), { user: vendorUser });
    assert.strictEqual(passed, true, 'approved vendor passes');
  });

  await t.test('2. Cancelling a partly shipped order cancels only unshipped items', async () => {
    const shipped = await makeProduct({ stock: 10 });
    const pending = await makeProduct({ stock: 10 });
    const order = await makeOrder([
      { product: shipped._id, quantity: 2, status: 'Shipped' },
      { product: pending._id, quantity: 2, status: 'Pending' }
    ], { paymentMethod: 'COD', paymentStatus: 'Pending' });

    const result = await inventoryService.cancelCustomerOrder({ orderId: order._id, userId: customer._id });
    assert.strictEqual(result.order.orderStatus, 'Shipped');
    assert.deepStrictEqual(result.order.items.map((i) => i.status), ['Shipped', 'Cancelled']);
    assert.strictEqual((await Product.findById(shipped._id)).stock, 10, 'shipped stock untouched');
    assert.strictEqual((await Product.findById(pending._id)).stock, 12, 'pending stock restored');

    const allShipped = await makeOrder([{ product: shipped._id, status: 'Shipped' }], { orderStatus: 'Shipped' });
    await assert.rejects(inventoryService.cancelAdminOrder({ orderId: allShipped._id }), /No cancellable items/);
  });

  await t.test('3. Stock restoration does not lose a concurrent checkout decrement', async () => {
    const product = await makeProduct({ stock: 20, soldCount: 10 });
    const order = await makeOrder([{ product: product._id, quantity: 3, status: 'Pending' }]);
    await Promise.all([
      inventoryService.cancelCustomerOrder({ orderId: order._id, userId: customer._id }),
      Product.updateOne({ _id: product._id }, { $inc: { stock: -1, soldCount: 1 } })
    ]);
    const after = await Product.findById(product._id);
    assert.strictEqual(after.stock, 22, '20 + 3 restored - 1 sold');
    assert.strictEqual(after.soldCount, 8, '10 - 3 + 1');
  });

  await t.test('4. Guest cart sync rejects operator-shaped session IDs', async () => {
    const product = await makeProduct();
    await GuestCart.create({ sessionId: 'victim-session', items: [{ product: product._id, vendor: vendor._id, quantity: 1, priceAtAdd: 100 }] });
    const state = await call(syncGuestCart, { body: { sessionId: { $ne: '' } }, user: customer });
    assert.strictEqual(state.statusCode, 400);
    assert.ok(await GuestCart.findOne({ sessionId: 'victim-session' }), 'victim cart untouched');
  });

  await t.test('5. Cart quantities must be whole numbers', async () => {
    const product = await makeProduct({ stock: 50 });
    const productId = product._id.toString();
    for (const quantity of [1.5, 0, -2, 'abc']) {
      const state = await call(addToCart, { body: { productId, quantity }, user: customer });
      assert.strictEqual(state.statusCode, 400, `quantity ${quantity} rejected`);
    }
    assert.strictEqual((await call(addToCart, { body: { productId, quantity: 2 }, user: customer })).statusCode, 200);
    assert.strictEqual((await call(updateCartItem, { body: { productId, quantity: 2.5 }, user: customer })).statusCode, 400);
    assert.strictEqual((await call(addToCart, { body: { productId: { $ne: null } }, user: customer })).statusCode, 400);
  });

  await t.test('6. Text search ranks by relevance by default', async () => {
    await makeProduct({ name: 'Zephyr Kettle', description: 'electric kettle' });
    await new Promise((r) => setTimeout(r, 15));
    await makeProduct({ name: 'Teapot', description: 'pairs well with a zephyr' }); // newer, weaker match
    const relevance = await call(getProducts, { query: { search: 'zephyr' } });
    assert.strictEqual(relevance.data.products[0].name, 'Zephyr Kettle');
    const newest = await call(getProducts, { query: { search: 'zephyr', sort: 'newest' } });
    assert.strictEqual(newest.data.products[0].name, 'Teapot');
  });

  await t.test('7. Admin status changes that items override are rejected', async () => {
    const product = await makeProduct();
    const order = await makeOrder([{ product: product._id, status: 'Shipped' }], { orderStatus: 'Shipped' });
    const noop = await call(updateOrderStatusAdmin, { params: { id: order._id.toString() }, body: { orderStatus: 'Processing' } });
    assert.strictEqual(noop.statusCode, 400);
    assert.strictEqual((await Order.findById(order._id)).orderStatus, 'Shipped');
    const delivered = await call(updateOrderStatusAdmin, { params: { id: order._id.toString() }, body: { orderStatus: 'Delivered' } });
    assert.strictEqual(delivered.statusCode, 200);
  });

  await t.test('8. Reviews require a delivered line item', async () => {
    const product = await makeProduct();
    const order = await makeOrder([{ product: product._id, status: 'Shipped' }], { orderStatus: 'Shipped' });
    const body = { productId: product._id, rating: 4, comment: 'Nice' };

    const early = await call(createReview, { body, user: customer });
    assert.strictEqual(early.statusCode, 403, 'shipped but not delivered cannot review');

    await Order.updateOne({ _id: order._id }, { $set: { 'items.0.status': 'Delivered', orderStatus: 'Delivered' } });
    const ok = await call(createReview, { body, user: customer });
    assert.strictEqual(ok.statusCode, 201);
  });

  await t.test('9. Public vendor endpoints do not expose owner emails', async () => {
    const list = await call(getVendors, {});
    assert.ok(list.data.length > 0);
    for (const v of list.data) assert.strictEqual(v.user.email, undefined);
    const store = await call(getVendorStoreBySlug, { params: { slug: 'store' } });
    assert.strictEqual(store.statusCode, 200);
    assert.strictEqual(store.data.vendor.user.email, undefined);
    assert.strictEqual(store.data.vendor.user.name, 'Vend');
  });

  await t.test('10. Deleting a product removes its reviews and recomputes the vendor rating', async () => {
    await Review.deleteMany({});
    const keep = await makeProduct();
    const drop = await makeProduct();
    await Review.create([
      { user: customer._id, product: keep._id, vendor: vendor._id, rating: 4, comment: 'ok' },
      { user: customer._id, product: drop._id, vendor: vendor._id, rating: 1, comment: 'bad' }
    ]);
    await Vendor.updateOne({ _id: vendor._id }, { rating: 2.5, numRatings: 2 });

    const state = await call(deleteProduct, { params: { id: drop._id.toString() }, user: admin });
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(await Review.countDocuments({ product: drop._id }), 0);
    const v = await Vendor.findById(vendor._id);
    assert.strictEqual(v.rating, 4);
    assert.strictEqual(v.numRatings, 1);
  });

  await t.test('11. Categories in use cannot be deleted; unused ones can', async () => {
    const used = await call(deleteCategory, { params: { id: category._id.toString() } });
    assert.strictEqual(used.statusCode, 409);
    assert.ok(await Category.findById(category._id));

    const empty = await Category.create({ name: 'Empty', slug: 'empty', description: 'd', image: 'i.jpg' });
    const removed = await call(deleteCategory, { params: { id: empty._id.toString() } });
    assert.strictEqual(removed.statusCode, 200);
    assert.strictEqual(await Category.findById(empty._id), null);
  });
});
