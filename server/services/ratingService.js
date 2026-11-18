'use strict';
/**
 * Rating Service
 *
 * Responsibilities:
 *  1. Atomically recalculate and persist average rating and review counts for Product.
 *  2. Atomically recalculate and persist average rating and review counts for Vendor.
 *  3. Validate customer purchase eligibility for verified reviews (excluding cancelled orders/items).
 */
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const Review = require('../models/Review');

/**
 * Validates whether a user has legitimately purchased a product.
 * Returns true if the customer has a non-cancelled order in which a line item for
 * the product has been DELIVERED. Pending/processing/shipped items do not count:
 * a buyer can only review what they actually received, and a delivered item can
 * no longer be cancelled, so a review can never outlive its purchase.
 * Admin users are granted a bypass.
 */
async function verifyPurchaseEligibility({ userId, productId, role }) {
  if (role === 'admin') {
    return { eligible: true, order: null };
  }

  const qualifyingOrder = await Order.findOne({
    customer: userId,
    orderStatus: { $ne: 'Cancelled' },
    paymentStatus: { $ne: 'Failed' },
    items: {
      $elemMatch: {
        product: productId,
        status: 'Delivered'
      }
    }
  });

  return {
    eligible: !!qualifyingOrder,
    order: qualifyingOrder
  };
}

/**
 * Recalculates both Product and Vendor ratings using database-native aggregation pipelines.
 * Ensures Product.rating, Product.numReviews, Vendor.rating, and Vendor.numRatings stay in sync.
 */
async function recalculateProductAndVendorRatings({ productId, vendorId }) {
  const productObjectId = new mongoose.Types.ObjectId(productId);

  // 1. Recalculate Product Rating & Review Count via MongoDB Aggregation
  const productStats = await Review.aggregate([
    { $match: { product: productObjectId } },
    {
      $group: {
        _id: '$product',
        avgRating: { $avg: '$rating' },
        numReviews: { $sum: 1 }
      }
    }
  ]);

  const numReviews = productStats[0] ? productStats[0].numReviews : 0;
  const rawProductAvg = productStats[0] ? productStats[0].avgRating : 0;
  const productRating = numReviews > 0 ? Math.round(rawProductAvg * 10) / 10 : 0;

  await Product.findByIdAndUpdate(
    productId,
    { rating: productRating, numReviews },
    { new: true }
  );

  // 2. Resolve vendorId if not provided directly
  let targetVendorId = vendorId;
  if (!targetVendorId) {
    const productDoc = await Product.findById(productId).select('vendor');
    if (productDoc) {
      targetVendorId = productDoc.vendor;
    }
  }

  const vendor = targetVendorId
    ? await recalculateVendorRating(targetVendorId)
    : { rating: 0, numRatings: 0 };

  return {
    product: { rating: productRating, numReviews },
    vendor: { rating: vendor.rating, numRatings: vendor.numRatings }
  };
}

/**
 * Recalculates a vendor's average rating and rating count from its reviews.
 */
async function recalculateVendorRating(vendorId) {
  if (!vendorId) return { rating: 0, numRatings: 0 };
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const stats = await Review.aggregate([
    { $match: { vendor: vendorObjectId } },
    { $group: { _id: '$vendor', avgRating: { $avg: '$rating' }, numRatings: { $sum: 1 } } }
  ]);
  const numRatings = stats[0] ? stats[0].numRatings : 0;
  const rating = numRatings > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;
  await Vendor.findByIdAndUpdate(vendorId, { rating, numRatings });
  return { rating, numRatings };
}

module.exports = {
  verifyPurchaseEligibility,
  recalculateVendorRating,
  recalculateProductAndVendorRatings
};
