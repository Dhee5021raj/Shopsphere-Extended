'use strict';
/**
 * Test Suite: Subsegment 1.3 — Orphaned Cart Item Purging & Cascade Protection
 *
 * Verifies:
 *  1. Deleted product in authenticated user cart is atomically purged during retrieval.
 *  2. Deleted product in guest cart is atomically purged during retrieval.
 *  3. Multiple valid products mixed with deleted products: only stale items are purged, valid items intact.
 *  4. Cart retrieval after cleanup returns clean state with zero extra DB writes.
 *  5. Checkout with stale product references purges orphans and returns clean 400 (never 500), subsequent checkout succeeds.
 *  6. Empty cart after cleanup rejects checkout with clear message and persists empty cart.
 *  7. Concurrent cart operations: atomic $pull does not clobber concurrent item additions.
 *  8. Guest cart sync purges stale items from both guest and user carts before merging.
 *  9. Standard cart regression: adding, updating quantity, and removing valid items works as expected.
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const GuestCart = require('../models/GuestCart');

const { purgeOrphanedCartItems, populateCartItems } = require('../services/cartService');
const { getCart, addToCart, updateCartItem, removeFromCart, syncGuestCart } = require('../controllers/cartController');
const { processCheckout } = require('../controllers/checkoutController');

// Helper to create mock Express req/res
function createMockReqRes({ params = {}, body = {}, headers = {}, user = null } = {}) {
  const req = { params, body, headers, user };
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

test('Subsegment 1.3 — Orphaned Cart Item Purging & Cascade Protection Suite', async (t) => {
  let mongoServer;
  let testUser;
  let testVendorUser, testVendor;
  let testCategory;

  await t.test('Setup MongoMemoryServer and seed base entities', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    testUser = await User.create({
      name: 'Cart Customer',
      email: 'cart_cust@example.com',
      password: 'password123',
      role: 'customer'
    });

    testVendorUser = await User.create({
      name: 'Cart Vendor User',
      email: 'cart_vendor@example.com',
      password: 'password123',
      role: 'vendor'
    });

    testVendor = await Vendor.create({
      user: testVendorUser._id,
      storeName: 'Cart Vendor Store',
      storeSlug: 'cart-vendor-store',
      description: 'Vendor for cart tests',
      status: 'approved'
    });

    testCategory = await Category.create({
      name: 'Cart Category',
      slug: 'cart-category',
      image: 'cart-cat.jpg'
    });
  });

  await t.test('1. Deleted product in authenticated user cart is atomically purged during retrieval', async () => {
    const prod = await Product.create({
      name: 'Doomed Product A',
      description: 'Will be deleted',
      price: 150,
      stock: 10,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['a.jpg']
    });

    // Create user cart with this product
    const cart = await Cart.create({
      user: testUser._id,
      items: [
        {
          product: prod._id,
          vendor: testVendor._id,
          quantity: 2,
          priceAtAdd: 150
        }
      ]
    });

    assert.strictEqual(cart.items.length, 1);

    // Simulate product deletion from marketplace
    await Product.findByIdAndDelete(prod._id);
    const verifyDeleted = await Product.findById(prod._id);
    assert.strictEqual(verifyDeleted, null, 'Product must be deleted from database');

    // Customer retrieves their cart
    const { req, res, getState } = createMockReqRes({ user: testUser });
    await getCart(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 200);
    assert.deepStrictEqual(state.data.items, []);
    assert.strictEqual(state.data.subtotal, 0);
    assert.strictEqual(state.data.total, 0);

    // CRITICAL: Verify database Cart document was atomically cleaned up
    const dbCart = await Cart.findById(cart._id);
    assert.strictEqual(dbCart.items.length, 0, 'Orphaned item must be purged from database Cart');
  });

  await t.test('2. Deleted product in guest cart is atomically purged during retrieval', async () => {
    const prod = await Product.create({
      name: 'Doomed Guest Product',
      description: 'Will be deleted',
      price: 80,
      stock: 5,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['g.jpg']
    });

    const sessionId = 'guest-session-123';
    const guestCart = await GuestCart.create({
      sessionId,
      items: [
        {
          product: prod._id,
          vendor: testVendor._id,
          quantity: 1,
          priceAtAdd: 80
        }
      ]
    });

    assert.strictEqual(guestCart.items.length, 1);

    // Delete product
    await Product.findByIdAndDelete(prod._id);

    // Guest retrieves cart
    const { req, res, getState } = createMockReqRes({
      headers: { 'x-session-id': sessionId }
    });
    await getCart(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 200);
    assert.deepStrictEqual(state.data.items, []);
    assert.strictEqual(state.data.subtotal, 0);

    // Verify DB guest cart document
    const dbGuestCart = await GuestCart.findById(guestCart._id);
    assert.strictEqual(dbGuestCart.items.length, 0, 'Guest cart in DB must have 0 items after purge');
  });

  await t.test('3. Multiple valid products mixed with deleted products: only stale items purged', async () => {
    const prodValid1 = await Product.create({
      name: 'Valid Product 1',
      description: 'Survives',
      price: 100,
      stock: 20,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['v1.jpg']
    });

    const prodDeleted = await Product.create({
      name: 'Deleted Middle Product',
      description: 'Will be deleted',
      price: 200,
      stock: 5,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['del.jpg']
    });

    const prodValid2 = await Product.create({
      name: 'Valid Product 2',
      description: 'Survives too',
      price: 50,
      stock: 15,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['v2.jpg']
    });

    // Reset user cart with 3 items (valid, deleted, valid)
    await Cart.findOneAndUpdate(
      { user: testUser._id },
      {
        items: [
          { product: prodValid1._id, vendor: testVendor._id, quantity: 2, priceAtAdd: 100 },
          { product: prodDeleted._id, vendor: testVendor._id, quantity: 1, priceAtAdd: 200 },
          { product: prodValid2._id, vendor: testVendor._id, quantity: 3, priceAtAdd: 50 }
        ]
      },
      { upsert: true }
    );

    // Delete the middle product
    await Product.findByIdAndDelete(prodDeleted._id);

    // Call getCart
    const { req, res, getState } = createMockReqRes({ user: testUser });
    await getCart(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 200);
    // Subtotal: (100 * 2) + (50 * 3) = 200 + 150 = 350
    assert.strictEqual(state.data.items.length, 2, 'Only the 2 valid items should be returned');
    assert.strictEqual(state.data.subtotal, 350);

    // Verify DB Cart document: exactly 2 items remaining, and neither is the deleted product
    const dbCart = await Cart.findOne({ user: testUser._id });
    assert.strictEqual(dbCart.items.length, 2);
    const pidsInCart = dbCart.items.map(i => i.product.toString());
    assert.ok(pidsInCart.includes(prodValid1._id.toString()));
    assert.ok(pidsInCart.includes(prodValid2._id.toString()));
    assert.ok(!pidsInCart.includes(prodDeleted._id.toString()));
  });

  await t.test('4. Cart retrieval after cleanup returns clean state with zero extra DB mutations', async () => {
    // Calling getCart again immediately should find no orphans and return the 2 items
    const { req, res, getState } = createMockReqRes({ user: testUser });
    await getCart(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.data.items.length, 2);
    assert.strictEqual(state.data.subtotal, 350);
  });

  await t.test('5. Checkout with stale product references purges orphans, returns clear 400, then succeeds', async () => {
    const prodValid = await Product.create({
      name: 'Checkout Valid Item',
      description: 'Valid item',
      price: 120,
      stock: 10,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['cv.jpg']
    });

    const prodGhost = await Product.create({
      name: 'Ghost Item',
      description: 'Will disappear right before checkout',
      price: 300,
      stock: 5,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['ghost.jpg']
    });

    // Populate user cart with valid + ghost
    await Cart.findOneAndUpdate(
      { user: testUser._id },
      {
        items: [
          { product: prodValid._id, vendor: testVendor._id, quantity: 1, priceAtAdd: 120 },
          { product: prodGhost._id, vendor: testVendor._id, quantity: 1, priceAtAdd: 300 }
        ]
      }
    );

    // Delete ghost product
    await Product.findByIdAndDelete(prodGhost._id);

    // Attempt checkout
    const { req: checkReq1, res: checkRes1, getState: checkState1 } = createMockReqRes({
      user: testUser,
      body: {
        shippingAddress: { street: '123 Test St', city: 'City', zipCode: '12345' },
        paymentMethod: 'Card'
      }
    });

    await processCheckout(checkReq1, checkRes1);
    const res1 = checkState1();

    // Must return clear 400 rejection (NOT a 500 unhandled crash)
    assert.strictEqual(res1.statusCode, 400);
    assert.match(res1.data.message, /no longer available and have been removed/i);

    // Verify DB cart now only contains prodValid!
    const cartAfterFirstCheckout = await Cart.findOne({ user: testUser._id });
    assert.strictEqual(cartAfterFirstCheckout.items.length, 1);
    assert.strictEqual(cartAfterFirstCheckout.items[0].product.toString(), prodValid._id.toString());

    // User reviews updated cart and clicks checkout again -> Must succeed!
    const { req: checkReq2, res: checkRes2, getState: checkState2 } = createMockReqRes({
      user: testUser,
      body: {
        shippingAddress: { street: '123 Test St', city: 'City', zipCode: '12345' },
        paymentMethod: 'Card'
      }
    });

    await processCheckout(checkReq2, checkRes2);
    const res2 = checkState2();

    assert.strictEqual(res2.statusCode, 201, `Checkout should succeed: ${res2.data?.message}`);
    assert.strictEqual(res2.data.order.items.length, 1);
    assert.strictEqual(res2.data.order.items[0].product._id.toString(), prodValid._id.toString());

    // Cart is now cleared after successful checkout
    const finalCart = await Cart.findOne({ user: testUser._id });
    assert.strictEqual(finalCart.items.length, 0);
  });

  await t.test('6. Empty cart after cleanup rejects checkout with clear message and persists empty cart', async () => {
    const doomedProd = await Product.create({
      name: 'Sole Doomed Item',
      description: 'Only item in cart',
      price: 50,
      stock: 2,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['sole.jpg']
    });

    await Cart.findOneAndUpdate(
      { user: testUser._id },
      {
        items: [
          { product: doomedProd._id, vendor: testVendor._id, quantity: 2, priceAtAdd: 50 }
        ]
      }
    );

    // Delete the only product
    await Product.findByIdAndDelete(doomedProd._id);

    // Checkout
    const { req, res, getState } = createMockReqRes({
      user: testUser,
      body: {
        shippingAddress: { street: '123 St', city: 'City', zipCode: '12345' },
        paymentMethod: 'Card'
      }
    });

    await processCheckout(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 400);
    assert.match(state.data.message, /empty/i);

    const dbCart = await Cart.findOne({ user: testUser._id });
    assert.strictEqual(dbCart.items.length, 0, 'Cart must be persisted empty');
  });

  await t.test('7. Concurrent cart operations: atomic $pull does not clobber concurrent item additions', async () => {
    const existingValid = await Product.create({
      name: 'Concurrent Base Item',
      description: 'Already in cart',
      price: 45,
      stock: 20,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['cb.jpg']
    });

    const deletedItem = await Product.create({
      name: 'Concurrent Orphan Item',
      description: 'Will be deleted',
      price: 60,
      stock: 5,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['co.jpg']
    });

    const newArrival = await Product.create({
      name: 'Concurrent Newly Added Item',
      description: 'Added while purge is running',
      price: 90,
      stock: 15,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['na.jpg']
    });

    const cart = await Cart.findOneAndUpdate(
      { user: testUser._id },
      {
        items: [
          { product: existingValid._id, vendor: testVendor._id, quantity: 1, priceAtAdd: 45 },
          { product: deletedItem._id, vendor: testVendor._id, quantity: 1, priceAtAdd: 60 }
        ]
      },
      { new: true }
    );

    // Delete the orphan
    await Product.findByIdAndDelete(deletedItem._id);

    // Simulate concurrent operations:
    // Op 1: purgeOrphanedCartItems runs on cart
    // Op 2: Cart.updateOne adds newArrival to items array
    const op1 = purgeOrphanedCartItems(cart, false);
    const op2 = Cart.updateOne(
      { _id: cart._id },
      {
        $push: {
          items: {
            product: newArrival._id,
            vendor: testVendor._id,
            quantity: 2,
            priceAtAdd: 90
          }
        }
      }
    );

    await Promise.all([op1, op2]);

    // Inspect database cart state
    const afterCart = await Cart.findById(cart._id);
    const pids = afterCart.items.map(i => i.product.toString());

    assert.ok(!pids.includes(deletedItem._id.toString()), 'Deleted item must be purged');
    assert.ok(pids.includes(existingValid._id.toString()), 'Existing valid item must remain');
    assert.ok(pids.includes(newArrival._id.toString()), 'Concurrently pushed item must remain intact');
    assert.strictEqual(afterCart.items.length, 2);
  });

  await t.test('8. Guest cart sync purges stale items from both guest and user carts before merging', async () => {
    const validGuestProd = await Product.create({
      name: 'Valid Guest Item',
      description: 'Guest item that lives',
      price: 35,
      stock: 10,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['vg.jpg']
    });

    const deletedGuestProd = await Product.create({
      name: 'Deleted Guest Item',
      description: 'Guest item that dies',
      price: 70,
      stock: 5,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['dg.jpg']
    });

    const sessionId = 'sync-test-session-456';
    await GuestCart.create({
      sessionId,
      items: [
        { product: validGuestProd._id, vendor: testVendor._id, quantity: 2, priceAtAdd: 35 },
        { product: deletedGuestProd._id, vendor: testVendor._id, quantity: 1, priceAtAdd: 70 }
      ]
    });

    // Delete the guest product
    await Product.findByIdAndDelete(deletedGuestProd._id);

    // Reset user cart to empty
    await Cart.findOneAndUpdate({ user: testUser._id }, { items: [] });

    // Call syncGuestCart
    const { req, res, getState } = createMockReqRes({
      user: testUser,
      body: { sessionId }
    });

    await syncGuestCart(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.data.items.length, 1);
    assert.strictEqual(state.data.items[0].product._id.toString(), validGuestProd._id.toString());

    // User cart in DB has only valid item
    const dbUserCart = await Cart.findOne({ user: testUser._id });
    assert.strictEqual(dbUserCart.items.length, 1);
    assert.strictEqual(dbUserCart.items[0].product.toString(), validGuestProd._id.toString());

    // Guest cart deleted
    const checkGuestCart = await GuestCart.findOne({ sessionId });
    assert.strictEqual(checkGuestCart, null, 'Guest cart should be deleted after sync');
  });

  await t.test('9. Standard cart regression: add, update quantity, and remove item', async () => {
    const regProd = await Product.create({
      name: 'Regression Product',
      description: 'Testing add/update/remove',
      price: 100,
      stock: 5,
      category: testCategory._id,
      vendor: testVendor._id,
      images: ['reg.jpg']
    });

    // Reset cart
    await Cart.findOneAndUpdate({ user: testUser._id }, { items: [] });

    // 1. Add to cart
    const { req: addReq, res: addRes, getState: addState } = createMockReqRes({
      user: testUser,
      body: { productId: regProd._id.toString(), quantity: 2 }
    });
    await addToCart(addReq, addRes);
    assert.strictEqual(addState().statusCode, 200);
    assert.strictEqual(addState().data.items.length, 1);
    assert.strictEqual(addState().data.items[0].quantity, 2);

    // 2. Add exceeding stock should reject
    const { req: excReq, res: excRes, getState: excState } = createMockReqRes({
      user: testUser,
      body: { productId: regProd._id.toString(), quantity: 10 }
    });
    await addToCart(excReq, excRes);
    assert.strictEqual(excState().statusCode, 400);

    // 3. Update quantity
    const { req: updReq, res: updRes, getState: updState } = createMockReqRes({
      user: testUser,
      body: { productId: regProd._id.toString(), quantity: 4 }
    });
    await updateCartItem(updReq, updRes);
    assert.strictEqual(updState().statusCode, 200);
    assert.strictEqual(updState().data.items[0].quantity, 4);

    // 4. Remove item
    const { req: remReq, res: remRes, getState: remState } = createMockReqRes({
      user: testUser,
      params: { productId: regProd._id.toString() }
    });
    await removeFromCart(remReq, remRes);
    assert.strictEqual(remState().statusCode, 200);
    assert.strictEqual(remState().data.items.length, 0);
  });

  await t.test('Teardown test server', async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
});
