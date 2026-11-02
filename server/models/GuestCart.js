const mongoose = require('mongoose');

const guestCartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  priceAtAdd: { type: Number, required: true }
});

const guestCartSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    items: [guestCartItemSchema]
  },
  { timestamps: true }
);

/*
  ========================================================
  DEMO MONGODB TTL INDEX (Viva / DB Project Requirements)
  ========================================================
  Automatically purges temporary guest cart sessions after 24 hours (86400 seconds).
  Demonstrates MongoDB native time-to-live indexing.
*/
guestCartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('GuestCart', guestCartSchema);
