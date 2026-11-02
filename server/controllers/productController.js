const Product = require('../models/Product');
const Vendor = require('../models/Vendor');

// @desc    Get all products with Text Search, Filters, Sorting & Pagination
// @route   GET /api/products
const getProducts = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const query = {};

    // 1. MONGODB TEXT INDEX SEARCH
    if (req.query.search && req.query.search.trim() !== '') {
      query.$text = { $search: req.query.search.trim() };
    }

    // 2. CATEGORY FILTER (Uses Compound Index: category + price)
    if (req.query.category && req.query.category !== 'all') {
      query.category = req.query.category;
    }

    // 3. VENDOR FILTER (Uses Compound Index: vendor + createdAt)
    if (req.query.vendor) {
      query.vendor = req.query.vendor;
    }

    // 4. PRICE RANGE FILTER
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = Number(req.query.maxPrice);
    }

    // 5. RATING FILTER
    if (req.query.minRating) {
      query.rating = { $gte: Number(req.query.minRating) };
    }

    // 6. IN-STOCK FILTER
    if (req.query.inStock === 'true') {
      query.stock = { $gt: 0 };
    }

    // 7. FEATURED FILTER
    if (req.query.featured === 'true') {
      query.isFeatured = true;
    }

    // SORTING LOGIC
    let sortOptions = { createdAt: -1 }; // Default: Newest
    if (req.query.sort === 'price_asc') sortOptions = { price: 1 };
    if (req.query.sort === 'price_desc') sortOptions = { price: -1 };
    if (req.query.sort === 'rating') sortOptions = { rating: -1 };
    if (req.query.sort === 'popularity') sortOptions = { soldCount: -1 };

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate('category', 'name slug icon')
      .populate('vendor', 'storeName storeSlug logo rating')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    res.json({
      products,
      page,
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug icon description')
      .populate('vendor', 'storeName storeSlug logo banner rating description user');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get featured products
// @route   GET /api/products/featured
const getFeaturedProducts = async (req, res) => {
  try {
    const products = await Product.find({ isFeatured: true })
      .populate('category', 'name slug')
      .populate('vendor', 'storeName storeSlug logo rating')
      .limit(8);

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get trending products using MongoDB Aggregation (top sold items)
// @route   GET /api/products/trending
const getTrendingProducts = async (req, res) => {
  try {
    const products = await Product.find({ stock: { $gt: 0 } })
      .populate('category', 'name slug')
      .populate('vendor', 'storeName storeSlug logo rating')
      .sort({ soldCount: -1, rating: -1 })
      .limit(8);

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get related products
// @route   GET /api/products/:id/related
const getRelatedProducts = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const related = await Product.find({
      category: product.category,
      _id: { $ne: product._id }
    })
      .populate('category', 'name slug')
      .populate('vendor', 'storeName storeSlug logo rating')
      .limit(4);

    res.json(related);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new product (Vendor only)
// @route   POST /api/products
const createProduct = async (req, res) => {
  try {
    const { name, description, price, discountPrice, stock, category, images, isFeatured } = req.body;

    let vendorId;
    if (req.user.role === 'admin') {
      if (!req.body.vendor) {
        return res.status(400).json({ message: 'Vendor ID is required when creating as Admin' });
      }
      vendorId = req.body.vendor;
    } else {
      const vendor = await Vendor.findOne({ user: req.user._id });
      if (!vendor) {
        return res.status(404).json({ message: 'Vendor profile not found' });
      }
      if (vendor.status !== 'approved') {
        return res.status(403).json({ message: 'Only approved vendors can list products' });
      }
      vendorId = vendor._id;
    }

    const product = await Product.create({
      name,
      description,
      price: Number(price),
      discountPrice: discountPrice ? Number(discountPrice) : 0,
      stock: Number(stock),
      category,
      vendor: vendorId,
      images: images && images.length > 0 ? images : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'],
      isFeatured: isFeatured || false
    });

    const populated = await Product.findById(product._id)
      .populate('category', 'name slug')
      .populate('vendor', 'storeName storeSlug');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update product (Vendor owner or Admin)
// @route   PUT /api/products/:id
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Verify vendor ownership if role is vendor
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ user: req.user._id });
      if (!vendor || product.vendor.toString() !== vendor._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized: You can only edit your own products' });
      }
    }

    const { name, description, price, discountPrice, stock, category, images, isFeatured } = req.body;

    if (name) product.name = name;
    if (description) product.description = description;
    if (price !== undefined) product.price = Number(price);
    if (discountPrice !== undefined) product.discountPrice = Number(discountPrice);
    if (stock !== undefined) product.stock = Number(stock);
    if (category) product.category = category;
    if (images) product.images = images;
    if (isFeatured !== undefined) product.isFeatured = isFeatured;

    const updatedProduct = await product.save();
    const populated = await Product.findById(updatedProduct._id)
      .populate('category', 'name slug')
      .populate('vendor', 'storeName storeSlug');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete product (Vendor owner or Admin)
// @route   DELETE /api/products/:id
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Verify vendor ownership
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ user: req.user._id });
      if (!vendor || product.vendor.toString() !== vendor._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized: You can only delete your own products' });
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product successfully removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  getFeaturedProducts,
  getTrendingProducts,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct
};
