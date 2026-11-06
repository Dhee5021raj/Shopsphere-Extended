'use strict';

/**
 * Order Lifecycle State Machine & Synchronization Service
 *
 * Centralizes lifecycle rules between individual vendor order items
 * (`order.items[].status`) and the top-level parent order (`order.orderStatus`
 * and `order.paymentStatus`).
 *
 * Enums (from Order.js model):
 * - Item Status:    ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
 * - Order Status:   ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
 * - Payment Status: ['Pending', 'Paid', 'Failed']
 * - Payment Method: ['COD', 'Card', 'UPI', 'NetBanking']
 *
 * State Machine Rules:
 * 1. Terminal Order Guard: Once an order is 'Cancelled', it cannot transition to any other status.
 * 2. All Cancelled: If ALL items are 'Cancelled', parent orderStatus becomes 'Cancelled'.
 * 3. All Delivered: If all active (non-cancelled) items are 'Delivered' (with at least 1 delivered),
 *    parent orderStatus becomes 'Delivered'.
 * 4. Shipped / In-Transit: If all active items are either 'Shipped' or 'Delivered' (with at least 1 'Shipped'),
 *    parent orderStatus becomes 'Shipped'.
 * 5. Processing / Partial: If any active item is 'Processing', 'Confirmed', or 'Pending',
 *    parent orderStatus remains 'Processing'.
 * 6. COD Payment Lifecycle: When a Cash on Delivery ('COD') order reaches 'Delivered' status,
 *    its paymentStatus automatically transitions from 'Pending' to 'Paid'.
 */

const ALLOWED_ITEM_STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const ALLOWED_ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

/**
 * Check if a payment method is Cash on Delivery
 * @param {string} method
 * @returns {boolean}
 */
const isCODPaymentMethod = (method) => {
  if (!method) return false;
  const m = String(method).trim().toUpperCase();
  return m === 'COD' || m === 'CASH ON DELIVERY';
};

/**
 * Compute the derived parent orderStatus given an array of order items.
 *
 * @param {Array<Object>} items - Array of order items with status property
 * @returns {string} Calculated parent orderStatus
 */
const computeParentOrderStatus = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return 'Processing';
  }

  const nonCancelled = items.filter(item => item.status !== 'Cancelled');

  // If every single item was cancelled, parent order is Cancelled
  if (nonCancelled.length === 0) {
    return 'Cancelled';
  }

  // If all remaining active items are Delivered
  const allDelivered = nonCancelled.every(item => item.status === 'Delivered');
  if (allDelivered) {
    return 'Delivered';
  }

  // If all remaining active items are either Shipped or Delivered (at least one is Shipped)
  const allShippedOrDelivered = nonCancelled.every(
    item => item.status === 'Shipped' || item.status === 'Delivered'
  );
  if (allShippedOrDelivered) {
    return 'Shipped';
  }

  // If there are still items in Pending, Confirmed, or Processing
  return 'Processing';
};

/**
 * Synchronize parent orderStatus and COD paymentStatus with the current state of order items.
 * Modifies the order document in place.
 *
 * @param {Object} order - Mongoose Order document
 * @returns {boolean} Whether any field on the order document was mutated
 */
const syncOrderLifecycle = (order) => {
  if (!order || !order.items) return false;

  // Once an order is Cancelled, do not reactivate it
  if (order.orderStatus === 'Cancelled') {
    return false;
  }

  let mutated = false;
  const calculatedStatus = computeParentOrderStatus(order.items);

  if (order.orderStatus !== calculatedStatus) {
    order.orderStatus = calculatedStatus;
    mutated = true;
  }

  // COD Payment Status Synchronization:
  // When an order is Delivered, COD payment is collected on delivery -> transition to Paid
  if (order.orderStatus === 'Delivered' && isCODPaymentMethod(order.paymentMethod)) {
    if (order.paymentStatus === 'Pending') {
      order.paymentStatus = 'Paid';
      mutated = true;
    }
  }

  return mutated;
};

/**
 * Validate whether an item status transition is permissible
 *
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @returns {{ allowed: boolean, reason?: string }}
 */
const validateItemStatusTransition = (currentStatus, targetStatus) => {
  if (!ALLOWED_ITEM_STATUSES.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Invalid status "${targetStatus}". Allowed statuses: ${ALLOWED_ITEM_STATUSES.join(', ')}`
    };
  }

  if (currentStatus === targetStatus) {
    return { allowed: true };
  }

  if (currentStatus === 'Cancelled') {
    return {
      allowed: false,
      reason: 'Cannot update status of a cancelled item'
    };
  }

  if (currentStatus === 'Delivered') {
    return {
      allowed: false,
      reason: 'Cannot change status of an item that is already Delivered'
    };
  }

  if (currentStatus === 'Shipped' && targetStatus === 'Cancelled') {
    return {
      allowed: false,
      reason: 'Cannot cancel an order item that has already Shipped'
    };
  }

  return { allowed: true };
};

module.exports = {
  isCODPaymentMethod,
  computeParentOrderStatus,
  syncOrderLifecycle,
  validateItemStatusTransition,
  ALLOWED_ITEM_STATUSES,
  ALLOWED_ORDER_STATUSES
};
