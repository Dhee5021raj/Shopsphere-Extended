const express = require('express');
const router = express.Router();
const {
  getVendors,
  getVendorStoreBySlug,
  getVendorDashboardStats,
  getVendorOrders,
  updateVendorOrderItemStatus
} = require('../controllers/vendorController');
const { protect, authorizeRoles, authorizeVendor } = require('../middleware/authMiddleware');

router.get('/', getVendors);
router.get('/store/:slug', getVendorStoreBySlug);

// Vendor dashboard protected routes
router.get('/dashboard/stats', protect, authorizeRoles('vendor'), getVendorDashboardStats);
router.get('/orders', protect, authorizeRoles('vendor'), getVendorOrders);
router.put('/orders/:orderId/items/:itemId/status', protect, authorizeRoles('vendor'), updateVendorOrderItemStatus);

module.exports = router;
