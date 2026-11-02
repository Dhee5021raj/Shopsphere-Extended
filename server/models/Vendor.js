const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    storeName: { type: String, required: true, trim: true },
    storeSlug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true },
    logo: { type: String, default: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=200' },
    banner: { type: String, default: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    rating: { type: Number, default: 0 },
    numRatings: { type: Number, default: 0 },
    totalSales: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vendor', vendorSchema);
