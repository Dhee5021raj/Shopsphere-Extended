const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const { getJwtSecret } = require('../config/jwt');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, getJwtSecret());
      
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'User not found or token invalid' });
      }

      if (req.user.isBlocked) {
        return res.status(403).json({ message: 'Your account has been suspended by administration' });
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Role '${req.user ? req.user.role : 'none'}' is not authorized`
      });
    }
    next();
  };
};

const authorizeVendor = async (req, res, next) => {
  if (req.user.role !== 'vendor' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access restricted to approved Vendors' });
  }

  if (req.user.role === 'vendor') {
    const vendor = await Vendor.findOne({ user: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor store profile not found' });
    }
    if (vendor.status !== 'approved') {
      return res.status(403).json({ message: `Vendor account status is '${vendor.status}'. Awaiting Admin approval.` });
    }
    req.vendor = vendor;
  }
  next();
};

module.exports = { protect, authorizeRoles, authorizeVendor };
