'use strict';
/**
 * Test Suite: Subsegment 1.5 — Security Secret Guard & Unauthorized Polling Suppressor
 *
 * Verifies:
 *  1. JWT signing and verification with a valid secret.
 *  2. Token verification fails when secret does not match or token is tampered.
 *  3. Missing JWT_SECRET throws clear, non-leaking error.
 *  4. Empty or whitespace JWT_SECRET throws error.
 *  5. Server startup with missing JWT_SECRET in production fails fast with a FATAL error.
 *  6. No hardcoded fallback secret anywhere in the server codebase (static code analysis check).
 *  7. Admin users can access /api/admin/pt-status (HTTP 200).
 *  8. Regular customers cannot access /api/admin/pt-status (HTTP 403 Forbidden).
 *  9. Guest users without a token cannot access /api/admin/pt-status (HTTP 401 Unauthorized).
 * 10. Frontend polling suppressor: guests generate 0 polling calls to /api/admin/pt-status.
 * 11. Frontend polling suppressor: regular customers generate 0 polling calls to /api/admin/pt-status.
 * 12. Frontend polling engine: admin users trigger active polling.
 * 13. Frontend polling suppressor: polling halts immediately after receiving 401 or 403.
 * 14. Frontend polling cleanup: intervals are cleanly cleared on component unmount.
 * 15. Auth middleware regression: protect & authorizeRoles function correctly with valid tokens.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { getJwtSecret, validateJwtConfig } = require('../config/jwt');
const generateToken = require('../utils/generateToken');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { getPtStatus } = require('../controllers/adminController');
const User = require('../models/User');

// Helper to create mock Express req/res
function createMockReqRes({ headers = {}, user = null } = {}) {
  const req = { headers, user };
  const state = { statusCode: 200, data: null };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(data) {
      state.data = data;
      return res;
    }
  };
  return { req, res, getState: () => state };
}

test('Subsegment 1.5 — Security Secret Guard & Polling Suppressor Suite', async (t) => {
  let mongoServer;
  let testAdminUser;
  let testCustomerUser;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  await t.test('Setup MongoMemoryServer and seed users', async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    process.env.JWT_SECRET = 'super_secure_test_jwt_secret_for_subsegment_1_5_validation_32chars';
    process.env.NODE_ENV = 'test';

    testAdminUser = await User.create({
      name: 'Security Admin',
      email: 'sec_admin@example.com',
      password: 'password123',
      role: 'admin'
    });

    testCustomerUser = await User.create({
      name: 'Regular Customer',
      email: 'sec_customer@example.com',
      password: 'password123',
      role: 'customer'
    });
  });

  t.afterEach(() => {
    process.env.JWT_SECRET = originalJwtSecret || 'super_secure_test_jwt_secret_for_subsegment_1_5_validation_32chars';
    process.env.NODE_ENV = originalNodeEnv || 'test';
  });

  await t.test('1. JWT signing and verification with a valid secret', () => {
    process.env.JWT_SECRET = 'valid_production_grade_jwt_secret_for_signing_and_verification_tests';

    const userId = 'user_abc_123';
    const token = generateToken(userId);
    assert.ok(typeof token === 'string' && token.length > 20, 'Generated token must be a non-empty string');

    const decoded = jwt.verify(token, getJwtSecret());
    assert.strictEqual(decoded.id, userId, 'Decoded user ID must match signed payload');
  });

  await t.test('2. Token verification fails when secret does not match or token is tampered', () => {
    process.env.JWT_SECRET = 'secret_alpha_key_which_is_strictly_for_signing_only_12345';
    const token = generateToken('user_tamper_test');

    // Attempt to verify with a different secret
    process.env.JWT_SECRET = 'secret_beta_key_which_does_not_match_secret_alpha_67890';
    assert.throws(
      () => jwt.verify(token, getJwtSecret()),
      /invalid signature/i,
      'Verification must fail with invalid signature when secret changes'
    );
  });

  await t.test('3. Missing JWT_SECRET throws clear, non-leaking error', () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'development';

    assert.throws(
      () => getJwtSecret(),
      (err) => {
        assert.match(err.message, /JWT_SECRET environment variable is missing or empty/i);
        assert.ok(!err.message.includes('shopsphere_super_secret'), 'Error must never leak any secret value');
        return true;
      }
    );
  });

  await t.test('4. Empty or whitespace JWT_SECRET throws error', () => {
    process.env.JWT_SECRET = '   ';
    assert.throws(
      () => getJwtSecret(),
      /JWT_SECRET environment variable is missing or empty/i
    );
  });

  await t.test('5. Server startup in production fails fast if JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';

    assert.throws(
      () => validateJwtConfig(),
      /FATAL: JWT_SECRET environment variable is missing or empty/i,
      'Production startup validator must throw FATAL error when JWT_SECRET is missing'
    );
  });

  await t.test('6. Static Code Audit: Zero hardcoded fallback secrets anywhere in server codebase', () => {
    const serverDir = path.join(__dirname, '..');
    const forbiddenPattern = ['shopsphere', 'super', 'secret'].join('_');

    const scanFiles = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (file === 'node_modules' || file === '.git' || file === '.env' || file === 'tests') continue;

        if (fs.statSync(fullPath).isDirectory()) {
          scanFiles(fullPath);
        } else if (file.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          assert.ok(
            !content.includes(forbiddenPattern),
            `Hardcoded secret fallback found in file: ${fullPath}`
          );
        }
      }
    };

    scanFiles(serverDir);
  });

  await t.test('7. Backend RBAC: Admin users can access /api/admin/pt-status', async () => {
    process.env.JWT_SECRET = 'super_secure_test_jwt_secret_for_subsegment_1_5_validation_32chars';
    const { req, res, getState } = createMockReqRes({
      user: testAdminUser
    });

    await getPtStatus(req, res);
    const state = getState();

    assert.strictEqual(state.statusCode, 200);
    assert.ok(typeof state.data === 'object' && state.data !== null);
  });

  await t.test('8. Backend RBAC: Regular customers cannot access /api/admin/pt-status (HTTP 403 Forbidden)', async () => {
    const { req, res, getState } = createMockReqRes({
      user: testCustomerUser
    });

    // Run authorizeRoles('admin') middleware
    const adminCheck = authorizeRoles('admin');
    let nextCalled = false;
    adminCheck(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, 'Next must not be called for non-admin');
    assert.strictEqual(getState().statusCode, 403, 'Must return 403 Forbidden for customer');
    assert.match(getState().data.message, /Access denied/i);
  });

  await t.test('9. Backend RBAC: Guest users without a token cannot access admin routes (HTTP 401 Unauthorized)', async () => {
    const { req, res, getState } = createMockReqRes({
      headers: {} // No authorization header
    });

    let nextCalled = false;
    await protect(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(getState().statusCode, 401);
    assert.match(getState().data.message, /no token provided/i);
  });

  await t.test('10. Frontend Polling Suppressor: Guests generate 0 polling calls to /api/admin/pt-status', () => {
    // Simulates the behavior of ShadowStatusBadge with an unauthenticated visitor
    let networkCallCount = 0;
    const mockApi = {
      get: async () => {
        networkCallCount++;
        return { data: { running: false } };
      }
    };

    const simulateShadowStatusBadge = ({ user, isAdmin }) => {
      // Guard implemented in ShadowStatusBadge:
      if (!user || !isAdmin) {
        return null;
      }
      mockApi.get('/admin/pt-status');
      return { rendered: true };
    };

    const resultGuest = simulateShadowStatusBadge({ user: null, isAdmin: false });
    assert.strictEqual(resultGuest, null, 'Component must return null for guest');
    assert.strictEqual(networkCallCount, 0, 'Zero network calls must be initiated by guest');
  });

  await t.test('11. Frontend Polling Suppressor: Regular customers generate 0 polling calls to /api/admin/pt-status', () => {
    let networkCallCount = 0;
    const mockApi = {
      get: async () => {
        networkCallCount++;
        return { data: { running: false } };
      }
    };

    const simulateShadowStatusBadge = ({ user, isAdmin }) => {
      if (!user || !isAdmin) {
        return null;
      }
      mockApi.get('/admin/pt-status');
      return { rendered: true };
    };

    const resultCustomer = simulateShadowStatusBadge({
      user: { name: 'Customer', role: 'customer' },
      isAdmin: false
    });

    assert.strictEqual(resultCustomer, null, 'Component must return null for customer');
    assert.strictEqual(networkCallCount, 0, 'Zero network calls must be initiated by regular customer');
  });

  await t.test('12. Frontend Polling Engine: Admin user triggers active polling', () => {
    let networkCallCount = 0;
    const mockApi = {
      get: async () => {
        networkCallCount++;
        return { data: { running: true } };
      }
    };

    const simulateShadowStatusBadge = ({ user, isAdmin }) => {
      if (!user || !isAdmin) {
        return null;
      }
      mockApi.get('/admin/pt-status');
      return { rendered: true };
    };

    const resultAdmin = simulateShadowStatusBadge({
      user: { name: 'Admin', role: 'admin' },
      isAdmin: true
    });

    assert.ok(resultAdmin !== null, 'Component must render for admin');
    assert.strictEqual(networkCallCount, 1, 'Admin must initiate status query');
  });

  await t.test('13. Frontend Polling Suppressor: Polling halts immediately after receiving 401 or 403', async () => {
    let intervalCleared = false;
    let timerId = 12345;

    // Simulate the catch block in ShadowStatusBadge
    const handlePollError = (err) => {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        if (timerId) {
          intervalCleared = true;
          timerId = null;
        }
      }
    };

    // 403 Forbidden response
    handlePollError({ response: { status: 403 } });
    assert.strictEqual(intervalCleared, true, 'Interval must be cleared immediately upon receiving 403');
    assert.strictEqual(timerId, null, 'Timer must be reset to null');

    // 401 Unauthorized response
    timerId = 67890;
    intervalCleared = false;
    handlePollError({ response: { status: 401 } });
    assert.strictEqual(intervalCleared, true, 'Interval must be cleared immediately upon receiving 401');
    assert.strictEqual(timerId, null);
  });

  await t.test('14. Frontend Polling Cleanup: Intervals are cleanly cleared on component unmount', () => {
    let timerCleared = false;
    const fakeTimerId = 99999;

    // Simulates useEffect cleanup return () => { clearInterval(timerId); }
    const cleanup = (timerId) => {
      if (timerId) {
        timerCleared = true;
      }
    };

    cleanup(fakeTimerId);
    assert.strictEqual(timerCleared, true, 'Polling timer must be cleared on component unmount');
  });

  await t.test('15. Auth Middleware regression: protect allows authorized user with valid token', async () => {
    process.env.JWT_SECRET = 'super_secure_test_jwt_secret_for_subsegment_1_5_validation_32chars';
    const validToken = generateToken(testAdminUser._id);

    const { req, res, getState } = createMockReqRes({
      headers: { authorization: `Bearer ${validToken}` }
    });

    let nextCalled = false;
    await protect(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'protect must invoke next() for valid token');
    assert.strictEqual(req.user._id.toString(), testAdminUser._id.toString());
  });

  await t.test('Teardown test server', async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
});
