const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

// Prevent duplicate review for the same product by the same user
reviewSchema.index({ user: 1, product: 1 }, { unique: true });

// Compound index to accelerate product reviews retrieval sorted by date
reviewSchema.index({ product: 1, createdAt: -1 });

// Compound index to accelerate vendor rating aggregation and reviews lookup
reviewSchema.index({ vendor: 1, rating: 1 });

module.exports = mongoose.model('Review', reviewSchema);
