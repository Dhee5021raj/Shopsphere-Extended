const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    icon: { type: String, default: 'Package' },
    image: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
