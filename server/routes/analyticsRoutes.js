const express = require('express');
const router = express.Router();
const { getVendorAnalytics, getAdminAnalytics } = require('../controllers/analyticsController');
const { protect, authorizeRoles, authorizeVendor } = require('../middleware/authMiddleware');
const ptShadow = require('../middleware/ptShadow');

// ptShadow runs after the response finishes (no-op unless PT_SHADOW=1).
router.get('/vendor', protect, authorizeRoles('vendor'), authorizeVendor, ptShadow, getVendorAnalytics);
router.get('/admin', protect, authorizeRoles('admin'), ptShadow, getAdminAnalytics);

module.exports = router;
