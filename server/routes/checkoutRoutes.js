const express = require('express');
const router = express.Router();
const { processCheckout } = require('../controllers/checkoutController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, processCheckout);

module.exports = router;
