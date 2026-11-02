const { spawnSync } = require('child_process');
const path = require('path');

console.log('[ADVERSARIAL] Checking verifyBench against non-mock behavior...');

// Test 1: Invalid port connection
const res1 = spawnSync('node', ['server/scripts/verifyBench.js'], {
  cwd: path.resolve(__dirname, '../../../'),
  env: { ...process.env, BENCH_URI: 'mongodb://127.0.0.1:27019/shopsphere_bench' },
  encoding: 'utf8',
  timeout: 5000
});

console.log('Test 1 (Bad Port): exitCode =', res1.status);
if (res1.status !== 0) {
  console.log('✓ PASS: verifyBench failed on connection failure as expected.');
} else {
  console.log('✗ FAIL: verifyBench unexpectedly succeeded on bad port!');
}

// Test 2: Pointing to an empty database (e.g. shopsphere_bench_empty on port 27018)
const res2 = spawnSync('node', ['server/scripts/verifyBench.js'], {
  cwd: path.resolve(__dirname, '../../../'),
  env: { ...process.env, BENCH_URI: 'mongodb://127.0.0.1:27018/shopsphere_bench_nonexistent' },
  encoding: 'utf8',
  timeout: 5000
});

console.log('Test 2 (Empty DB): exitCode =', res2.status);
if (res2.status !== 0 && res2.stdout.includes('FAIL')) {
  console.log('✓ PASS: verifyBench detected missing/empty collections and failed with non-zero code.');
  console.log('Sample stdout lines:\n' + res2.stdout.split('\n').filter(l => l.includes('FAIL')).slice(0, 5).join('\n'));
} else {
  console.log('✗ FAIL: verifyBench did not catch empty database!');
}
