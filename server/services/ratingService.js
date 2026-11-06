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
 * Returns true if customer has a non-cancelled order with a non-cancelled line item for the product.
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
        status: { $ne: 'Cancelled' }
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

  let vendorRating = 0;
  let numRatings = 0;

  if (targetVendorId) {
    const vendorObjectId = new mongoose.Types.ObjectId(targetVendorId);

    // Recalculate Vendor Rating & Review Count across all products belonging to this vendor
    const vendorStats = await Review.aggregate([
      { $match: { vendor: vendorObjectId } },
      {
        $group: {
          _id: '$vendor',
          avgRating: { $avg: '$rating' },
          numRatings: { $sum: 1 }
        }
      }
    ]);

    numRatings = vendorStats[0] ? vendorStats[0].numRatings : 0;
    const rawVendorAvg = vendorStats[0] ? vendorStats[0].avgRating : 0;
    vendorRating = numRatings > 0 ? Math.round(rawVendorAvg * 10) / 10 : 0;

    await Vendor.findByIdAndUpdate(
      targetVendorId,
      { rating: vendorRating, numRatings },
      { new: true }
    );
  }

  return {
    product: { rating: productRating, numReviews },
    vendor: { rating: vendorRating, numRatings }
  };
}

module.exports = {
  verifyPurchaseEligibility,
  recalculateProductAndVendorRatings
};
