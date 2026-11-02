const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Order = require('../models/Order');
const inventoryService = require('../services/inventoryService');

// @desc    Get all public approved vendors
// @route   GET /api/vendors
const getVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({ status: 'approved' })
      .populate('user', 'name email avatar')
      .sort({ rating: -1, totalSales: -1 });

    res.json(vendors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get vendor storefront details & products by storeSlug
// @route   GET /api/vendors/store/:slug
const getVendorStoreBySlug = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ storeSlug: req.params.slug, status: 'approved' })
      .populate('user', 'name email avatar createdAt');

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor store not found or account pending approval' });
    }

    const products = await Product.find({ vendor: vendor._id })
      .populate('category', 'name slug')
      .sort({ createdAt: -1 });

    res.json({
      vendor,
      products
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get vendor dashboard overview stats (Scoped to logged-in Vendor)
// @route   GET /api/vendors/dashboard/stats
const getVendorDashboardStats = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    const totalProducts = await Product.countDocuments({ vendor: vendor._id });

    // Aggregate orders containing vendor's products
    const ordersWithVendorItems = await Order.find({ 'items.vendor': vendor._id });
    
    let totalSalesCount = 0;
    let totalRevenue = 0;

    ordersWithVendorItems.forEach(order => {
      order.items.forEach(item => {
        if (item.vendor.toString() === vendor._id.toString() && item.status !== 'Cancelled') {
          totalSalesCount += item.quantity;
          totalRevenue += item.price * item.quantity;
        }
      });
    });

    res.json({
      storeName: vendor.storeName,
      status: vendor.status,
      rating: vendor.rating,
      numRatings: vendor.numRatings,
      totalProducts,
      totalOrders: ordersWithVendorItems.length,
      totalSalesCount,
      totalRevenue
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get orders containing vendor's products
// @route   GET /api/vendors/orders
const getVendorOrders = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ user: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    const orders = await Order.find({ 'items.vendor': vendor._id })
      .populate('customer', 'name email avatar')
      .sort({ createdAt: -1 });

    // Filter items inside order to only return vendor's items
    const vendorScopedOrders = orders.map(order => {
      const vendorItems = order.items.filter(
        item => item.vendor.toString() === vendor._id.toString()
      );
      return {
        _id: order._id,
        customer: order.customer,
        shippingAddress: order.shippingAddress,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        items: vendorItems,
        vendorSubtotal: vendorItems.reduce((acc, item) => acc + item.price * item.quantity, 0)
      };
    });

    res.json(vendorScopedOrders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update status of a specific order item belonging to vendor
// @route   PUT /api/vendors/orders/:orderId/items/:itemId/status
const updateVendorOrderItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status } = req.body;

    if (status === 'Cancelled') {
      const result = await inventoryService.cancelVendorOrderItem({
        orderId,
        itemId,
        vendorUserId: req.user._id
      });
      return res.json({
        message: 'Order item status updated successfully',
        item: result.item,
        order: result.order,
        executionMode: result.executionMode
      });
    }

    const vendor = await Vendor.findOne({ user: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.orderStatus === 'Cancelled') {
      return res.status(400).json({ message: 'Cannot update item in an order that is already Cancelled' });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Order item not found' });
    }

    // Verify item vendor ownership
    if (item.vendor.toString() !== vendor._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized: Item does not belong to your store' });
    }

    if (item.status === 'Cancelled') {
      return res.status(400).json({ message: 'Cannot update status of a cancelled item' });
    }

    item.status = status;
    await order.save();

    res.json({ message: 'Order item status updated successfully', item });
  } catch (error) {
    const errStatus = error.statusCode || error.status || 500;
    res.status(errStatus).json({ message: error.message });
  }
};

module.exports = {
  getVendors,
  getVendorStoreBySlug,
  getVendorDashboardStats,
  getVendorOrders,
  updateVendorOrderItemStatus
};
