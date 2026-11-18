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
// authorizeVendor rejects pending/rejected stores so admin approval actually gates access.
router.get('/dashboard/stats', protect, authorizeRoles('vendor'), authorizeVendor, getVendorDashboardStats);
router.get('/orders', protect, authorizeRoles('vendor'), authorizeVendor, getVendorOrders);
router.put('/orders/:orderId/items/:itemId/status', protect, authorizeRoles('vendor'), authorizeVendor, updateVendorOrderItemStatus);

module.exports = router;
