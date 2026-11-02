'use strict';
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const GuestCart = require('../models/GuestCart');
const Product = require('../models/Product');

/**
 * Detects and atomically purges orphaned product references from a cart document in MongoDB.
 * An item is orphaned if:
 *  - item.product is null, undefined, or missing
 *  - item.product does not exist in the Product collection
 *
 * Uses MongoDB atomic $pull operation to ensure concurrent cart mutations are preserved.
 *
 * @param {mongoose.Document} cartDoc - The Cart or GuestCart document
 * @param {boolean} isGuest - True if GuestCart, false if authenticated Cart
 * @returns {Promise<{ hasOrphans: boolean, purgedCount: number, validProductIds: Set<string> }>}
 */
const purgeOrphanedCartItems = async (cartDoc, isGuest = false) => {
  if (!cartDoc || !Array.isArray(cartDoc.items) || cartDoc.items.length === 0) {
    return { hasOrphans: false, purgedCount: 0, validProductIds: new Set() };
  }

  const candidateIds = [];
  const malformedItemIds = [];

  for (const item of cartDoc.items) {
    if (!item || !item.product) {
      if (item && item._id) malformedItemIds.push(item._id);
    } else {
      candidateIds.push(item.product);
    }
  }

  // Look up existing products in database
  let existingProducts = [];
  if (candidateIds.length > 0) {
    existingProducts = await Product.find({ _id: { $in: candidateIds } }).select('_id');
  }

  const validProductIds = new Set(existingProducts.map(p => p._id.toString()));

  const orphanedProductIds = [];
  for (const pid of candidateIds) {
    const pidStr = pid.toString();
    if (!validProductIds.has(pidStr)) {
      orphanedProductIds.push(pid);
    }
  }

  const hasOrphans = orphanedProductIds.length > 0 || malformedItemIds.length > 0;
  if (!hasOrphans) {
    return { hasOrphans: false, purgedCount: 0, validProductIds };
  }

  const CartModel = isGuest ? GuestCart : Cart;

  // Build atomic $pull criteria
  const pullOrConditions = [];
  if (orphanedProductIds.length > 0) {
    pullOrConditions.push({ product: { $in: orphanedProductIds } });
  }
  if (malformedItemIds.length > 0) {
    pullOrConditions.push({ _id: { $in: malformedItemIds } });
    pullOrConditions.push({ product: null });
    pullOrConditions.push({ product: { $exists: false } });
  }

  const pullQuery = pullOrConditions.length === 1
    ? pullOrConditions[0]
    : { $or: pullOrConditions };

  await CartModel.updateOne(
    { _id: cartDoc._id },
    { $pull: { items: pullQuery } }
  );

  // Update in-memory items array so current request immediately reflects the cleanup
  cartDoc.items = cartDoc.items.filter(item => {
    if (!item || !item.product) return false;
    return validProductIds.has(item.product.toString());
  });

  const purgedCount = orphanedProductIds.length + malformedItemIds.length;
  return {
    hasOrphans: true,
    purgedCount,
    validProductIds
  };
};

/**
 * Calculates cart totals and populates items with complete product, vendor, and category details.
 * Eliminates N+1 query overhead by executing a single batched Product.find({ _id: { $in: productIds } })
 * and indexing results in a Map for O(1) in-memory resolution.
 * Preserves exact frontend response format.
 *
 * @param {Array} items - Cart items
 * @returns {Promise<{ items: Array, subtotal: number, shipping: number, tax: number, total: number }>}
 */
const populateCartItems = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 };
  }

  // 1. Collect unique valid product IDs for batched retrieval
  const productIds = [];
  for (const item of items) {
    if (item && item.product) {
      const pid = item.product._id ? item.product._id : item.product;
      productIds.push(pid);
    }
  }

  if (productIds.length === 0) {
    return { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 };
  }

  // 2. Single batched query replacing sequential N queries (N+1 query elimination)
  const products = await Product.find({ _id: { $in: productIds } })
    .populate('category', 'name slug')
    .populate('vendor', 'storeName storeSlug logo');

  // 3. Map for O(1) product lookups
  const productMap = new Map();
  for (const prod of products) {
    productMap.set(prod._id.toString(), prod);
  }

  // 4. Assemble populated items in the original cart item order
  const populatedItems = [];
  let subtotal = 0;

  for (const item of items) {
    if (!item || !item.product) continue;

    const pidStr = (item.product._id ? item.product._id : item.product).toString();
    const product = productMap.get(pidStr);

    if (product) {
      const price = product.discountPrice > 0 ? product.discountPrice : product.price;
      const quantity = Math.min(item.quantity, product.stock);
      const itemTotal = price * quantity;
      subtotal += itemTotal;

      populatedItems.push({
        _id: item._id,
        product: {
          _id: product._id,
          name: product.name,
          price: product.price,
          discountPrice: product.discountPrice,
          effectivePrice: price,
          images: product.images,
          stock: product.stock,
          category: product.category,
          vendor: product.vendor
        },
        vendor: product.vendor,
        quantity,
        priceAtAdd: price,
        itemTotal
      });
    }
  }

  const shipping = subtotal > 1000 || subtotal === 0 ? 0 : 99;
  const tax = Math.round(subtotal * 0.18); // 18% GST/Tax
  const total = subtotal + shipping + tax;

  return { items: populatedItems, subtotal, shipping, tax, total };
};

module.exports = {
  purgeOrphanedCartItems,
  populateCartItems
};
