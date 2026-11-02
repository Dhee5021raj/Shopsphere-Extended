const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');

// @desc    Create product review (Only if customer purchased product)
// @route   POST /api/reviews
const createReview = async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if customer has purchased this product
    const hasPurchased = await Order.findOne({
      customer: req.user._id,
      'items.product': productId
    });

    if (!hasPurchased && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Verified Purchase Required: You can only review products you have purchased on ShopSphere.'
      });
    }

    // Check if review already exists
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
      rating: Number(rating),
      comment
    });

    // Recalculate average product rating
    const reviews = await Review.find({ product: productId });
    const avgRating = reviews.reduce((acc, item) => item.rating + acc, 0) / reviews.length;

    product.numReviews = reviews.length;
    product.rating = Number(avgRating.toFixed(1));
    await product.save();

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
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createReview,
  getProductReviews
};
