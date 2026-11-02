'use strict';
/**
 * Add extra demo products to the main ShopSphere app database.
 *
 * Useful when the default 50-product auto-seed feels too thin — the demo
 * catalogue lands at 60 products per category so searches like "laptop",
 * "earbuds", "sneakers" or "serum" return real page-fills of results.
 *
 * Usage:
 *   node scripts/addDemoProducts.js            # +240 products (30 per category)
 *   node scripts/addDemoProducts.js --per-cat=60
 *   node scripts/addDemoProducts.js --per-cat=0 --drop-new   # remove only script-added products
 *
 * Script-added documents are identifiable by the name suffix " (Plus)" so
 * --drop-new can remove exactly what this script added.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Vendor = require('../models/Vendor');

function arg(name, dflt) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : dflt;
}

// Base word pools per category — variant rows are built from these, keyword-rich
// so full-text search has plenty of matches ("laptop" → many Electronics hits).
const TEMPLATE = {
  Electronics: {
    names: ['NitroBoost Gaming Laptop 17 Ultra', 'VoltEdge 4K OLED Laptop Ultra', 'QuantumCore AI Creator Laptop Pro', 'Skyline Chrome Laptop Go', 'TitanArm Rugged Laptop Max', 'UltraBook Pro 14 Laptop'],
    desc: '12th-gen high-performance laptop with RTX graphics, 32GB DDR5, 1TB SSD, long battery life and premium aluminium build. Great student and gaming laptop.',
    img: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=600',
    vendorIdx: 0
  },
  Clothing: {
    names: ['AeroFlex Performance T-Shirt', 'Nimbus Soft Oversized Hoodie', 'TerraBlend Organic Polo', 'CityScape Slim Chinos', 'FrostWave Fleece Jacket', 'DuneLinen Casual Shirt'],
    desc: 'Breathable premium fabric clothing with modern streetwear fit, durable stitching and fade-resistant colors. All-season comfort clothing.',
    img: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600',
    vendorIdx: 1
  },
  Shoes: {
    names: ['Stratos Cord Performance Sneakers', 'IronTrail Grip Sneakers', 'CloudStep Memory Sneakers', 'VelocityKnit Racing Sneakers', 'SummitGrip Trek Shoes', 'RetroWave Court Sneakers'],
    desc: 'Cushioned ergonomic sneakers with breathable knit mesh, shock-absorbing midsole and durable grip outsole. Everyday sneakers, running sneakers and casual sneakers.',
    img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
    vendorIdx: 1
  },
  'Home & Kitchen': {
    names: ['AuroraGlass Cookware Set', 'Ironclad Kitchen Cookware Dutch Oven', 'ZenBrew Kitchen Coffee Maker', 'PetalBowl Kitchen Ceramic Set', 'CrispyCore Kitchen Air Fryer', 'Solaris Kitchen Blender Pro'],
    desc: 'Durable kitchen essential with food-grade materials, dishwasher-safe finish and modern minimalist design. Elevates everyday kitchen cooking.',
    img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600',
    vendorIdx: 2
  },
  'Beauty & Skincare': {
    names: ['LumiVeil Vitamin C Serum Glow', 'HydraLock Face Serum Hydrating', 'PureClay Charcoal Face Serum Mask', 'SilkKiss Collagen Serum Cream', 'GlowBoost Retinol Serum Night', 'AquaMist Rose Face Mist'],
    desc: 'Dermatologist-tested skincare serum with clean active ingredients, non-comedogenic formula and visible glow results in 14 days. Skincare dermatology beauty.',
    img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600',
    vendorIdx: 4
  },
  'Sports & Fitness': {
    names: ['ApexGrip Fitness Yoga Mat', 'FlexCore Fitness Resistance Set', 'IronPulse Fitness Dumbbell Kit', 'StrikeForce Fitness Boxing Gloves', 'TrailRun Fitness Hydration Vest', 'ZenFlow Fitness Stretch Band'],
    desc: 'Durable fitness training gear with anti-slip grip, ergonomic support and compact home-gym design. Perfect for yoga, HIIT and strength fitness training.',
    img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600',
    vendorIdx: 2
  },
  'Books & Stationery': {
    names: ['Atlas of Data Systems Notebook', 'InkTrail Journal Notebook Edition', 'PaperPeak Dotted Notebook Pro', 'GraphLab Design Notebook', 'MindMap Bullet Notebook Classic', 'ScriptWorks Fountain Notebook'],
    desc: 'Premium acid-free 120gsm notebook with lay-flat binding, ribbon bookmark and archival ivory paper. Ideal for journaling, note-taking and bullet journal planning.',
    img: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600',
    vendorIdx: 0
  },
  'Plants & Garden': {
    names: ['EmeraldCascade Indoor Plant Vines', 'DesertRose Succulent Plant Set', 'MonsteraNova Split-Leaf Plant', 'BloomParadise Flowering Plant Basket', 'GreenRoots Herb Plant Kit', 'PalmRelax Tropical Plant Duo'],
    desc: 'Healthy container-grown indoor plant shipped in a nursery pot with care guide. Air-purifying easy-care plant thrives in bright indirect light.',
    img: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600',
    vendorIdx: 3
  }
};

const COLORS = ['Midnight Black', 'Arctic White', 'Sakura Pink', 'Ocean Blue', 'Forest Green', 'Charcoal Grey', 'Ivory'];
const YEARS = ['Ultra', 'Pro', 'Plus', 'Max', 'Air', 'Lite'];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/shopsphere');
  const categories = await Category.find();
  const vendors = await Vendor.find().sort({ createdAt: 1 });
  if (!categories.length || !vendors.length) { console.error('Run the app once first so categories/vendors exist.'); process.exit(1); }
  const vByIdx = (i) => vendors[i % vendors.length];

  const dropNew = process.argv.includes('--drop-new');
  const perCat = arg('per-cat', 30);
  const nameCat = await Category.findOne();

  if (dropNew) {
    const r = await Product.deleteMany({ name: / \(Plus\)$/ });
    console.log(`[addDemoProducts] removed ${r.deletedCount} previously added products`);
    return;
  }

  const docs = [];
  for (const cat of categories) {
    const t = TEMPLATE[cat.name];
    if (!t) continue;
    for (let i = 0; i < perCat; i++) {
      const base = t.names[i % t.names.length];
      const color = COLORS[(i / 3 | 0) % COLORS.length];
      const year = YEARS[i % YEARS.length];
      const vendor = vByIdx(t.vendorIdx + (i % 3));
      const price = 499 + Math.floor(((i * 7919) % 460) ) * 50;      // ₹499 – ₹23k
      const discountPrice = Math.round(price * (0.7 + ((i % 4) * 0.08)));
      docs.push({
        name: `${base} ${color} ${year} (Plus)`,
        description: `${t.desc} Variant ${cat.name.toLowerCase()} ${color} ${year}.`,
        price, discountPrice,
        stock: 5 + (i % 60),
        category: cat._id,
        vendor: vendor._id,
        images: [t.img],
        isFeatured: i % 7 === 0,
        rating: +(3.9 + ((i * 37) % 11) / 10).toFixed(1),
        numReviews: 4 + (i % 80),
        soldCount: 10 + (i % 400)
      });
    }
  }

  if (!docs.length) {
    console.log('[addDemoProducts] nothing to add');
    return;
  }
  const inserted = await Product.insertMany(docs);
  console.log(`[addDemoProducts] inserted ${inserted.length} products across ${categories.length} categories`);
  const laptopSearch = await Product.countDocuments({ $text: { $search: 'laptop' } });
  const totalAfter = await Product.countDocuments();
  console.log(`[addDemoProducts] sanity: text-search 'laptop' now matches ${laptopSearch} docs; total products = ${totalAfter}`);
}

main()
  .catch((e) => { console.error('[addDemoProducts] FAILED:', e.message); process.exit(1); })
  .finally(() => mongoose.disconnect());
