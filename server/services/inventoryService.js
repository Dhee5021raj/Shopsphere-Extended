'use strict';
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const { checkTransactionSupport } = require('../utils/dbSupport');
const { syncOrderLifecycle } = require('./orderLifecycleService');

// In-memory mutex to serialize concurrent cancellations for the same order
const activeOrderCancellations = new Set();

/**
 * Acquire in-memory cancellation lock for an order
 * @param {string|mongoose.Types.ObjectId} orderId
 * @returns {Function} release lock callback
 */
const acquireOrderLock = (orderId) => {
  const key = orderId.toString();
  if (activeOrderCancellations.has(key)) {
    const error = new Error('Cancellation already in progress for this order');
    error.statusCode = 409;
    throw error;
  }
  activeOrderCancellations.add(key);
  return () => {
    activeOrderCancellations.delete(key);
  };
};

/**
 * Restore inventory stock and decrement soldCount for an array of items.
 * Handles missing/deleted products gracefully without throwing.
 * Automatically aggregates quantities if multiple items point to the same product.
 *
 * @param {Array} items - Array of items with { product, quantity }
 * @param {mongoose.ClientSession|null} session - Optional MongoDB session for replica sets
 * @returns {Promise<{ restored: Array, compensationStack: Array }>}
 */
const restoreInventoryItems = async (items, session = null) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { restored: [], compensationStack: [] };
  }

  // Aggregate quantities by product ID to avoid duplicate updates
  const qtyByProduct = new Map();
  for (const item of items) {
    if (!item.product) continue;
    const qty = Number(item.quantity);
    if (!qty || qty <= 0 || isNaN(qty)) continue;

    const prodId = item.product._id ? item.product._id.toString() : item.product.toString();
    qtyByProduct.set(prodId, (qtyByProduct.get(prodId) || 0) + qty);
  }

  const restored = [];
  const compensationStack = [];

  try {
    for (const [prodId, qtyToRestore] of qtyByProduct.entries()) {
      // Single atomic server-side update (relative to the current values), so a
      // concurrent checkout's $inc on the same product can never be overwritten
      // by a stale read-modify-write. soldCount is clamped at 0 in the pipeline.
      const before = await Product.findOneAndUpdate(
        { _id: prodId },
        [
          {
            $set: {
              stock: { $add: [{ $ifNull: ['$stock', 0] }, qtyToRestore] },
              soldCount: {
                $max: [0, { $subtract: [{ $ifNull: ['$soldCount', 0] }, qtyToRestore] }]
              }
            }
          }
        ],
        { new: false, session: session || undefined, projection: { stock: 1, soldCount: 1 } }
      ).lean();

      if (!before) {
        console.warn(`[InventoryService] Product ID ${prodId} not found in database; skipping stock restoration.`);
        continue;
      }

      const prevStock = before.stock || 0;
      const prevSoldCount = before.soldCount || 0;
      const newStock = prevStock + qtyToRestore;
      const newSoldCount = Math.max(0, prevSoldCount - qtyToRestore);

      if (!session) {
        // Record compensation action for standalone rollback
        const soldDelta = prevSoldCount - newSoldCount;
        compensationStack.push(async () => {
          await Product.findByIdAndUpdate(prodId, {
            $inc: { stock: -qtyToRestore, soldCount: soldDelta }
          });
        });
      }

      restored.push({
        productId: prodId,
        restoredQuantity: qtyToRestore,
        newStock,
        newSoldCount
      });
    }

    return {
      restored,
      compensationStack
    };
  } catch (err) {
    // If standalone and an error occurs inside the loop, rollback already restored products
    if (!session && compensationStack.length > 0) {
      for (const rollback of compensationStack.reverse()) {
        try {
          await rollback();
        } catch (rErr) {
          console.error('[InventoryService] Rollback error during stock restoration failure:', rErr);
        }
      }
    }
    throw err;
  }
};

/**
 * Customer whole-order cancellation.
 * Verifies customer ownership, checks order is not Shipped/Delivered/Cancelled,
 * restores stock for active items, transitions order & items to 'Cancelled'.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.orderId
 * @param {string|mongoose.Types.ObjectId} params.userId
 * @returns {Promise<{ order: Object, restoredItemsCount: number, executionMode: string }>}
 */
