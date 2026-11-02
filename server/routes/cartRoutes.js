const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  syncGuestCart
} = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');
const { getJwtSecret } = require('../config/jwt');

// Middleware to optionally attach req.user if Bearer token is provided
const optionalAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, getJwtSecret());
      req.user = await User.findById(decoded.id).select('-password');
    } catch (error) {
      // Ignore token failure for guest cart
    }
  }
  next();
};

router.get('/', optionalAuth, getCart);
router.post('/add', optionalAuth, addToCart);
router.put('/update', optionalAuth, updateCartItem);
router.delete('/item/:productId', optionalAuth, removeFromCart);
router.post('/sync', protect, syncGuestCart);

module.exports = router;
