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
    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

/* 
  ========================================================
  DEMO MONGODB INDEXES (Viva / DB Project Requirements)
  ========================================================
  1. TEXT INDEX: Used for full-text search across product name and description
  2. COMPOUND INDEX 1: Accelerates queries filtering by category and sorting by price
  3. COMPOUND INDEX 2: Accelerates vendor dashboard queries fetching latest vendor products
*/
productSchema.index({ name: 'text', description: 'text' }, { weights: { name: 10, description: 5 } });
productSchema.index({ category: 1, price: 1 });
productSchema.index({ vendor: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