const cancelCustomerOrder = async ({ orderId, userId }) => {
  const releaseLock = acquireOrderLock(orderId);
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.customer.toString() !== userId.toString()) {
      const err = new Error('Not authorized to cancel this order');
      err.statusCode = 403;
      throw err;
    }

    if (order.orderStatus === 'Shipped' || order.orderStatus === 'Delivered') {
      const err = new Error(`Cannot cancel order that is already ${order.orderStatus}`);
      err.statusCode = 400;
      throw err;
    }

    if (order.orderStatus === 'Cancelled') {
      const err = new Error('Cannot cancel order that is already Cancelled');
      err.statusCode = 400;
      throw err;
    }

    // Only restore items that were not already Cancelled, Shipped, or Delivered
    const activeItems = order.items.filter(
      item => item.status !== 'Cancelled' && item.status !== 'Shipped' && item.status !== 'Delivered'
    );

    if (activeItems.length === 0) {
      const err = new Error('No cancellable items remain: all items are already Shipped, Delivered, or Cancelled');
      err.statusCode = 400;
      throw err;
    }

    const isTxnSupported = checkTransactionSupport();
    let executionMode;

    if (isTxnSupported) {
      executionMode = 'COMMITTED_REPLICA_SET_ACID';
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        await restoreInventoryItems(activeItems, session);

        activeItems.forEach(item => {
          item.status = 'Cancelled';
        });
        // Derive parent status from items: a fully cancelled order becomes 'Cancelled',
        // but already-Shipped/Delivered items keep the order Shipped/Delivered.
        syncOrderLifecycle(order);

        await order.save({ session });
        await session.commitTransaction();
      } catch (txnErr) {
        await session.abortTransaction();
        throw txnErr;
      } finally {
        session.endSession();
      }
    } else {
      executionMode = 'COMMITTED_STANDALONE_SEQUENTIAL';
      const { compensationStack } = await restoreInventoryItems(activeItems, null);

      activeItems.forEach(item => {
        item.status = 'Cancelled';
      });
      // Derive parent status from items: a fully cancelled order becomes 'Cancelled',
      // but already-Shipped/Delivered items keep the order Shipped/Delivered.
      syncOrderLifecycle(order);

      try {
        await order.save();
      } catch (saveErr) {
        for (const rollback of compensationStack.reverse()) {
          try {
            await rollback();
          } catch (rErr) {
            console.error('[InventoryService] Rollback error during order save failure:', rErr);
          }
        }
        throw saveErr;
      }
    }

    await order.populate('items.product', 'name images price');
    await order.populate('items.vendor', 'storeName storeSlug logo');

    return {
      order,
      restoredItemsCount: activeItems.length,
      executionMode
    };
  } finally {
    releaseLock();
  }
};

/**
 * Admin whole-order cancellation.
 * Verifies order is not Delivered/Cancelled, restores stock for active items,
 * transitions order & items to 'Cancelled'.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.orderId
 * @returns {Promise<{ order: Object, restoredItemsCount: number, executionMode: string }>}
 */
const cancelAdminOrder = async ({ orderId }) => {
  const releaseLock = acquireOrderLock(orderId);
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.orderStatus === 'Delivered') {
      const err = new Error('Cannot cancel order that is already Delivered');
      err.statusCode = 400;
      throw err;
    }

    if (order.orderStatus === 'Cancelled') {
      const err = new Error('Cannot cancel order that is already Cancelled');
      err.statusCode = 400;
      throw err;
    }

    const activeItems = order.items.filter(
      item => item.status !== 'Cancelled' && item.status !== 'Shipped' && item.status !== 'Delivered'
    );

    if (activeItems.length === 0) {
      const err = new Error('No cancellable items remain: all items are already Shipped, Delivered, or Cancelled');
      err.statusCode = 400;
      throw err;
    }

    const isTxnSupported = checkTransactionSupport();
    let executionMode;

    if (isTxnSupported) {
      executionMode = 'COMMITTED_REPLICA_SET_ACID';
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        await restoreInventoryItems(activeItems, session);

        activeItems.forEach(item => {
          item.status = 'Cancelled';
        });
        // Derive parent status from items: a fully cancelled order becomes 'Cancelled',
        // but already-Shipped/Delivered items keep the order Shipped/Delivered.
        syncOrderLifecycle(order);

        await order.save({ session });
        await session.commitTransaction();
      } catch (txnErr) {
        await session.abortTransaction();
        throw txnErr;
      } finally {
        session.endSession();
      }
    } else {
      executionMode = 'COMMITTED_STANDALONE_SEQUENTIAL';
      const { compensationStack } = await restoreInventoryItems(activeItems, null);

      activeItems.forEach(item => {
        item.status = 'Cancelled';
      });
      // Derive parent status from items: a fully cancelled order becomes 'Cancelled',
      // but already-Shipped/Delivered items keep the order Shipped/Delivered.
      syncOrderLifecycle(order);

      try {
        await order.save();
      } catch (saveErr) {
        for (const rollback of compensationStack.reverse()) {
          try {
            await rollback();
          } catch (rErr) {
            console.error('[InventoryService] Rollback error during order save failure:', rErr);
          }
        }
        throw saveErr;
      }
    }

    return {
      order,
      restoredItemsCount: activeItems.length,
      executionMode
    };
  } finally {
    releaseLock();
  }
};

