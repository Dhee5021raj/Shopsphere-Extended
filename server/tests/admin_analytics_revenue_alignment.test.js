'use strict';
/**
 * Test Suite: Subsegment 2.3 — Platform Revenue & Admin Category Aggregation Alignment
 *
 * Verifies:
 *  1. Cancelled Order Exclusion from Gross Revenue:
 *     - summary.grossRevenue reflects non-cancelled orders only.
 *     - Cancelled orders do NOT inflate platform GMV figures.
 *  2. Platform Monthly Overview:
 *     - monthlyOverview pipeline excludes cancelled orders via orderStatus $ne Cancelled.
 *     - Month-by-month revenue matches non-cancelled sales volume.
 *  3. Top Categories Revenue & Unit Alignment:
 *     - topCategories excludes cancelled parent orders BEFORE $unwind.
 *     - Post-unwind filter excludes individually cancelled line items.
 *     - Category revenue accurately tallies only delivered/active items.
 *  4. Top Vendors Alignment:
 *     - Pre-filters non-cancelled parent orders before expanding items.
 *  5. Cumulative Total Orders Metric Semantics:
 *     - summary.totalOrders reflects cumulative platform checkout volume (all orders created).
 *  6. API Response Contract:
 *     - Matches AdminDashboardPage.jsx expectations for summary, monthlyOverview,
 *       topVendors, and topCategories.
 */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');

const { getAdminAnalytics } = require('../controllers/analyticsController');

