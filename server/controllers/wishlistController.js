const Wishlist = require('../models/Wishlist');

const getWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id })
      .populate({
        path: 'products',
        populate: [
          { path: 'category', select: 'name slug' },
          { path: 'vendor', select: 'storeName storeSlug logo' }
        ]
      });

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }

    res.json(wishlist.products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }

    if (!wishlist.products.includes(productId)) {
      wishlist.products.push(productId);
      await wishlist.save();
    }

    const updated = await Wishlist.findOne({ user: req.user._id }).populate({
      path: 'products',
      populate: [
        { path: 'category', select: 'name slug' },
        { path: 'vendor', select: 'storeName storeSlug logo' }
      ]
    });

    res.json(updated.products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    let wishlist = await Wishlist.findOne({ user: req.user._id });

    if (wishlist) {
      wishlist.products = wishlist.products.filter(
        (p) => p.toString() !== productId
      );
      await wishlist.save();
    }

    const updated = await Wishlist.findOne({ user: req.user._id }).populate({
      path: 'products',
      populate: [
        { path: 'category', select: 'name slug' },
        { path: 'vendor', select: 'storeName storeSlug logo' }
      ]
    });

    res.json(updated ? updated.products : []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist
};
