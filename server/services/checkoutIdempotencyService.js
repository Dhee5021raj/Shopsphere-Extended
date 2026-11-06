'use strict';

/**
 * Checkout Idempotency & In-Flight Concurrency Service
 *
 * Provides:
 * 1. Per-user in-flight checkout mutex lock (serializes rapid/concurrent checkout calls from the same user).
 * 2. Idempotency Key response cache (stores successful checkout responses for safe client retries).
 *
 * ARCHITECTURAL LIMITATION & SCOPE:
 * This implementation uses in-memory Map/Set storage designed for single-process Node.js environments.
 * It reliably protects against client-side double-clicks, network retry storms, and race conditions
 * within the active process.
 * In a distributed, multi-instance production cluster, distributed locking (e.g. Redis Redlock or
 * DB-level unique idempotency collection) would be required. No external Redis dependencies are added
 * to maintain complete portability on standalone and local development setups.
 */

// In-flight user lock set (stores String(userId))
const activeUserCheckouts = new Set();

// Active lock release timeouts (stores key -> timeoutId)
const lockSafetyTimeouts = new Map();

// Idempotency cache: stores compositeKey -> { status, body, createdAt, expiresAt }
const idempotencyStore = new Map();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes retention for successful idempotency keys
const LOCK_TIMEOUT_MS = 30 * 1000;     // 30 seconds safety timeout to prevent permanent user lockout

/**
 * Build composite storage key for idempotency
 * Scoped per-user to prevent cross-account key collision
 */
const buildIdempotencyKey = (userId, rawKey) => {
  return `${String(userId).trim()}:${String(rawKey).trim()}`;
};

/**
 * Acquire per-user in-flight checkout lock.
 * Throws 409 Conflict if another checkout is currently in-flight for this user.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Function} release lock callback
 */
const acquireUserCheckoutLock = (userId) => {
  if (!userId) {
    throw new Error('User ID is required to acquire checkout lock');
  }

  const userKey = String(userId).trim();

  if (activeUserCheckouts.has(userKey)) {
    const conflictErr = new Error('Checkout is already in progress for this account. Please wait.');
    conflictErr.statusCode = 409;
    throw conflictErr;
  }

  activeUserCheckouts.add(userKey);

  // Safety timer to auto-release lock if an unhandled node crash or hanging promise occurs
  const timeoutId = setTimeout(() => {
    activeUserCheckouts.delete(userKey);
    lockSafetyTimeouts.delete(userKey);
  }, LOCK_TIMEOUT_MS);

  lockSafetyTimeouts.set(userKey, timeoutId);

  // Return release callback
  return () => {
    activeUserCheckouts.delete(userKey);
    const existingTimer = lockSafetyTimeouts.get(userKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      lockSafetyTimeouts.delete(userKey);
    }
  };
};

/**
 * Retrieve cached idempotent response if present and unexpired
 *
 * @param {string|null|undefined} rawKey - Idempotency key from request header or body
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Object|null} Cached { status, body } or null
 */
const getIdempotentResponse = (rawKey, userId) => {
  if (!rawKey || !userId) return null;

  const key = buildIdempotencyKey(userId, rawKey);
  const entry = idempotencyStore.get(key);

  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    idempotencyStore.delete(key);
    return null;
  }

  return {
    status: entry.status,
    body: entry.body,
    isIdempotentReplay: true
  };
};

/**
 * Cache successful checkout response under idempotency key
 *
 * @param {string|null|undefined} rawKey
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {number} status - HTTP status code (e.g. 201)
 * @param {Object} body - Serialized response payload
 * @param {number} ttlMs - Time to live in ms
 */
const setIdempotentResponse = (rawKey, userId, status, body, ttlMs = DEFAULT_TTL_MS) => {
  if (!rawKey || !userId) return;

  const key = buildIdempotencyKey(userId, rawKey);
  const now = Date.now();

  idempotencyStore.set(key, {
    status: status || 201,
    body,
    createdAt: now,
    expiresAt: now + ttlMs
  });
};

/**
 * Remove an idempotency key (e.g. if checkout fails, allow client to retry with the same key)
 *
 * @param {string|null|undefined} rawKey
 * @param {string|mongoose.Types.ObjectId} userId
 */
const clearIdempotencyKey = (rawKey, userId) => {
  if (!rawKey || !userId) return;
  const key = buildIdempotencyKey(userId, rawKey);
  idempotencyStore.delete(key);
};

/**
 * Reset all locks and cache (strictly for test teardowns)
 */
const _resetIdempotencyState = () => {
  for (const timer of lockSafetyTimeouts.values()) {
    clearTimeout(timer);
  }
  lockSafetyTimeouts.clear();
  activeUserCheckouts.clear();
  idempotencyStore.clear();
};

module.exports = {
  acquireUserCheckoutLock,
  getIdempotentResponse,
  setIdempotentResponse,
  clearIdempotencyKey,
  _resetIdempotencyState,
  _activeUserCheckouts: activeUserCheckouts,
  _idempotencyStore: idempotencyStore
};
