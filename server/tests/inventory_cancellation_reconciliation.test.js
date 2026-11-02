'use strict';
/**
 * Test Suite: Subsegment 1.2 — Inventory Stock Reconciliation on Order Cancellation
 *
 * Verifies:
 *  1. Customer whole-order cancellation restores exact quantity to Product.stock and decrements soldCount.
 *  2. Admin whole-order cancellation restores stock and decrements soldCount.
 *  3. Vendor single-item cancellation restores stock ONLY for that vendor's item in multi-vendor orders.
 *  4. Order automatically transitions to 'Cancelled' when all items are cancelled.
 *  5. Multi-vendor partial cancellation: cancelling an order after 1 item was cancelled does not double-restore.
 *  6. Idempotency: calling cancel on already cancelled order or item rejects with 400 and restores nothing.
 *  7. Cancellation rejected for Shipped or Delivered orders/items.
 *  8. Missing / deleted products are handled gracefully without throwing.
 *  9. Sold count lower bound: soldCount never drops below zero.
 * 10. Concurrency mutex serialization prevents simultaneous cancellation races.
 * 11. Standalone MongoDB compensating rollback reverts product stock if order save fails.
 * 12. Replica Set multi-document ACID transaction coordination.
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

const inventoryService = require('../services/inventoryService');
const { cancelOrder } = require('../controllers/orderController');
const { updateOrderStatusAdmin } = require('../controllers/adminController');
const { updateVendorOrderItemStatus } = require('../controllers/vendorController');

// Helper to create mock Express req/res
function createMockReqRes({ params = {}, body = {}, user = {} } = {}) {
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

test('Subsegment 1.2 — Standalone MongoDB Inventory Reconciliation Suite', async (t) => {
  let standaloneServer;
  let testCustomer;
  let testAdmin;
  let testVendorUser1, testVendor1;
  let testVendorUser2, testVendor2;
  let testCategory;

  await t.test('Setup standalone MongoMemoryServer and seed base entities', async () => {
    standaloneServer = await MongoMemoryServer.create();
    await mongoose.connect(standaloneServer.getUri());

    testCustomer = await User.create({
      name: 'Test Customer',
      email: 'customer@example.com',
      password: 'password123',
      role: 'customer'
    });

    testAdmin = await User.create({
      name: 'Test Admin',
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin'
    });

    testVendorUser1 = await User.create({
      name: 'Vendor One User',
      email: 'vendor1@example.com',
      password: 'password123',
      role: 'vendor'
    });
    testVendor1 = await Vendor.create({
      user: testVendorUser1._id,
      storeName: 'Vendor One Store',
      storeSlug: 'vendor-one',
      description: 'First vendor store',
      status: 'approved'
    });

    testVendorUser2 = await User.create({
      name: 'Vendor Two User',
      email: 'vendor2@example.com',
      password: 'password123',
      role: 'vendor'
    });
    testVendor2 = await Vendor.create({
      user: testVendorUser2._id,
      storeName: 'Vendor Two Store',
      storeSlug: 'vendor-two',
      description: 'Second vendor store',
      status: 'approved'
    });

    testCategory = await Category.create({
      name: 'Electronics',
      slug: 'electronics',
      image: 'electronics.jpg'
    });
  });

  t.afterEach(() => {
    inventoryService._resetCancellationLocks();
  });

  await t.test('1. Customer whole-order cancellation restores exact quantity & decrements soldCount', async () => {
    const prod1 = await Product.create({
      name: 'Keyboard',
      description: 'Mechanical keyboard',
      price: 100,
      stock: 10,
      soldCount: 5,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['img1.jpg']
    });

    const prod2 = await Product.create({
      name: 'Mouse',
      description: 'Gaming mouse',
      price: 50,
      stock: 20,
      soldCount: 10,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['img2.jpg']
    });

    const order = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prod1._id,
          vendor: testVendor1._id,
          name: prod1.name,
          quantity: 3,
          price: 100,
          status: 'Pending'
        },
        {
          product: prod2._id,
          vendor: testVendor1._id,
          name: prod2.name,
          quantity: 4,
          price: 50,
          status: 'Pending'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 500,
      orderStatus: 'Processing'
    });

    const { req, res, getState } = createMockReqRes({
      params: { id: order._id.toString() },
      user: { _id: testCustomer._id, role: 'customer' }
    });

    await cancelOrder(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 200, `Expected 200 but got ${state.statusCode}: ${state.data?.message}`);
    assert.strictEqual(state.data.order.orderStatus, 'Cancelled');
    assert.strictEqual(state.data.executionMode, 'COMMITTED_STANDALONE_SEQUENTIAL');

    // Verify database updates for Product 1
    const updatedProd1 = await Product.findById(prod1._id);
    assert.strictEqual(updatedProd1.stock, 13, 'Product 1 stock must be 10 + 3 = 13');
    assert.strictEqual(updatedProd1.soldCount, 2, 'Product 1 soldCount must be 5 - 3 = 2');

    // Verify database updates for Product 2
    const updatedProd2 = await Product.findById(prod2._id);
    assert.strictEqual(updatedProd2.stock, 24, 'Product 2 stock must be 20 + 4 = 24');
    assert.strictEqual(updatedProd2.soldCount, 6, 'Product 2 soldCount must be 10 - 4 = 6');

    // Verify order items are all cancelled
    const updatedOrder = await Order.findById(order._id);
    assert.strictEqual(updatedOrder.orderStatus, 'Cancelled');
    assert.ok(updatedOrder.items.every(i => i.status === 'Cancelled'), 'All order items must be Cancelled');
  });

  await t.test('2. Customer cannot cancel an already Cancelled order (Idempotency guarantee)', async () => {
    const prod = await Product.create({
      name: 'Headphones',
      description: 'Noise cancelling',
      price: 200,
      stock: 15,
      soldCount: 5,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['img.jpg']
    });

    const order = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prod._id,
          vendor: testVendor1._id,
          name: prod.name,
          quantity: 2,
          price: 200,
          status: 'Cancelled'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 400,
      orderStatus: 'Cancelled'
    });

    const { req, res, getState } = createMockReqRes({
      params: { id: order._id.toString() },
      user: { _id: testCustomer._id, role: 'customer' }
    });

    await cancelOrder(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 400, 'Must reject already cancelled order with 400');
    assert.match(state.data.message, /already Cancelled/i);

    // Stock must remain untouched
    const currentProd = await Product.findById(prod._id);
    assert.strictEqual(currentProd.stock, 15, 'Stock must not be restored again');
    assert.strictEqual(currentProd.soldCount, 5, 'SoldCount must not be changed');
  });

  await t.test('3. Customer cannot cancel Shipped or Delivered order', async () => {
    const prod = await Product.create({
      name: 'Smart Watch',
      description: 'Fitness tracker',
      price: 150,
      stock: 10,
      soldCount: 3,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['img.jpg']
    });

    const shippedOrder = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prod._id,
          vendor: testVendor1._id,
          name: prod.name,
          quantity: 1,
          price: 150,
          status: 'Shipped'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 150,
      orderStatus: 'Shipped'
    });

    const { req, res, getState } = createMockReqRes({
      params: { id: shippedOrder._id.toString() },
      user: { _id: testCustomer._id, role: 'customer' }
    });

    await cancelOrder(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 400);
    assert.match(state.data.message, /already Shipped/i);

    const checkProd = await Product.findById(prod._id);
    assert.strictEqual(checkProd.stock, 10, 'Stock must not change');
  });

  await t.test('4. Admin whole-order cancellation restores stock and updates status', async () => {
    const prod = await Product.create({
      name: 'Tablet',
      description: 'Android tablet',
      price: 300,
      stock: 5,
      soldCount: 8,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['img.jpg']
    });

    const order = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prod._id,
          vendor: testVendor1._id,
          name: prod.name,
          quantity: 2,
          price: 300,
          status: 'Confirmed'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 600,
      orderStatus: 'Processing'
    });

    const { req, res, getState } = createMockReqRes({
      params: { id: order._id.toString() },
      body: { orderStatus: 'Cancelled' },
      user: { _id: testAdmin._id, role: 'admin' }
    });

    await updateOrderStatusAdmin(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.data.order.orderStatus, 'Cancelled');

    const updatedProd = await Product.findById(prod._id);
    assert.strictEqual(updatedProd.stock, 7, 'Stock must be 5 + 2 = 7');
    assert.strictEqual(updatedProd.soldCount, 6, 'SoldCount must be 8 - 2 = 6');

    // Admin cannot change status of cancelled order
    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      params: { id: order._id.toString() },
      body: { orderStatus: 'Delivered' },
      user: { _id: testAdmin._id, role: 'admin' }
    });

    await updateOrderStatusAdmin(req2, res2);
    assert.strictEqual(getState2().statusCode, 400);
    assert.match(getState2().data.message, /already Cancelled/i);
  });

  await t.test('5. Multi-vendor order: Vendor item cancellation restores ONLY that vendor item', async () => {
    const prodVendor1 = await Product.create({
      name: 'Vendor 1 Item',
      description: 'Vendor 1 product',
      price: 50,
      stock: 8,
      soldCount: 2,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['v1.jpg']
    });

    const prodVendor2 = await Product.create({
      name: 'Vendor 2 Item',
      description: 'Vendor 2 product',
      price: 75,
      stock: 15,
      soldCount: 4,
      category: testCategory._id,
      vendor: testVendor2._id,
      images: ['v2.jpg']
    });

    const multiVendorOrder = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prodVendor1._id,
          vendor: testVendor1._id,
          name: prodVendor1.name,
          quantity: 2,
          price: 50,
          status: 'Pending'
        },
        {
          product: prodVendor2._id,
          vendor: testVendor2._id,
          name: prodVendor2.name,
          quantity: 4,
          price: 75,
          status: 'Pending'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 400,
      orderStatus: 'Processing'
    });

    const item1Id = multiVendorOrder.items[0]._id.toString();
    const item2Id = multiVendorOrder.items[1]._id.toString();

    // Vendor 1 cancels their own item
    const { req, res, getState } = createMockReqRes({
      params: { orderId: multiVendorOrder._id.toString(), itemId: item1Id },
      body: { status: 'Cancelled' },
      user: { _id: testVendorUser1._id, role: 'vendor' }
    });

    await updateVendorOrderItemStatus(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.data.item.status, 'Cancelled');

    // Vendor 1 Product must be restored
    const updatedProd1 = await Product.findById(prodVendor1._id);
    assert.strictEqual(updatedProd1.stock, 10, 'Vendor 1 stock must be 8 + 2 = 10');
    assert.strictEqual(updatedProd1.soldCount, 0, 'Vendor 1 soldCount must be 2 - 2 = 0');

    // Vendor 2 Product must be UNTOUCHED!
    const updatedProd2 = await Product.findById(prodVendor2._id);
    assert.strictEqual(updatedProd2.stock, 15, 'Vendor 2 stock must still be 15');
    assert.strictEqual(updatedProd2.soldCount, 4, 'Vendor 2 soldCount must still be 4');

    // Order must NOT be Cancelled yet because Item 2 is still active
    const checkOrder = await Order.findById(multiVendorOrder._id);
    assert.strictEqual(checkOrder.orderStatus, 'Processing');
    assert.strictEqual(checkOrder.items[0].status, 'Cancelled');
    assert.strictEqual(checkOrder.items[1].status, 'Pending');

    // 6. Vendor 2 cancels their item -> entire order automatically transitions to Cancelled
    const { req: req2, res: res2, getState: getState2 } = createMockReqRes({
      params: { orderId: multiVendorOrder._id.toString(), itemId: item2Id },
      body: { status: 'Cancelled' },
      user: { _id: testVendorUser2._id, role: 'vendor' }
    });

    await updateVendorOrderItemStatus(req2, res2);
    assert.strictEqual(getState2().statusCode, 200);

    const finalProd2 = await Product.findById(prodVendor2._id);
    assert.strictEqual(finalProd2.stock, 19, 'Vendor 2 stock must be 15 + 4 = 19');
    assert.strictEqual(finalProd2.soldCount, 0, 'Vendor 2 soldCount must be 4 - 4 = 0');

    const finalOrder = await Order.findById(multiVendorOrder._id);
    assert.strictEqual(finalOrder.orderStatus, 'Cancelled', 'Order must automatically transition to Cancelled');
  });

  await t.test('7. Customer order cancellation after partial vendor cancellation (No double-restoration)', async () => {
    const prodA = await Product.create({
      name: 'Item A',
      description: 'Vendor A item',
      price: 20,
      stock: 10,
      soldCount: 3,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['a.jpg']
    });

    const prodB = await Product.create({
      name: 'Item B',
      description: 'Vendor B item',
      price: 30,
      stock: 20,
      soldCount: 5,
      category: testCategory._id,
      vendor: testVendor2._id,
      images: ['b.jpg']
    });

    const order = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prodA._id,
          vendor: testVendor1._id,
          name: prodA.name,
          quantity: 3,
          price: 20,
          status: 'Pending'
        },
        {
          product: prodB._id,
          vendor: testVendor2._id,
          name: prodB.name,
          quantity: 2,
          price: 30,
          status: 'Pending'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 120,
      orderStatus: 'Processing'
    });

    const itemAId = order.items[0]._id.toString();

    // Step 1: Vendor 1 cancels Item A first
    const { req: vReq, res: vRes, getState: vState } = createMockReqRes({
      params: { orderId: order._id.toString(), itemId: itemAId },
      body: { status: 'Cancelled' },
      user: { _id: testVendorUser1._id, role: 'vendor' }
    });
    await updateVendorOrderItemStatus(vReq, vRes);
    assert.strictEqual(vState().statusCode, 200);

    const prodAAfterV1 = await Product.findById(prodA._id);
    assert.strictEqual(prodAAfterV1.stock, 13, 'Product A stock restored to 10 + 3 = 13');
    assert.strictEqual(prodAAfterV1.soldCount, 0, 'Product A soldCount reduced to 0');

    // Step 2: Customer cancels the entire order
    const { req: cReq, res: cRes, getState: cState } = createMockReqRes({
      params: { id: order._id.toString() },
      user: { _id: testCustomer._id, role: 'customer' }
    });
    await cancelOrder(cReq, cRes);
    assert.strictEqual(cState().statusCode, 200);

    // CRITICAL ASSERTION: Product A must NOT be restored a second time!
    const prodAFinal = await Product.findById(prodA._id);
    assert.strictEqual(prodAFinal.stock, 13, 'Product A stock must remain 13, NOT 16!');
    assert.strictEqual(prodAFinal.soldCount, 0, 'Product A soldCount must remain 0');

    // Product B must be restored exactly once
    const prodBFinal = await Product.findById(prodB._id);
    assert.strictEqual(prodBFinal.stock, 22, 'Product B stock restored to 20 + 2 = 22');
    assert.strictEqual(prodBFinal.soldCount, 3, 'Product B soldCount reduced to 5 - 2 = 3');
  });

  await t.test('8. Missing / deleted product handled gracefully without crashing', async () => {
    const validProd = await Product.create({
      name: 'Surviving Product',
      description: 'Still exists',
      price: 40,
      stock: 5,
      soldCount: 2,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['s.jpg']
    });

    const deletedProdId = new mongoose.Types.ObjectId();

    const order = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: validProd._id,
          vendor: testVendor1._id,
          name: validProd.name,
          quantity: 2,
          price: 40,
          status: 'Pending'
        },
        {
          product: deletedProdId, // Deleted from DB
          vendor: testVendor1._id,
          name: 'Ghost Product',
          quantity: 1,
          price: 99,
          status: 'Pending'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 179,
      orderStatus: 'Pending'
    });

    const { req, res, getState } = createMockReqRes({
      params: { id: order._id.toString() },
      user: { _id: testCustomer._id, role: 'customer' }
    });

    // Must not throw or crash
    await cancelOrder(req, res);
    assert.strictEqual(getState().statusCode, 200);

    const updatedValid = await Product.findById(validProd._id);
    assert.strictEqual(updatedValid.stock, 7, 'Valid product stock must still be restored (5 + 2 = 7)');
    assert.strictEqual(updatedValid.soldCount, 0, 'Valid product soldCount must be 0');

    const updatedOrder = await Order.findById(order._id);
    assert.strictEqual(updatedOrder.orderStatus, 'Cancelled');
  });

  await t.test('9. Sold count lower bound: soldCount never drops below zero', async () => {
    const prod = await Product.create({
      name: 'Low Sold Count Item',
      description: 'Desc',
      price: 25,
      stock: 10,
      soldCount: 1, // Only 1 sold
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['l.jpg']
    });

    const order = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prod._id,
          vendor: testVendor1._id,
          name: prod.name,
          quantity: 3, // Cancel 3 items
          price: 25,
          status: 'Pending'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 75,
      orderStatus: 'Pending'
    });

    const { req, res, getState } = createMockReqRes({
      params: { id: order._id.toString() },
      user: { _id: testCustomer._id, role: 'customer' }
    });

    await cancelOrder(req, res);
    assert.strictEqual(getState().statusCode, 200);

    const updatedProd = await Product.findById(prod._id);
    assert.strictEqual(updatedProd.stock, 13, 'Stock must be 10 + 3 = 13');
    assert.strictEqual(updatedProd.soldCount, 0, 'SoldCount must clamp to 0 and never be negative');
  });

  await t.test('10. Concurrency mutex serialization prevents simultaneous cancellation races', async () => {
    const prod = await Product.create({
      name: 'Contended Item',
      description: 'Concurrent cancel test',
      price: 100,
      stock: 50,
      soldCount: 10,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['c.jpg']
    });

    const order = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prod._id,
          vendor: testVendor1._id,
          name: prod.name,
          quantity: 5,
          price: 100,
          status: 'Pending'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 500,
      orderStatus: 'Pending'
    });

    const orderId = order._id.toString();

    // Fire two concurrent cancellations simultaneously
    const call1 = inventoryService.cancelCustomerOrder({ orderId, userId: testCustomer._id });
    const call2 = inventoryService.cancelCustomerOrder({ orderId, userId: testCustomer._id });

    const results = await Promise.allSettled([call1, call2]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // Exactly one should succeed, and the second should be rejected due to 409 conflict
    assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent cancellation must succeed');
    assert.strictEqual(rejected.length, 1, 'Concurrent collision must be safely rejected');
    assert.strictEqual(rejected[0].reason.statusCode, 409);
    assert.match(rejected[0].reason.message, /already in progress/i);

    // Stock must have increased by 5, NOT 10!
    const finalProd = await Product.findById(prod._id);
    assert.strictEqual(finalProd.stock, 55, 'Stock must only be incremented once (50 + 5 = 55)');
    assert.strictEqual(finalProd.soldCount, 5, 'SoldCount must only be decremented once (10 - 5 = 5)');
  });

  await t.test('11. Standalone MongoDB compensating rollback reverts product stock if order save fails', async () => {
    const prod = await Product.create({
      name: 'Rollback Test Item',
      description: 'Rollback verification',
      price: 80,
      stock: 20,
      soldCount: 10,
      category: testCategory._id,
      vendor: testVendor1._id,
      images: ['r.jpg']
    });

    const order = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prod._id,
          vendor: testVendor1._id,
          name: prod.name,
          quantity: 5,
          price: 80,
          status: 'Pending'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 400,
      orderStatus: 'Pending'
    });

    // Monkey-patch Order.prototype.save to simulate DB crash during order update
    const origOrderSave = Order.prototype.save;
    Order.prototype.save = async function () {
      throw new Error('SIMULATED_DB_WRITE_FAILURE: Disk I/O fault');
    };

    try {
      await assert.rejects(
        inventoryService.cancelCustomerOrder({
          orderId: order._id.toString(),
          userId: testCustomer._id
        }),
        /SIMULATED_DB_WRITE_FAILURE/
      );

      // Verify that compensating rollback restored Product stock and soldCount to original values!
      const rolledBackProd = await Product.findById(prod._id);
      assert.strictEqual(rolledBackProd.stock, 20, 'Compensating rollback must revert stock back to 20');
      assert.strictEqual(rolledBackProd.soldCount, 10, 'Compensating rollback must revert soldCount back to 10');
    } finally {
      Order.prototype.save = origOrderSave;
    }
  });

  await t.test('Teardown standalone server', async () => {
    await mongoose.disconnect();
    await standaloneServer.stop();
  });
});

test('Subsegment 1.2 — Replica Set ACID Transaction Coordination Suite', async (t) => {
  let replSet;
  let testCustomer;
  let testVendorUser, testVendor;
  let testCategory;

  await t.test('Setup MongoMemoryReplSet (Replica Set mode)', async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());

    testCustomer = await User.create({
      name: 'ReplSet Customer',
      email: 'repl_customer@example.com',
      password: 'password123',
      role: 'customer'
    });

    testVendorUser = await User.create({
      name: 'ReplSet Vendor User',
      email: 'repl_vendor@example.com',
      password: 'password123',
      role: 'vendor'
    });
    testVendor = await Vendor.create({
      user: testVendorUser._id,
      storeName: 'ReplSet Vendor Store',
      storeSlug: 'replset-vendor',
      description: 'ReplSet vendor store description',
      status: 'approved'
    });

    testCategory = await Category.create({
      name: 'ReplSet Category',
      slug: 'replset-cat',
      image: 'replset-cat.jpg'
    });
  });

  t.afterEach(() => {
    inventoryService._resetCancellationLocks();
  });

  await t.test('Replica set customer cancellation executes within ACID transaction', async () => {
    const prod = await Product.create({
      name: 'ACID Item',
      description: 'Transaction test item',
      price: 120,
      stock: 14,
      soldCount: 6,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['acid.jpg']
    });

    const order = await Order.create({
      customer: testCustomer._id,
      items: [
        {
          product: prod._id,
          vendor: testVendor._id,
          name: prod.name,
          quantity: 4,
          price: 120,
          status: 'Pending'
        }
      ],
      shippingAddress: { street: '123 Main St', city: 'City', state: 'State', zipCode: '12345' },
      totalAmount: 480,
      orderStatus: 'Pending'
    });

    const result = await inventoryService.cancelCustomerOrder({
      orderId: order._id.toString(),
      userId: testCustomer._id
    });

    assert.strictEqual(result.executionMode, 'COMMITTED_REPLICA_SET_ACID');
    assert.strictEqual(result.order.orderStatus, 'Cancelled');

    const updatedProd = await Product.findById(prod._id);
    assert.strictEqual(updatedProd.stock, 18, 'Stock must be 14 + 4 = 18');
    assert.strictEqual(updatedProd.soldCount, 2, 'SoldCount must be 6 - 4 = 2');
  });

  await t.test('Teardown replica set', async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });
});
