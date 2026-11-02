const { MongoClient } = require('mongodb');
const { spawnSync } = require('child_process');
const path = require('path');
const { benchUri } = require('../pt/benchDb');

const EXPECTED_COUNTS = {
  products: 50000,
  orders: 100000,
  order_items: 400000,
  users: 20000,
  reviews: 100000,
  vendors: 100,
  categories: 30
};

const EXPECTED_INDEXES = {
  products: ['category_id_1', 'vendor_id_1'],
  orders: ['user_id_1', 'created_at_1'],
  order_items: ['order_id_1', 'product_id_1', 'vendor_id_1', 'created_at_1'],
  reviews: ['product_id_1', 'user_id_1', 'vendor_id_1'],
  users: ['email_1']
};

async function main() {
  const uri = benchUri();
  console.log(`[VERIFY] Connecting to ${uri}...`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('shopsphere_bench');
  let failures = 0;

  console.log('[VERIFY] Checking collection document counts:');
  for (const [coll, minCount] of Object.entries(EXPECTED_COUNTS)) {
    const count = await db.collection(coll).countDocuments();
    const ok = count >= minCount;
    if (!ok) failures++;
    console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'} ${coll}: ${count} (min expected: ${minCount})`);
  }

  console.log('\n[VERIFY] Checking required secondary indexes:');
  for (const [coll, requiredIndexes] of Object.entries(EXPECTED_INDEXES)) {
    const existing = (await db.collection(coll).indexes()).map(i => i.name);
    for (const req of requiredIndexes) {
      const ok = existing.includes(req);
      if (!ok) failures++;
      console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'} ${coll}.${req}`);
    }
  }

  console.log('\n[VERIFY] Checking deliberate academic skew:');
  const totalProducts = await db.collection('products').countDocuments();
  const rareCat = await db.collection('categories').findOne({ is_rare: true });
  const rareProducts = rareCat ? await db.collection('products').countDocuments({ category_id: rareCat._id }) : 0;
  const rarePct = totalProducts > 0 ? (100 * rareProducts / totalProducts).toFixed(2) : '0.00';
  const rareOk = parseFloat(rarePct) >= 0.2 && parseFloat(rarePct) <= 1.5;
  if (!rareOk) failures++;
  console.log(`  ${rareOk ? '✓ PASS' : '✗ FAIL'} Rare category product share: ${rarePct}% (expected 0.2% - 1.5%)`);

  const totalOrders = await db.collection('orders').countDocuments();
  const recentOrders = await db.collection('orders').countDocuments({ created_at: { $gte: new Date(Date.now() - 7 * 86400e3) } });
  const recentPct = totalOrders > 0 ? (100 * recentOrders / totalOrders).toFixed(2) : '0.00';
  const recentOk = parseFloat(recentPct) >= 1.0 && parseFloat(recentPct) <= 3.0;
  if (!recentOk) failures++;
  console.log(`  ${recentOk ? '✓ PASS' : '✗ FAIL'} 7-day order volume: ${recentPct}% (expected 1.0% - 3.0%)`);

  // ── CLI Adversarial Verification Suite & Mutation Safety Check ───────
  console.log('\n[VERIFY] Checking seedBench.js CLI argument validation & mutation safety:');
  const seedBenchPath = path.resolve(__dirname, 'seedBench.js');

  const adversarialCases = [
    { name: 'Negative products (--products=-50)', args: ['--products=-50'], expectRegex: /must be a positive integer/i },
    { name: 'Zero orders (--orders=0)', args: ['--orders=0'], expectRegex: /must be a positive integer/i },
    { name: 'Unknown option (--unknown=10)', args: ['--unknown=10'], expectRegex: /unknown argument/i },
    { name: 'Unrecognized flag (--badflag)', args: ['--badflag'], expectRegex: /unknown argument/i },
    { name: 'Non-numeric value (--products=abc)', args: ['--products=abc'], expectRegex: /must be an integer|invalid integer/i },
    { name: 'Negative seed (--seed=-5)', args: ['--seed=-5'], expectRegex: /must be a non-negative integer|must be a positive integer/i },
    { name: 'Adversarial with --drop (--drop --products=-50)', args: ['--drop', '--products=-50'], expectRegex: /must be a positive integer/i }
  ];

  // Capture baseline collection counts before adversarial execution
  const countsBefore = {};
  for (const coll of Object.keys(EXPECTED_COUNTS)) {
    countsBefore[coll] = await db.collection(coll).countDocuments();
  }

  for (const tc of adversarialCases) {
    const res = spawnSync(process.execPath, [seedBenchPath, ...tc.args], {
      encoding: 'utf8',
      env: process.env
    });

    const failed = res.status !== 0;
    const output = (res.stderr || '') + (res.stdout || '');
    const matched = tc.expectRegex.test(output);
    const noDbLeak = !output.includes('[seedBench] uri=') && !output.includes('[seedBench] scale:');

    const pass = failed && matched && noDbLeak;
    if (!pass) failures++;
    console.log(`  ${pass ? '✓ PASS' : '✗ FAIL'} ${tc.name}`);
    if (!pass) {
      console.log(`    Exit status: ${res.status} (expected != 0)`);
      console.log(`    Matched error pattern: ${matched}`);
      console.log(`    Pre-connection abort: ${noDbLeak}`);
      console.log(`    Output snippet: ${output.slice(0, 160).trim()}`);
    }
  }

  // Verify zero database mutation across all collections
  let mutationCount = 0;
  for (const coll of Object.keys(EXPECTED_COUNTS)) {
    const countAfter = await db.collection(coll).countDocuments();
    if (countAfter !== countsBefore[coll]) {
      mutationCount++;
      console.log(`  ✗ FAIL DB Mutation in ${coll}: before=${countsBefore[coll]} after=${countAfter}`);
    }
  }
  if (mutationCount === 0) {
    console.log('  ✓ PASS Zero database mutations during adversarial CLI testing');
  } else {
    failures++;
  }

  // Verify --medium preset parsing contract
  try {
    const { parseArgs } = require('./seedBench');
    if (typeof parseArgs === 'function') {
      const mediumOpts = parseArgs(['node', 'seedBench.js', '--medium']);
      const mediumOk = mediumOpts.products === 50000 &&
                       mediumOpts.orders === 100000 &&
                       mediumOpts.items === 400000 &&
                       mediumOpts.vendors === 100 &&
                       mediumOpts.categories === 30 &&
                       mediumOpts.users === 20000 &&
                       mediumOpts.reviews === 100000;
      if (!mediumOk) failures++;
      console.log(`  ${mediumOk ? '✓ PASS' : '✗ FAIL'} --medium sets expected scale (50k products, 100k orders, 400k items)`);
    }
  } catch (err) {
    failures++;
    console.log(`  ✗ FAIL --medium preset validation error: ${err.message}`);
  }

  console.log(`\n[VERIFY] Summary: ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECKS FAILED'}`);
  await client.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[VERIFY] FATAL:', err);
  process.exit(1);
});
