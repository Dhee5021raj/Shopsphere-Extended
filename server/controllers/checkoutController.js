const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const User = require('../models/User');
const { checkTransactionSupport } = require('../utils/dbSupport');
const { purgeOrphanedCartItems } = require('../services/cartService');
const {
  acquireUserCheckoutLock,
  getIdempotentResponse,
  setIdempotentResponse,
  clearIdempotencyKey
} = require('../services/checkoutIdempotencyService');
const { isCODPaymentMethod } = require('../services/orderLifecycleService');

// @desc    Process Multi-Vendor Order Checkout
//          Uses MongoDB Multi-Document ACID Transactions on Replica Sets.
//          Gracefully falls back to a 2-phase Sequential Execution with Atomic Conditional
//          Decrements & Compensating Rollbacks on Standalone MongoDB instances.
//          Protected by Per-User In-Flight Concurrency Mutex and Request Idempotency Key.
// @route   POST /api/checkout
const processCheckout = async (req, res) => {
  const { shippingAddress, paymentMethod = 'Card' } = req.body;

  // Extract idempotency key if provided by client (headers take precedence over body)
  const headers = req.headers || {};
  const idempotencyKey =
    headers['idempotency-key'] ||
    headers['x-idempotency-key'] ||
    req.body?.idempotencyKey;

  // 1. Check for cached idempotent response before acquiring locks
  if (idempotencyKey && req.user?._id) {
    const cachedResponse = getIdempotentResponse(idempotencyKey, req.user._id);
    if (cachedResponse) {
      return res.status(cachedResponse.status || 200).json(cachedResponse.body);
    }
  }

  // 2. Validate Customer and basic input requirements
  if (!shippingAddress || !shippingAddress.street || !shippingAddress.city || !shippingAddress.zipCode) {
    return res.status(400).json({ message: 'Complete shipping address is required' });
  }

  if (!req.user?._id) {
    return res.status(401).json({ message: 'User authentication required' });
  }

  // 3. Acquire Per-User In-Flight Checkout Lock
  let releaseCheckoutLock;
  try {
    releaseCheckoutLock = acquireUserCheckoutLock(req.user._id);
  } catch (lockError) {
    return res.status(lockError.statusCode || 409).json({ message: lockError.message });
  }

  try {
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
      console.log('[ShopSphere Checkout] Standalone MongoDB detected: Running atomic conditional updates with compensating rollbacks.');
    }

    // Stack of compensating rollback actions for standalone sequential execution
    const compensationStack = [];

    try {
      // PRE-VALIDATION PASS:
      // Verify all products exist and check current stock levels
      for (const item of cart.items) {
        const prodCheck = isTransactionSupported && session
          ? await Product.findById(item.product).session(session)
          : await Product.findById(item.product);

        if (!prodCheck || prodCheck.isActive === false) {
          await Cart.updateOne(
            { _id: cart._id },
            { $pull: { items: { product: item.product } } }
          );
          throw new Error('Product not found or has been removed from marketplace.');
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
        const requestedQty = Number(item.quantity);

        if (isTransactionSupported && session) {
          // In Replica Set mode: session provides ACID multi-document snapshot isolation
          product = await Product.findById(item.product).session(session);

          if (!product || product.isActive === false) {
            await Cart.updateOne(
              { _id: cart._id },
              { $pull: { items: { product: item.product } } }
            );
            throw new Error('Product not found or has been removed from marketplace.');
          }

          if (product.stock < requestedQty) {
            throw new Error(
              `Insufficient stock for "${product.name}". Requested: ${requestedQty}, Available: ${product.stock}`
            );
          }

          product.stock -= requestedQty;
          product.soldCount = (product.soldCount || 0) + requestedQty;
          await product.save({ session });
        } else {
          // Standalone Mode: Conditional atomic update preventing overselling and race conditions
          product = await Product.findOneAndUpdate(
            {
              _id: item.product,
              stock: { $gte: requestedQty },
              isActive: { $ne: false }
            },
            {
              $inc: {
                stock: -requestedQty,
                soldCount: requestedQty
              }
            },
            { new: true }
          );

          if (!product) {
            // Determine whether product was missing/inactive or had insufficient stock
            const existingProd = await Product.findById(item.product);
            if (!existingProd || existingProd.isActive === false) {
              await Cart.updateOne(
                { _id: cart._id },
                { $pull: { items: { product: item.product } } }
              );
              throw new Error('Product not found or has been removed from marketplace.');
            }
            throw new Error(
              `Insufficient stock for "${existingProd.name}". Requested: ${requestedQty}, Available: ${existingProd.stock}`
            );
          }

          // Register atomic compensating action to revert inventory if subsequent steps fail
          const prodId = product._id;
          compensationStack.push(async () => {
            await Product.findByIdAndUpdate(prodId, {
              $inc: { stock: requestedQty, soldCount: -requestedQty }
            });
          });
        }

        const actualUnitPrice = product.discountPrice > 0 ? product.discountPrice : product.price;
        const itemSubtotal = actualUnitPrice * requestedQty;
        subtotalAmount += itemSubtotal;

        orderItems.push({
          product: product._id,
          vendor: product.vendor,
          name: product.name,
          quantity: requestedQty,
          price: actualUnitPrice,
          status: 'Pending'
        });
      }

      // Totals (Tax + Shipping)
      const shippingFee = subtotalAmount > 1000 ? 0 : 99;
      const taxFee = Math.round(subtotalAmount * 0.18);
      const finalTotal = subtotalAmount + shippingFee + taxFee;

      // Determine COD vs Prepaid Payment Status
      const isCOD = isCODPaymentMethod(paymentMethod);
      const resolvedPaymentMethod = isCOD ? 'COD' : paymentMethod;
      const initialPaymentStatus = isCOD ? 'Pending' : 'Paid';

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
        paymentStatus: initialPaymentStatus,
        paymentMethod: resolvedPaymentMethod,
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

      const responsePayload = {
        message,
        transactionStatus,
        isAcidReplicaSet: isTransactionSupported,
        order: populatedOrder
      };

      // Cache successful response if idempotency key was supplied
      if (idempotencyKey) {
        setIdempotentResponse(idempotencyKey, req.user._id, 201, responsePayload);
      }

      return res.status(201).json(responsePayload);
    } catch (error) {
      // Abort replica set transaction OR execute compensating rollback for standalone
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

      // If an idempotency key was used and request failed, clear it so user can retry
      if (idempotencyKey) {
        clearIdempotencyKey(idempotencyKey, req.user._id);
      }

      console.error('[ShopSphere Checkout Aborted]:', error.message);
      return res.status(400).json({
        message: `Checkout failed & transaction aborted: ${error.message}`,
        transactionStatus: isTransactionSupported ? 'ABORTED_REPLICA_SET_ACID' : 'ROLLED_BACK_STANDALONE_SEQUENTIAL',
        isAcidReplicaSet: isTransactionSupported
      });
    }
  } finally {
    // Always release per-user in-flight lock
    if (releaseCheckoutLock) {
      releaseCheckoutLock();
    }
  }
};

module.exports = { processCheckout, checkTransactionSupport };