/**
 * Vendor single-item cancellation.
 * Verifies vendor ownership, checks item is not Cancelled/Shipped/Delivered,
 * restores stock ONLY for that item, transitions item to 'Cancelled'.
 * If all items in the order become 'Cancelled', updates overall orderStatus to 'Cancelled'.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.orderId
 * @param {string|mongoose.Types.ObjectId} params.itemId
 * @param {string|mongoose.Types.ObjectId} params.vendorUserId
 * @returns {Promise<{ order: Object, item: Object, executionMode: string }>}
 */
const cancelVendorOrderItem = async ({ orderId, itemId, vendorUserId }) => {
  const vendor = await Vendor.findOne({ user: vendorUserId });
  if (!vendor) {
    const err = new Error('Vendor profile not found');
    err.statusCode = 404;
    throw err;
  }

  const releaseLock = acquireOrderLock(orderId);
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.orderStatus === 'Cancelled') {
      const err = new Error('Cannot update item in an order that is already Cancelled');
      err.statusCode = 400;
      throw err;
    }

    const item = order.items.id(itemId);
    if (!item) {
      const err = new Error('Order item not found');
      err.statusCode = 404;
      throw err;
    }

    if (item.vendor.toString() !== vendor._id.toString()) {
      const err = new Error('Unauthorized: Item does not belong to your store');
      err.statusCode = 403;
      throw err;
    }

    if (item.status === 'Cancelled') {
      const err = new Error('Order item is already Cancelled');
      err.statusCode = 400;
      throw err;
    }

    if (item.status === 'Shipped' || item.status === 'Delivered') {
      const err = new Error(`Cannot cancel order item that is already ${item.status}`);
      err.statusCode = 400;
      throw err;
    }

    const isTxnSupported = checkTransactionSupport();
    let executionMode;

    if (isTxnSupported) {
      executionMode = 'COMMITTED_REPLICA_SET_ACID';
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        await restoreInventoryItems([item], session);

        item.status = 'Cancelled';
        syncOrderLifecycle(order);

        await order.save({ session });
        await session.commitTransaction();
      } catch (txnErr) {
        await session.abortTransaction();
        throw txnErr;
      } finally {
        session.endSession();
      }
    } else {
      executionMode = 'COMMITTED_STANDALONE_SEQUENTIAL';
      const { compensationStack } = await restoreInventoryItems([item], null);

      item.status = 'Cancelled';
      syncOrderLifecycle(order);

      try {
        await order.save();
      } catch (saveErr) {
        for (const rollback of compensationStack.reverse()) {
          try {
            await rollback();
          } catch (rErr) {
            console.error('[InventoryService] Rollback error during vendor item order save:', rErr);
          }
        }
        throw saveErr;
      }
    }

    return {
      order,
      item,
      executionMode
    };
  } finally {
    releaseLock();
  }
};

/**
 * Resets in-memory cancellation locks. Useful for test teardowns.
 */
const _resetCancellationLocks = () => {
  activeOrderCancellations.clear();
};

module.exports = {
  restoreInventoryItems,
  cancelCustomerOrder,
  cancelAdminOrder,
  cancelVendorOrderItem,
  _activeOrderCancellations: activeOrderCancellations,
  _resetCancellationLocks
};
