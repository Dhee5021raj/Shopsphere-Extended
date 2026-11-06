const express = require('express');
const router = express.Router();
const {
  createReview,
  getProductReviews,
  updateReview,
  deleteReview
} = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');

router.get('/product/:productId', getProductReviews);
router.post('/', protect, createReview);
router.route('/:id')
  .put(protect, updateReview)
  .delete(protect, deleteReview);

module.exports = router;
