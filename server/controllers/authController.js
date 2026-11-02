const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Cart = require('../models/Cart');
const generateToken = require('../utils/generateToken');

// @desc    Register a new customer
// @route   POST /api/auth/register
const registerCustomer = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'customer'
    });

    // Create empty cart for customer
    await Cart.create({ user: user._id, items: [] });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new seller/vendor
// @route   POST /api/auth/register-vendor
const registerVendor = async (req, res) => {
  try {
    const { name, email, password, storeName, description } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    let storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const slugExists = await Vendor.findOne({ storeSlug });
    if (slugExists) {
      storeSlug = `${storeSlug}-${Date.now().toString().slice(-4)}`;
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'vendor'
    });

    const vendor = await Vendor.create({
      user: user._id,
      storeName,
      storeSlug,
      description: description || `Welcome to ${storeName}`,
      status: 'approved' // Auto-approve for seamless demo testing, admin can manage status
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      vendor: {
        _id: vendor._id,
        storeName: vendor.storeName,
        storeSlug: vendor.storeSlug,
        status: vendor.status
      },
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      if (user.isBlocked) {
        return res.status(403).json({ message: 'Account has been blocked by administrator' });
      }

      let vendorData = null;
      if (user.role === 'vendor') {
        vendorData = await Vendor.findOne({ user: user._id });
      }

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        addresses: user.addresses,
        vendor: vendorData,
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    let vendorData = null;

    if (user.role === 'vendor') {
      vendorData = await Vendor.findOne({ user: user._id });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      addresses: user.addresses,
      vendor: vendorData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile & addresses
// @route   PUT /api/auth/profile
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      if (req.body.avatar) user.avatar = req.body.avatar;
      if (req.body.addresses) user.addresses = req.body.addresses;

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();
      
      let vendorData = null;
      if (user.role === 'vendor') {
        vendorData = await Vendor.findOne({ user: user._id });
      }

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        avatar: updatedUser.avatar,
        addresses: updatedUser.addresses,
        vendor: vendorData,
        token: generateToken(updatedUser._id)
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerCustomer,
  registerVendor,
  loginUser,
  getMe,
  updateProfile
};
