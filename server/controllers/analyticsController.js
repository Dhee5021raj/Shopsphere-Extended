const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const User = require('../models/User');

/*
  ===================================================================
  DEMO MONGODB AGGREGATION PIPELINES (Viva / DB Project Requirements)
  ===================================================================
  All metrics in this controller are calculated server-side using native
  MongoDB Aggregation Framework pipelines ($match, $unwind, $group, $sort, $limit, $project).
*/

// @desc    Get Vendor Aggregation Analytics (Monthly sales, top products, ratings)
// @route   GET /api/analytics/vendor
const getVendorAnalytics = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });

    const vendorId = vendor._id;

    // PIPELINE 1: Monthly Sales & Revenue breakdown for this Vendor
    const monthlyRevenue = await Order.aggregate([
      { $unwind: '$items' },
      {
        $match: {
          'items.vendor': vendorId,
          'items.status': { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          totalUnitsSold: { $sum: '$items.quantity' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // PIPELINE 2: Best-Selling Products for this Vendor
    const bestSellingProducts = await Order.aggregate([
      { $unwind: '$items' },
      {
        $match: {
          'items.vendor': vendorId,
          'items.status': { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: '$items.product',
          productName: { $first: '$items.name' },
          totalUnitsSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      { $sort: { totalUnitsSold: -1 } },
      { $limit: 5 }
    ]);

    // PIPELINE 3: Average Product Ratings breakdown for this Vendor
    const ratingStats = await Product.aggregate([
      { $match: { vendor: vendorId } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalReviewsCount: { $sum: '$numReviews' },
          totalProductsCount: { $sum: 1 }
        }
      }
    ]);

    res.json({
      vendor: {
        storeName: vendor.storeName,
        rating: vendor.rating,
        totalSales: vendor.totalSales
      },
      monthlyRevenue,
      bestSellingProducts,
      ratingStats: ratingStats[0] || { avgRating: 0, totalReviewsCount: 0, totalProductsCount: 0 }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Marketplace-wide Admin Aggregation Analytics
// @route   GET /api/analytics/admin
const getAdminAnalytics = async (req, res) => {
  try {
    // PIPELINE 1: Platform Monthly Revenue & Order Volume
    const monthlyOverview = await Order.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalRevenue: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // PIPELINE 2: Top Vendors by Sales Volume
    const topVendors = await Order.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'Cancelled' } } },
      {
        $group: {
          _id: '$items.vendor',
          totalSalesAmount: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          totalUnitsSold: { $sum: '$items.quantity' }
        }
      },
      {
        $lookup: {
          from: 'vendors',
          localField: '_id',
          foreignField: '_id',
          as: 'vendorDetails'
        }
      },
      { $unwind: '$vendorDetails' },
      {
        $project: {
          _id: 1,
          storeName: '$vendorDetails.storeName',
          logo: '$vendorDetails.logo',
          rating: '$vendorDetails.rating',
          totalSalesAmount: 1,
          totalUnitsSold: 1
        }
      },
      { $sort: { totalSalesAmount: -1 } },
      { $limit: 5 }
    ]);

    // PIPELINE 3: Top Categories by Sales Revenue
    const topCategories = await Order.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'Cancelled' } } },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productDoc'
        }
      },
      { $unwind: '$productDoc' },
      {
        $group: {
          _id: '$productDoc.category',
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          itemsSold: { $sum: '$items.quantity' }
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryDetails'
        }
      },
      { $unwind: '$categoryDetails' },
      {
        $project: {
          _id: 1,
          categoryName: '$categoryDetails.name',
          icon: '$categoryDetails.icon',
          totalRevenue: 1,
          itemsSold: 1
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    // Summary Totals
    const totalUsers = await User.countDocuments();
    const totalVendors = await Vendor.countDocuments({ status: 'approved' });
    const pendingVendors = await Vendor.countDocuments({ status: 'pending' });
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    
    const grossRevenueResult = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const grossRevenue = grossRevenueResult[0] ? grossRevenueResult[0].total : 0;

    res.json({
      summary: {
        totalUsers,
        totalVendors,
        pendingVendors,
        totalProducts,
        totalOrders,
        grossRevenue
      },
      monthlyOverview,
      topVendors,
      topCategories
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getVendorAnalytics,
  getAdminAnalytics
};
