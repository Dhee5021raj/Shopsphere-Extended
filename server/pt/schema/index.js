'use strict';
/**
 * mongo-pt benchmark schema — a REFERENCED (normalized) schema in a separate
 * database (`shopsphere_bench`). This intentionally differs from the demo app,
 * whose orders embed their items; here `order_items` is its own collection so
 * that joins are real joins.
 *
 * Collections: users, vendors, categories, products, orders, order_items, reviews
 */
const mongoose = require('mongoose');

const { Schema } = mongoose;

const usersSchema = new Schema({
  name: String,
  email: String,
  created_at: { type: Date, default: Date.now }
}, { collection: 'users' });

const vendorsSchema = new Schema({
  name: String,
  rating: Number,
  created_at: { type: Date, default: Date.now }
}, { collection: 'vendors' });

const categoriesSchema = new Schema({
  name: String,
  is_rare: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
}, { collection: 'categories' });

const productsSchema = new Schema({
  name: String,
  vendor_id: { type: Schema.Types.ObjectId, ref: 'BenchVendor' },
  category_id: { type: Schema.Types.ObjectId, ref: 'BenchCategory' },
  price: Number,
  stock: Number,
  // Live-search splice support: the demo store filters products by average
  // rating and featured flag, so the bench keeps comparable fields.
  rating: Number,
  isFeatured: Boolean,
  created_at: { type: Date, default: Date.now }
}, { collection: 'products' });

const ordersSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'BenchUser' },
  status: String,
  total_amount: Number,
  created_at: { type: Date, default: Date.now }
}, { collection: 'orders' });

const orderItemsSchema = new Schema({
  order_id: { type: Schema.Types.ObjectId, ref: 'BenchOrder' },
  product_id: { type: Schema.Types.ObjectId, ref: 'BenchProduct' },
  vendor_id: { type: Schema.Types.ObjectId, ref: 'BenchVendor' },
  quantity: Number,
  price: Number,
  line_total: Number,
  created_at: { type: Date, default: Date.now }
}, { collection: 'order_items' });

const reviewsSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'BenchUser' },
  product_id: { type: Schema.Types.ObjectId, ref: 'BenchProduct' },
  vendor_id: { type: Schema.Types.ObjectId, ref: 'BenchVendor' },
  rating: Number,
  created_at: { type: Date, default: Date.now }
}, { collection: 'reviews' });

const User = mongoose.model('BenchUser', usersSchema);
const Vendor = mongoose.model('BenchVendor', vendorsSchema);
const Category = mongoose.model('BenchCategory', categoriesSchema);
const Product = mongoose.model('BenchProduct', productsSchema);
const Order = mongoose.model('BenchOrder', ordersSchema);
const OrderItem = mongoose.model('BenchOrderItem', orderItemsSchema);
const Review = mongoose.model('BenchReview', reviewsSchema);

module.exports = { User, Vendor, Category, Product, Order, OrderItem, Review };
