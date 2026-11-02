const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  toggleBlockUser,
  getAllVendorsAdmin,
  updateVendorStatus,
  getAllOrdersAdmin,
  updateOrderStatusAdmin,
  getPtLog,
  getPtStatus,
  getPtMetrics,
} = require('../controllers/adminController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorizeRoles('admin'));

router.get('/users', getAllUsers);
router.put('/users/:id/block', toggleBlockUser);

router.get('/vendors', getAllVendorsAdmin);
router.put('/vendors/:id/status', updateVendorStatus);

router.get('/orders', getAllOrdersAdmin);
router.put('/orders/:id/status', updateOrderStatusAdmin);

// mongo-pt shadow log (Step 7)
router.get('/pt-log', getPtLog);
// live measurement status for the run-indicator chip
router.get('/pt-status', getPtStatus);
// aggregate performance metrics for the dashboard
router.get('/pt-metrics', getPtMetrics);

module.exports = router;