function createMockReqRes({ user } = {}) {
  const req = { user };
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

test('Subsegment 2.3 — Platform Revenue & Admin Category Aggregation Alignment Suite', async (t) => {
  let mongoServer;
  let adminUser, customerUser, vendorUser, vendor;
  let catElectronics, catClothing;
  let prodLaptop, prodEarbuds, prodJacket;

  await t.test('Setup MongoMemoryServer and seed orders with varied statuses', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await Order.syncIndexes();
    await Vendor.syncIndexes();
    await Product.syncIndexes();

    adminUser = await User.create({
      name: 'System Admin',
      email: 'admin.analytics@test.com',
      password: 'password123',
      role: 'admin'
    });

    customerUser = await User.create({
      name: 'Platform Customer',
      email: 'buyer.analytics@test.com',
      password: 'password123',
      role: 'customer'
    });

    vendorUser = await User.create({
      name: 'Hardware Vendor',
      email: 'hardware.analytics@test.com',
      password: 'password123',
      role: 'vendor'
    });

    vendor = await Vendor.create({
      user: vendorUser._id,
      storeName: 'Omni Hardware',
      storeSlug: 'omni-hardware',
      description: 'Computing and accessories',
      status: 'approved',
      rating: 4.9,
      numRatings: 50,
      totalSales: 500000
    });

    catElectronics = await Category.create({
      name: 'Electronics',
      slug: 'electronics',
      description: 'Laptops and audio',
      icon: 'Laptop',
      image: 'https://images.unsplash.com/photo-1498049860654-af1a5c566876?w=600'
    });

    catClothing = await Category.create({
      name: 'Clothing',
      slug: 'clothing',
      description: 'Jackets and apparel',
      icon: 'Shirt',
      image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600'
    });

    prodLaptop = await Product.create({
      name: 'Pro Ultra Laptop 16',
      description: 'High performance laptop',
      price: 50000,
      stock: 10,
      category: catElectronics._id,
      vendor: vendor._id,
      images: ['https://images.unsplash.com/photo-1498049860654-af1a5c566876?w=600']
    });

    prodEarbuds = await Product.create({
      name: 'Pro Wireless Earbuds',
      description: 'Active noise cancelling',
      price: 5000,
      stock: 40,
      category: catElectronics._id,
      vendor: vendor._id,
      images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600']
    });

    prodJacket = await Product.create({
      name: 'Thermal Winter Jacket',
      description: 'Waterproof insulated jacket',
      price: 8000,
      stock: 25,
      category: catClothing._id,
      vendor: vendor._id,
      images: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600']
    });

    // ── Order 1: Delivered (Electronics) ──────────────────
    // Total: ₹50,000 (1 Laptop)
    await Order.create({
      customer: customerUser._id,
      items: [
        { product: prodLaptop._id, vendor: vendor._id, name: prodLaptop.name, quantity: 1, price: 50000, status: 'Delivered' }
      ],
      shippingAddress: { street: 'Main Blvd', city: 'Bengaluru', state: 'Karnataka', zipCode: '560001' },
      totalAmount: 50000,
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      orderStatus: 'Delivered'
    });

    // ── Order 2: Processing (Clothing) ────────────────────
    // Total: ₹16,000 (2 Jackets)
    await Order.create({
      customer: customerUser._id,
      items: [
        { product: prodJacket._id, vendor: vendor._id, name: prodJacket.name, quantity: 2, price: 8000, status: 'Processing' }
      ],
      shippingAddress: { street: 'North Street', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001' },
      totalAmount: 16000,
      paymentStatus: 'Paid',
      paymentMethod: 'UPI',
      orderStatus: 'Processing'
    });

    // ── Order 3: Cancelled (Electronics) ──────────────────
    // Total: ₹100,000 (2 Laptops) — MUST BE COMPLETELY EXCLUDED FROM REVENUE
    await Order.create({
      customer: customerUser._id,
      items: [
        { product: prodLaptop._id, vendor: vendor._id, name: prodLaptop.name, quantity: 2, price: 50000, status: 'Cancelled' }
      ],
      shippingAddress: { street: 'West End', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
      totalAmount: 100000,
      paymentStatus: 'Failed',
      paymentMethod: 'Card',
      orderStatus: 'Cancelled'
    });

    // ── Order 4: Shipped (Mixed: 1 Earbuds Delivered, 1 Jacket Cancelled) ─
    // Total Amount on order: ₹13,000
    // Active Item: Earbuds (1 x 5000 = ₹5,000)
    // Cancelled Item: Jacket (1 x 8000 = ₹8,000, Cancelled)
    await Order.create({
      customer: customerUser._id,
      items: [
        { product: prodEarbuds._id, vendor: vendor._id, name: prodEarbuds.name, quantity: 1, price: 5000, status: 'Shipped' },
        { product: prodJacket._id, vendor: vendor._id, name: prodJacket.name, quantity: 1, price: 8000, status: 'Cancelled' }
      ],
      shippingAddress: { street: 'South Ave', city: 'Chennai', state: 'Tamil Nadu', zipCode: '600001' },
      totalAmount: 13000,
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      orderStatus: 'Shipped'
    });
  });

  await t.test('Gross Revenue excludes Cancelled orders (does not inflate with 100k)', async () => {
    const { req, res, getState } = createMockReqRes({ user: adminUser });
    await getAdminAnalytics(req, res);

    const state = getState();
    assert.strictEqual(state.statusCode, 200);
    const data = state.data;

    // Expected Non-Cancelled Orders:
    // Order 1 (Delivered): 50000
    // Order 2 (Processing): 16000
    // Order 4 (Shipped): 13000
    // Order 3 (Cancelled): 100000 -> EXCLUDED
    // Gross Revenue = 50000 + 16000 + 13000 = 79000
    assert.strictEqual(data.summary.grossRevenue, 79000, 'Gross revenue must exclude cancelled orders (79000, not 179000)');

    // Total lifetime checkouts metric reflects all 4 orders
    assert.strictEqual(data.summary.totalOrders, 4, 'Total orders reflects all 4 lifetime checkouts');
    assert.strictEqual(data.summary.totalUsers, 3);
    assert.strictEqual(data.summary.totalVendors, 1);
    assert.strictEqual(data.summary.totalProducts, 3);
  });

  await t.test('Platform monthlyOverview sums non-cancelled orders only', async () => {
    const { req, res, getState } = createMockReqRes({ user: adminUser });
    await getAdminAnalytics(req, res);

    const state = getState();
    assert.strictEqual(state.statusCode, 200);
    const monthly = state.data.monthlyOverview;

    assert.ok(Array.isArray(monthly), 'monthlyOverview must be an array');
    assert.strictEqual(monthly.length, 1, 'Single month of orders');

    // Monthly total revenue should equal sum of non-cancelled orders
    assert.strictEqual(monthly[0].totalRevenue, 79000, 'Monthly revenue must exclude cancelled orders');
    // Non-cancelled orders count for this month
    assert.strictEqual(monthly[0].totalOrders, 3, 'Monthly totalOrders must count non-cancelled orders (3)');
  });

  await t.test('topCategories excludes cancelled parent orders and individually cancelled items', async () => {
    const { req, res, getState } = createMockReqRes({ user: adminUser });
    await getAdminAnalytics(req, res);

    const state = getState();
    assert.strictEqual(state.statusCode, 200);
    const categories = state.data.topCategories;

    assert.ok(Array.isArray(categories), 'topCategories must be an array');
    assert.strictEqual(categories.length, 2, 'Two distinct categories represented');

    // Expected Category Revenues:
    // Electronics:
    //   - Order 1: 1 Laptop x 50000 = 50000 (Delivered)
    //   - Order 4: 1 Earbuds x 5000 = 5000 (Shipped)
    //   - Order 3: 2 Laptops x 50000 (Cancelled) -> EXCLUDED
    //   Total Electronics Revenue = 55000, Items Sold = 2
    // Clothing:
    //   - Order 2: 2 Jackets x 8000 = 16000 (Processing)
    //   - Order 4: 1 Jacket x 8000 (Cancelled) -> EXCLUDED
    //   Total Clothing Revenue = 16000, Items Sold = 2

    const elec = categories.find((c) => c.categoryName === 'Electronics');
    const cloth = categories.find((c) => c.categoryName === 'Clothing');

    assert.ok(elec, 'Electronics must be in top categories');
    assert.strictEqual(elec.totalRevenue, 55000, 'Electronics revenue must be 55000 (excluding 100k cancelled)');
    assert.strictEqual(elec.itemsSold, 2, 'Electronics units sold must be 2');

    assert.ok(cloth, 'Clothing must be in top categories');
    assert.strictEqual(cloth.totalRevenue, 16000, 'Clothing revenue must be 16000 (excluding cancelled line item)');
    assert.strictEqual(cloth.itemsSold, 2, 'Clothing units sold must be 2');
  });

  await t.test('topVendors excludes cancelled parent orders and individually cancelled items', async () => {
    const { req, res, getState } = createMockReqRes({ user: adminUser });
    await getAdminAnalytics(req, res);

    const state = getState();
    assert.strictEqual(state.statusCode, 200);
    const topVendors = state.data.topVendors;

    assert.ok(Array.isArray(topVendors), 'topVendors must be an array');
    assert.strictEqual(topVendors.length, 1);

    // Vendor active items:
    // Order 1: 50000 (1 unit)
    // Order 2: 16000 (2 units)
    // Order 4: 5000 (1 unit)
    // Total = 71000, 4 units
    assert.strictEqual(topVendors[0].storeName, 'Omni Hardware');
    assert.strictEqual(topVendors[0].totalSalesAmount, 71000, 'Vendor sales amount must be 71000');
    assert.strictEqual(topVendors[0].totalUnitsSold, 4, 'Vendor units sold must be 4');
  });

  await t.test('Teardown database connection', async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
});
