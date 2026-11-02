'use strict';
/**
 * Bench database connection. Runs in its OWN process (seed/bench/report
 * scripts), so it safely uses mongoose's default connection. It NEVER touches
 * the demo database: the URI is hard-defaulted to `shopsphere_bench`.
 *
 * NOTE: a real `mongod` is required (see server/scripts/mongod.sh and the
 * README). mongodb-memory-server is NOT used at runtime.
 */
const mongoose = require('mongoose');

const DEFAULT_URI = 'mongodb://127.0.0.1:27018/shopsphere_bench';

function benchUri() {
  return process.env.BENCH_URI || process.env.MONGODB_BENCH_URI || DEFAULT_URI;
}

async function connectBench() {
  const uri = benchUri();
  if (!/shopsphere_bench/.test(uri)) {
    throw new Error(
      `Refusing to run benchmark work against a non-bench database. ` +
      `BENCH_URI must point at \`shopsphere_bench\` (got: ${uri}).`
    );
  }
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

async function disconnectBench() {
  await mongoose.disconnect();
}

module.exports = { connectBench, disconnectBench, benchUri, DEFAULT_URI };
