const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const User = require('../models/User');
const { checkTransactionSupport } = require('../utils/dbSupport');
const { purgeOrphanedCartItems } = require('../services/cartService');

// @desc    Process Multi-Vendor Order Checkout
//          Uses MongoDB Multi-Document ACID Transactions on Replica Sets.
//          Gracefully falls back to a 2-phase Sequential Execution with Compensating
//          Rollbacks on Standalone MongoDB instances (never falsely claiming ACID guarantees).
// @route   POST /api/checkout
const processCheckout = async (req, res) => {
  const { shippingAddress, paymentMethod = 'Card' } = req.body;

  if (!shippingAddress || !shippingAddress.street || !shippingAddress.city || !shippingAddress.zipCode) {
    return res.status(400).json({ message: 'Complete shipping address is required' });
  }

  // 1. Validate Customer
  const customer = await User.findById(req.user._id);
  if (!customer) {
    return res.status(404).json({ message: 'Customer account not found' });
  }

  // Retrieve user cart
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart || cart.items.length === 0) {
    return res.status(400).json({ message: 'Your cart is empty' });
  }

  // Atomically purge any orphaned/deleted products before transaction execution
  const { hasOrphans } = await purgeOrphanedCartItems(cart, false);
  if (cart.items.length === 0) {
    return res.status(400).json({
      message: 'Your cart contained items that are no longer available and have been removed. Your cart is now empty.'
    });
  }
  if (hasOrphans) {
    return res.status(400).json({
      message: 'One or more items in your cart are no longer available and have been removed. Please review your cart before checking out.'
    });
  }

  let session = null;
  const isTransactionSupported = checkTransactionSupport();

  if (isTransactionSupported) {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (sessionErr) {
      console.warn('[ShopSphere Checkout] Failed to start MongoDB session transaction:', sessionErr.message);
      session = null;
    }
  } else {
    console.log('[ShopSphere Checkout] Standalone MongoDB detected: Running sequential execution protected by compensating rollbacks.');
  }

  // Stack of compensating rollback actions for standalone sequential execution
  const compensationStack = [];

  try {
    // PRE-VALIDATION PASS:
    // Before executing any mutations in sequential fallback mode, verify all products exist and have sufficient stock.
    for (const item of cart.items) {
      const prodCheck = isTransactionSupported && session
        ? await Product.findById(item.product).session(session)
        : await Product.findById(item.product);

      if (!prodCheck) {
        await Cart.updateOne(
          { _id: cart._id },
          { $pull: { items: { product: item.product } } }
        );
        throw new Error(`Product not found or has been removed from marketplace.`);
      }

      if (prodCheck.stock < item.quantity) {
        throw new Error(
          `Insufficient stock for "${prodCheck.name}". Requested: ${item.quantity}, Available: ${prodCheck.stock}`
        );
      }
    }

    // MUTATION PASS:
    const orderItems = [];
    let subtotalAmount = 0;

    for (const item of cart.items) {
      let product;
      if (isTransactionSupported && session) {
        product = await Product.findById(item.product).session(session);
      } else {
        product = await Product.findById(item.product);
      }

      if (!product) {
        await Cart.updateOne(
          { _id: cart._id },
          { $pull: { items: { product: item.product } } }
        );
        throw new Error(`Product not found or has been removed from marketplace.`);
      }

      if (product.stock < item.quantity) {
        throw new Error(
          `Insufficient stock for "${product.name}". Requested: ${item.quantity}, Available: ${product.stock}`
        );
      }

      const actualUnitPrice = product.discountPrice > 0 ? product.discountPrice : product.price;
      const itemSubtotal = actualUnitPrice * item.quantity;
      subtotalAmount += itemSubtotal;

      // Deduct inventory & increase soldCount
      product.stock -= item.quantity;
      product.soldCount += item.quantity;

      if (isTransactionSupported && session) {
        await product.save({ session });
      } else {
        await product.save();
        // Register compensating action to revert inventory if subsequent steps fail
        const productId = product._id;
        const qty = item.quantity;
        compensationStack.push(async () => {
          await Product.findByIdAndUpdate(productId, {
            $inc: { stock: qty, soldCount: -qty }
          });
        });
      }

      orderItems.push({
        product: product._id,
        vendor: product.vendor,
        name: product.name,
        quantity: item.quantity,
        price: actualUnitPrice,
        status: 'Pending'
      });
    }

    // Totals (Tax + Shipping)
    const shippingFee = subtotalAmount > 1000 ? 0 : 99;
    const taxFee = Math.round(subtotalAmount * 0.18);
    const finalTotal = subtotalAmount + shippingFee + taxFee;

    // Create Multi-Vendor Order
    let order;
    const orderData = {
      customer: customer._id,
      items: orderItems,
      shippingAddress: {
        street: shippingAddress.street,
        city: shippingAddress.city,
        state: shippingAddress.state || 'State',
        zipCode: shippingAddress.zipCode,
        country: shippingAddress.country || 'India'
      },
      totalAmount: finalTotal,
      paymentStatus: 'Paid',
      paymentMethod,
      orderStatus: 'Processing'
    };

    if (isTransactionSupported && session) {
      const createdOrders = await Order.create([orderData], { session });
      order = createdOrders[0];

      // Clear customer cart inside transaction
      cart.items = [];
      await cart.save({ session });

      // Commit transaction
      await session.commitTransaction();
      session.endSession();
      session = null;
    } else {
      order = await Order.create(orderData);
      // If cart.save fails in standalone mode, delete the created order as compensation
      compensationStack.push(async () => {
        await Order.findByIdAndDelete(order._id);
      });

      cart.items = [];
      await cart.save();
    }

    const populatedOrder = await Order.findById(order._id)
      .populate('items.product', 'name images')
      .populate('items.vendor', 'storeName storeSlug');

    const transactionStatus = isTransactionSupported
      ? 'COMMITTED_REPLICA_SET_ACID'
      : 'COMMITTED_STANDALONE_SEQUENTIAL';

    const message = isTransactionSupported
      ? 'Checkout completed successfully via MongoDB Multi-Document ACID Transaction!'
      : 'Checkout completed successfully via Sequential Execution (Compensating Rollback Protected)!';

    return res.status(201).json({
      message,
      transactionStatus,
      isAcidReplicaSet: isTransactionSupported,
      order: populatedOrder
    });
  } catch (error) {
    // If anything fails: abort replica set transaction OR execute compensating rollback for standalone
    if (isTransactionSupported && session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error('[ShopSphere Transaction Abort Error]:', abortErr.message);
      } finally {
        try {
          session.endSession();
        } catch (_) {}
        session = null;
      }
    } else if (compensationStack.length > 0) {
      console.warn(`[ShopSphere Standalone Rollback] Triggering ${compensationStack.length} compensating actions...`);
      for (const compensate of compensationStack.reverse()) {
        try {
          await compensate();
        } catch (compErr) {
          console.error('[ShopSphere Compensation Action Failed]:', compErr.message);
        }
      }
    }

    console.error('[ShopSphere Checkout Aborted]:', error.message);
    return res.status(400).json({
      message: `Checkout failed & transaction aborted: ${error.message}`,
      transactionStatus: isTransactionSupported ? 'ABORTED_REPLICA_SET_ACID' : 'ROLLED_BACK_STANDALONE_SEQUENTIAL',
      isAcidReplicaSet: isTransactionSupported
    });
  }
};

module.exports = { processCheckout, checkTransactionSupport };
