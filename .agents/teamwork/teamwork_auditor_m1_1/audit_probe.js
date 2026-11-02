const { MongoClient } = require('../../../server/node_modules/mongodb');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27018');
  await client.connect();
  const db = client.db('shopsphere_bench');
  
  // Replay PRNG
  const rng = mulberry32(12345);
  const randInt = (n) => Math.floor(rng() * n);

  // 100 vendors: 1 rng call each (rating: 3 + rng() * 2)
  const vendorRatings = [];
  for (let i = 0; i < 100; i++) {
    vendorRatings.push(3 + rng() * 2);
  }

  // Check first 5 vendors in DB
  const dbVendors = await db.collection('vendors').find({}).limit(5).toArray();
  console.log('--- Vendor PRNG Check ---');
  for (let i = 0; i < 5; i++) {
    const v = dbVendors[i];
    const expRating = vendorRatings[i];
    console.log(`Vendor ${i}: DB rating=${v.rating.toFixed(4)}, exp rating=${expRating.toFixed(4)}, diff=${Math.abs(v.rating - expRating)}`);
  }

  // Check products PRNG sequence:
  // In seedBench.js:
  // const price = 100 + randInt(99900);
  // const rating = Math.round((1 + rng() * 4) * 10) / 10;
  // productVendor[i] = vendors[pick(vendorCum, rng())]._id;
  // productCategory[i] = categories[pick(catCum, rng())]._id;
  // isFeatured: rng() < 0.05
  // stock: randInt(500)
  const expectedProducts = [];
  for (let i = 0; i < 10; i++) {
    const price = 100 + randInt(99900);
    const rating = Math.round((1 + rng() * 4) * 10) / 10;
    const vPick = rng();
    const cPick = rng();
    const stock = randInt(500);
    const isFeatured = rng() < 0.05;
    expectedProducts.push({ i, price, rating, stock, isFeatured });
  }

  console.log('--- Product PRNG Check ---');
  const dbProducts = await db.collection('products').find({}).limit(10).toArray();
  let allMatched = true;
  for (let i = 0; i < 10; i++) {
    const p = dbProducts[i];
    const exp = expectedProducts[i];
    const match = (p.price === exp.price && p.rating === exp.rating && p.stock === exp.stock && p.isFeatured === exp.isFeatured);
    if (!match) allMatched = false;
    console.log(`Product ${i} (${p.name}): price=${p.price} (exp ${exp.price}), rating=${p.rating} (exp ${exp.rating}), stock=${p.stock} (exp ${exp.stock}), isFeatured=${p.isFeatured} (exp ${exp.isFeatured}) -> MATCH: ${match}`);
  }

  console.log(`\nPRNG Determinism Result: ${allMatched ? 'GENUINE MULBERRY32 PRNG GENERATION CONFIRMED' : 'MISMATCH FOUND'}`);

  await client.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
