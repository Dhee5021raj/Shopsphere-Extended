'use strict';
/**
 * Test Suite: Subsegment 3.3 — Multi-Vendor Order Lifecycle State Machine Synchronization
 *
 * Verifies:
 *  1. All items Delivered: Parent orderStatus transitions to 'Delivered'.
 *  2. All items Cancelled: Parent orderStatus transitions to 'Cancelled'.
 *  3. Mixed item statuses:
 *     - 1 Processing, 1 Shipped: Parent remains 'Processing'.
 *     - 1 Shipped, 1 Delivered: Parent transitions to 'Shipped'.
 *     - All active items Delivered: Parent transitions to 'Delivered'.
 *  4. Multiple vendors: Independent updates synchronize the parent order safely.
 *  5. Partial cancellation: 1 item cancelled + 1 item delivered -> parent transitions to 'Delivered'.
 *  6. COD delivery & payment transition: When COD order reaches 'Delivered', paymentStatus becomes 'Paid'.
 *  7. Invalid transitions: Rejects invalid statuses, transitions from Cancelled/Delivered with 400.
 *  8. Inventory reconciliation regression: Cancelling an item restores stock without double-restoration.
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

const { updateVendorOrderItemStatus } = require('../controllers/vendorController');
const { updateOrderStatusAdmin } = require('../controllers/adminController');
const {
  computeParentOrderStatus,
  syncOrderLifecycle,
  validateItemStatusTransition
} = require('../services/orderLifecycleService');

// Helper to create mock Express req/res
function createMockReqRes({ user, params = {}, body = {} } = {}) {
  const req = { user, params, body };
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

test('Subsegment 3.3 — Unit: computeParentOrderStatus & validateItemStatusTransition logic', () => {
  // 1. All Cancelled
  assert.strictEqual(
    computeParentOrderStatus([
      { status: 'Cancelled' },
      { status: 'Cancelled' }
    ]),
    'Cancelled'
  );

  // 2. All Delivered
  assert.strictEqual(
    computeParentOrderStatus([
      { status: 'Delivered' },
      { status: 'Delivered' }
    ]),
    'Delivered'
  );

  // 3. 1 Cancelled, 1 Delivered -> All active are Delivered
  assert.strictEqual(
    computeParentOrderStatus([
      { status: 'Cancelled' },
      { status: 'Delivered' }
    ]),
    'Delivered'
  );

  // 4. 1 Shipped, 1 Delivered -> Active are Shipped/Delivered -> 'Shipped'
  assert.strictEqual(
    computeParentOrderStatus([
      { status: 'Shipped' },
      { status: 'Delivered' }
    ]),
    'Shipped'
  );

  // 5. 1 Processing, 1 Shipped -> 'Processing'
  assert.strictEqual(
    computeParentOrderStatus([
      { status: 'Processing' },
      { status: 'Shipped' }
    ]),
    'Processing'
  );

  // 6. Transition validation
  assert.strictEqual(validateItemStatusTransition('Processing', 'Shipped').allowed, true);
  assert.strictEqual(validateItemStatusTransition('Shipped', 'Delivered').allowed, true);
  assert.strictEqual(validateItemStatusTransition('Cancelled', 'Delivered').allowed, false);
  assert.strictEqual(validateItemStatusTransition('Delivered', 'Cancelled').allowed, false);
  assert.strictEqual(validateItemStatusTransition('Delivered', 'Processing').allowed, false);
  assert.strictEqual(validateItemStatusTransition('Processing', 'NonExistentStatus').allowed, false);
});

test('Subsegment 3.3 — Multi-Vendor Order Lifecycle State Machine Integration', async (t) => {
  let mongoServer;
  let customer, admin;
  let vendorUser1, vendorProfile1, prod1;
  let vendorUser2, vendorProfile2, prod2;
  let category;

  await t.test('Setup standalone MongoMemoryServer & seed entities', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    customer = await User.create({
      name: 'John Customer',
      email: 'john@test.com',
      password: 'password123',
      role: 'customer'
    });

    admin = await User.create({
      name: 'Site Admin',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin'
    });

    vendorUser1 = await User.create({
      name: 'Vendor One User',
      email: 'v1@test.com',
      password: 'password123',
      role: 'vendor'
    });

    vendorProfile1 = await Vendor.create({
      user: vendorUser1._id,
      storeName: 'Audio Hub',
      storeSlug: 'audio-hub',
      description: 'Headphones & Speakers',
      status: 'approved'
    });

    vendorUser2 = await User.create({
      name: 'Vendor Two User',
      email: 'v2@test.com',
      password: 'password123',
      role: 'vendor'
    });

    vendorProfile2 = await Vendor.create({
      user: vendorUser2._id,
      storeName: 'Book Barn',
      storeSlug: 'book-barn',
      description: 'Tech & Science Books',
      status: 'approved'
    });

    category = await Category.create({
      name: 'General',
      slug: 'general',
      image: 'https://example.com/cat.jpg'
    });

    prod1 = await Product.create({
      name: 'Wireless Earbuds',
      description: 'Noise cancelling',
      price: 3000,
      stock: 20,
      soldCount: 5,
      category: category._id,
      vendor: vendorProfile1._id,
      images: ['https://example.com/earbuds.jpg'],
      isActive: true
    });

    prod2 = await Product.create({
      name: 'Database Architecture Handbook',
      description: 'Systems design book',
      price: 1500,
      stock: 15,
      soldCount: 2,
      category: category._id,
      vendor: vendorProfile2._id,
      images: ['https://example.com/book.jpg'],
      isActive: true
    });
  });

  await t.test('1. Multi-Vendor multi-stage order progression (Processing -> Shipped -> Delivered)', async () => {
    // Create multi-vendor order with 1 item from vendor1 and 1 item from vendor2
    const order = await Order.create({
      customer: customer._id,
      items: [
        {
          product: prod1._id,
          vendor: vendorProfile1._id,
          name: prod1.name,
          quantity: 1,
          price: prod1.price,
          status: 'Processing'
        },
        {
          product: prod2._id,
          vendor: vendorProfile2._id,
          name: prod2.name,
          quantity: 1,
          price: prod2.price,
          status: 'Processing'
        }
      ],
      shippingAddress: { street: '12 Lake Rd', city: 'Kolkata', state: 'WB', zipCode: '700001' },
      totalAmount: 4500,
      paymentMethod: 'Card',
      paymentStatus: 'Paid',
      orderStatus: 'Processing'
    });

    const item1Id = order.items[0]._id;
    const item2Id = order.items[1]._id;

    // Step A: Vendor 1 marks item 1 as 'Shipped'. Item 2 is still 'Processing'.
    const { req: reqA, res: resA, getState: getStateA } = createMockReqRes({
      user: vendorUser1,
      params: { orderId: order._id, itemId: item1Id },
      body: { status: 'Shipped' }
    });
    await updateVendorOrderItemStatus(reqA, resA);
    assert.strictEqual(getStateA().statusCode, 200);

    const orderA = await Order.findById(order._id);
    assert.strictEqual(orderA.items.id(item1Id).status, 'Shipped');
    assert.strictEqual(orderA.items.id(item2Id).status, 'Processing');
    assert.strictEqual(orderA.orderStatus, 'Processing', 'Order remains Processing while any item is Processing');

    // Step B: Vendor 2 marks item 2 as 'Shipped'. Both items are now 'Shipped'.
    const { req: reqB, res: resB, getState: getStateB } = createMockReqRes({
      user: vendorUser2,
      params: { orderId: order._id, itemId: item2Id },
      body: { status: 'Shipped' }
    });
    await updateVendorOrderItemStatus(reqB, resB);
    assert.strictEqual(getStateB().statusCode, 200);

    const orderB = await Order.findById(order._id);
    assert.strictEqual(orderB.items.id(item2Id).status, 'Shipped');
    assert.strictEqual(orderB.orderStatus, 'Shipped', 'Order automatically transitions to Shipped when all items are Shipped');

    // Step C: Vendor 1 marks item 1 as 'Delivered'. Item 2 is still 'Shipped'.
    const { req: reqC, res: resC, getState: getStateC } = createMockReqRes({
      user: vendorUser1,
      params: { orderId: order._id, itemId: item1Id },
      body: { status: 'Delivered' }
    });
    await updateVendorOrderItemStatus(reqC, resC);
    assert.strictEqual(getStateC().statusCode, 200);

    const orderC = await Order.findById(order._id);
    assert.strictEqual(orderC.orderStatus, 'Shipped', 'Order remains Shipped until ALL items are Delivered');

    // Step D: Vendor 2 marks item 2 as 'Delivered'. Both items are now 'Delivered'.
    const { req: reqD, res: resD, getState: getStateD } = createMockReqRes({
      user: vendorUser2,
      params: { orderId: order._id, itemId: item2Id },
      body: { status: 'Delivered' }
    });
    await updateVendorOrderItemStatus(reqD, resD);
    assert.strictEqual(getStateD().statusCode, 200);

    const orderD = await Order.findById(order._id);
    assert.strictEqual(orderD.orderStatus, 'Delivered', 'Order automatically transitions to Delivered when all items Delivered');
  });

  await t.test('2. COD delivery transitions paymentStatus from "Pending" to "Paid"', async () => {
    // Create COD order
    const codOrder = await Order.create({
      customer: customer._id,
      items: [
        {
          product: prod1._id,
          vendor: vendorProfile1._id,
          name: prod1.name,
          quantity: 1,
          price: prod1.price,
          status: 'Shipped'
        }
      ],
      shippingAddress: { street: '55 Park Ave', city: 'Mumbai', state: 'MH', zipCode: '400001' },
      totalAmount: 3000,
      paymentMethod: 'COD',
      paymentStatus: 'Pending',
      orderStatus: 'Shipped'
    });

    const itemId = codOrder.items[0]._id;

    // Vendor marks item as Delivered
    const { req, res, getState } = createMockReqRes({
      user: vendorUser1,
      params: { orderId: codOrder._id, itemId },
      body: { status: 'Delivered' }
    });
    await updateVendorOrderItemStatus(req, res);
    assert.strictEqual(getState().statusCode, 200);

    const updatedCodOrder = await Order.findById(codOrder._id);
    assert.strictEqual(updatedCodOrder.orderStatus, 'Delivered', 'Parent orderStatus must be Delivered');
    assert.strictEqual(updatedCodOrder.paymentStatus, 'Paid', 'COD paymentStatus must automatically transition to Paid upon delivery');
  });

  await t.test('3. Partial cancellation: 1 item Cancelled + 1 item Delivered -> Order is Delivered', async () => {
    const startStock = (await Product.findById(prod1._id)).stock;

    const mixedOrder = await Order.create({
      customer: customer._id,
      items: [
        {
          product: prod1._id,
          vendor: vendorProfile1._id,
          name: prod1.name,
          quantity: 2,
          price: prod1.price,
          status: 'Processing'
        },
        {
          product: prod2._id,
          vendor: vendorProfile2._id,
          name: prod2.name,
          quantity: 1,
          price: prod2.price,
          status: 'Delivered'
        }
      ],
      shippingAddress: { street: '88 MG Rd', city: 'Bangalore', state: 'KA', zipCode: '560001' },
      totalAmount: 7500,
      paymentMethod: 'Card',
      paymentStatus: 'Paid',
      orderStatus: 'Processing'
    });

    const item1Id = mixedOrder.items[0]._id;

    // Vendor 1 cancels item 1 (which restores stock for prod1)
    const { req, res, getState } = createMockReqRes({
      user: vendorUser1,
      params: { orderId: mixedOrder._id, itemId: item1Id },
      body: { status: 'Cancelled' }
    });
    await updateVendorOrderItemStatus(req, res);
    assert.strictEqual(getState().statusCode, 200);

    const updatedOrder = await Order.findById(mixedOrder._id);
    assert.strictEqual(updatedOrder.items.id(item1Id).status, 'Cancelled');
    assert.strictEqual(updatedOrder.orderStatus, 'Delivered', 'Since item 1 was cancelled, all remaining active items are Delivered');

    // Verify prod1 inventory was restored
    const endStock = (await Product.findById(prod1._id)).stock;
    assert.strictEqual(endStock, startStock + 2, 'Stock for cancelled item must be restored');
  });

  await t.test('4. All items Cancelled: Order transitions to "Cancelled"', async () => {
    const cancelOrderDoc = await Order.create({
      customer: customer._id,
      items: [
        {
          product: prod1._id,
          vendor: vendorProfile1._id,
          name: prod1.name,
          quantity: 1,
          price: prod1.price,
          status: 'Processing'
        }
      ],
      shippingAddress: { street: '101 Bay View', city: 'Goa', state: 'GA', zipCode: '403001' },
      totalAmount: 3000,
      paymentMethod: 'Card',
      paymentStatus: 'Paid',
      orderStatus: 'Processing'
    });

    const itemId = cancelOrderDoc.items[0]._id;

    // Vendor cancels the sole item
    const { req, res, getState } = createMockReqRes({
      user: vendorUser1,
      params: { orderId: cancelOrderDoc._id, itemId },
      body: { status: 'Cancelled' }
    });
    await updateVendorOrderItemStatus(req, res);
    assert.strictEqual(getState().statusCode, 200);

    const updated = await Order.findById(cancelOrderDoc._id);
    assert.strictEqual(updated.orderStatus, 'Cancelled', 'When all items are cancelled, parent orderStatus becomes Cancelled');
  });

  await t.test('5. Invalid transition rejection: cannot update status of already Delivered or Cancelled items', async () => {
    const lockedOrder = await Order.create({
      customer: customer._id,
      items: [
        {
          product: prod1._id,
          vendor: vendorProfile1._id,
          name: prod1.name,
          quantity: 1,
          price: prod1.price,
          status: 'Delivered'
        }
      ],
      shippingAddress: { street: '200 Old Post', city: 'Shimla', state: 'HP', zipCode: '171001' },
      totalAmount: 3000,
      paymentMethod: 'Card',
      paymentStatus: 'Paid',
      orderStatus: 'Delivered'
    });

    const itemId = lockedOrder.items[0]._id;

    // Vendor tries to revert Delivered item to Processing
    const { req: req1, res: res1, getState: getState1 } = createMockReqRes({
      user: vendorUser1,
      params: { orderId: lockedOrder._id, itemId },
      body: { status: 'Processing' }
    });
    await updateVendorOrderItemStatus(req1, res1);
    assert.strictEqual(getState1().statusCode, 400, 'Reverting Delivered item must return 400');
    assert.match(getState1().data.message, /already delivered/i);

    // Vendor tries to pass unknown bogus status
    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      user: vendorUser1,
      params: { orderId: lockedOrder._id, itemId },
      body: { status: 'Teleported' }
    });
    await updateVendorOrderItemStatus(req2, res2);
    assert.strictEqual(getState2().statusCode, 400, 'Invalid status must return 400');
    assert.match(getState2().data.message, /invalid status/i);
  });

  await t.test('6. Admin status update integration: Admin setting Delivered synchronizes items and sets Paid', async () => {
    const adminTestOrder = await Order.create({
      customer: customer._id,
      items: [
        {
          product: prod1._id,
          vendor: vendorProfile1._id,
          name: prod1.name,
          quantity: 1,
          price: prod1.price,
          status: 'Processing'
        },
        {
          product: prod2._id,
          vendor: vendorProfile2._id,
          name: prod2.name,
          quantity: 1,
          price: prod2.price,
          status: 'Cancelled' // Pre-cancelled item
        }
      ],
      shippingAddress: { street: '300 Hill Road', city: 'Ooty', state: 'TN', zipCode: '643001' },
      totalAmount: 4500,
      paymentMethod: 'COD',
      paymentStatus: 'Pending',
      orderStatus: 'Processing'
    });

    // Admin updates order to Delivered
    const { req, res, getState } = createMockReqRes({
      user: admin,
      params: { id: adminTestOrder._id },
      body: { orderStatus: 'Delivered' }
    });
    await updateOrderStatusAdmin(req, res);
    assert.strictEqual(getState().statusCode, 200);

    const refreshed = await Order.findById(adminTestOrder._id);
    assert.strictEqual(refreshed.orderStatus, 'Delivered');
    assert.strictEqual(refreshed.paymentStatus, 'Paid', 'Admin setting Delivered marks COD as Paid');
    assert.strictEqual(refreshed.items[0].status, 'Delivered', 'Active item became Delivered');
    assert.strictEqual(refreshed.items[1].status, 'Cancelled', 'Pre-cancelled item remained Cancelled');
  });

  t.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });
});
