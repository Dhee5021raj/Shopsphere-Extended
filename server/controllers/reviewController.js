const Review = require('../models/Review');
const Product = require('../models/Product');
const ratingService = require('../services/ratingService');

// @desc    Create product review (Only if customer purchased product)
// @route   POST /api/reviews
const createReview = async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;

    const numRating = Number(rating);
    if (!rating || isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ message: 'Rating must be a number between 1 and 5' });
    }

    if (!comment || typeof comment !== 'string' || comment.trim() === '') {
      return res.status(400).json({ message: 'Review comment is required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if customer legitimately purchased this product (excluding cancelled orders/items)
    const { eligible } = await ratingService.verifyPurchaseEligibility({
      userId: req.user._id,
      productId,
      role: req.user.role
    });

    if (!eligible) {
      return res.status(403).json({
        message: 'Verified Purchase Required: You can only review products you have purchased on ShopSphere.'
      });
    }

    // Check if review already exists for this product by this user
    const alreadyReviewed = await Review.findOne({
      user: req.user._id,
      product: productId
    });

    if (alreadyReviewed) {
      return res.status(400).json({ message: 'You have already submitted a review for this product.' });
    }

    const review = await Review.create({
      user: req.user._id,
      product: productId,
      vendor: product.vendor,
      rating: numRating,
      comment: comment.trim()
    });

    // Recalculate product and vendor ratings atomically via database aggregation
    await ratingService.recalculateProductAndVendorRatings({
      productId,
      vendorId: product.vendor
    });

    const populatedReview = await Review.findById(review._id).populate('user', 'name avatar');
    res.status(201).json(populatedReview);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get reviews for a product
// @route   GET /api/reviews/product/:productId
const getProductReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ product: req.params.productId })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .lean();

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update an existing review
// @route   PUT /api/reviews/:id
const updateReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Verify ownership or admin privileges
    if (review.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized to modify this review' });
    }

    if (rating !== undefined) {
      const numRating = Number(rating);
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({ message: 'Rating must be a number between 1 and 5' });
      }
      review.rating = numRating;
    }

    if (comment !== undefined) {
      if (typeof comment !== 'string' || comment.trim() === '') {
        return res.status(400).json({ message: 'Review comment cannot be empty' });
      }
      review.comment = comment.trim();
    }

    await review.save();

    // Recalculate product and vendor ratings atomically
    await ratingService.recalculateProductAndVendorRatings({
      productId: review.product,
      vendorId: review.vendor
    });

    const populatedReview = await Review.findById(review._id).populate('user', 'name avatar');
    res.json(populatedReview);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a review
// @route   DELETE /api/reviews/:id
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Verify ownership or admin privileges
    if (review.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized to delete this review' });
    }

    const productId = review.product;
    const vendorId = review.vendor;

    await Review.findByIdAndDelete(req.params.id);

    // Recalculate product and vendor ratings atomically after deletion
    await ratingService.recalculateProductAndVendorRatings({
      productId,
      vendorId
    });

    res.json({ message: 'Review successfully removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createReview,
  getProductReviews,
  updateReview,
  deleteReview
};
