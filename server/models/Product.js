const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, default: 0, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    images: [{ type: String, required: true }],
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

/* 
  ========================================================
  TARGETED MONGODB INDEXES
  ========================================================
  1. TEXT INDEX: Used for full-text search across product name and description
  2. COMPOUND INDEX 1: Accelerates queries filtering by category and sorting by price
  3. COMPOUND INDEX 2: Accelerates vendor storefront / dashboard queries fetching latest vendor products
  4. COMPOUND INDEX 3: Accelerates catalog browsing filtering by category with default newest sort
  5. COMPOUND INDEX 4: Accelerates homepage featured products queries
  6. COMPOUND INDEX 5: Accelerates trending products queries filtering in-stock and sorting by popularity & rating
*/
productSchema.index({ name: 'text', description: 'text' }, { weights: { name: 10, description: 5 } });
productSchema.index({ category: 1, price: 1 });
productSchema.index({ vendor: 1, createdAt: -1 });
productSchema.index({ category: 1, createdAt: -1 });
productSchema.index({ isFeatured: 1, createdAt: -1 });
productSchema.index({ stock: 1, soldCount: -1, rating: -1 });

module.exports = mongoose.model('Product', productSchema);
