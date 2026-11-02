'use strict';

/**
 * Validates and retrieves the JWT Secret configuration.
 *
 * Security Requirements:
 * 1. Zero hardcoded fallback secrets.
 * 2. Fail-fast error if JWT_SECRET is missing, empty, or whitespace in production.
 * 3. Clear, descriptive error if JWT_SECRET is missing in development/test.
 * 4. Never logs or prints the actual secret string.
 *
 * @returns {string} The validated secret
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    if (isProd) {
      throw new Error(
        'FATAL: JWT_SECRET environment variable is missing or empty. Server cannot start in production without a secure JWT_SECRET configured.'
      );
    }
    throw new Error(
      'JWT_SECRET environment variable is missing or empty. Please set JWT_SECRET in your .env configuration file.'
    );
  }

  return secret.trim();
};

/**
 * Startup validator to fail-fast during server boot.
 */
const validateJwtConfig = () => {
  try {
    getJwtSecret();
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[SECURITY ERROR] ${error.message}`);
      throw error;
    } else {
      console.warn(`[SECURITY WARNING] ${error.message}`);
    }
  }
};

module.exports = {
  getJwtSecret,
  validateJwtConfig
};
