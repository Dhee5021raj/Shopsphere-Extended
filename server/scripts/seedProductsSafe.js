'use strict';
/**
 * Safe, Non-Destructive Product Catalog Seeder
 *
 * Requirements:
 * 1. Safe & Non-Destructive: Never drops or calls deleteMany on Users, Vendors, Orders, Reviews, Carts, or Products.
 * 2. Idempotent: Can be run multiple times safely. Uses unique product names to prevent duplicates.
 * 3. Preserves Existing Data: Creates backup of existing products before applying updates.
 * 4. Ensures 300 Products: Matches the exact category distribution.
 * 5. Multi-Vendor Rotation: Distributes products evenly across vendors in each category.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');
const Product = require('../models/Product');

// Base 8 Categories metadata (used if categories don't exist yet)
const BASE_CATEGORIES = [
  { name: 'Electronics',       icon: 'Laptop',    image: 'https://images.unsplash.com/photo-1498049860654-af1a5c566876?w=600', description: 'Gadgets, laptops, audio & smart devices' },
  { name: 'Clothing',          icon: 'Shirt',     image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600', description: 'Men & women stylish apparel' },
  { name: 'Shoes',             icon: 'Footprints',image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',    description: 'Sneakers, boots & athletic footwear' },
  { name: 'Home & Kitchen',    icon: 'Home',      image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600', description: 'Modern decor, furniture & cookware' },
  { name: 'Beauty & Skincare', icon: 'Sparkles',  image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600', description: 'Organic serums, cosmetics & self-care' },
  { name: 'Sports & Fitness',  icon: 'Dumbbell',  image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600', description: 'Gym equipment, yoga mats & outdoor gear' },
  { name: 'Books & Stationery',icon: 'BookOpen',  image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600', description: 'Bestselling novels, journals & art supplies' },
  { name: 'Plants & Garden',   icon: 'Leaf',      image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600', description: 'Indoor flora, planters & gardening tools' }
];

// Base 5 Vendors metadata (used if vendors don't exist yet)
const BASE_VENDORS = [
  { name: 'Nexus Electronics',  email: 'nexus@vendors.com',    password: 'password123', storeName: 'Nexus Tech Lab',        description: 'Premium gaming laptops, earbuds, smartwatches and peripherals.',     logo: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200', banner: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200' },
  { name: 'Urban Luxe Couture', email: 'urban@vendors.com',    password: 'password123', storeName: 'Urban Luxe Apparel',    description: 'Sustainable fashion, designer streetwear, organic cotton and leather.', logo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=200', banner: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200' },
  { name: 'Aura Home Living',   email: 'aura@vendors.com',     password: 'password123', storeName: 'Aura Living & Decor',   description: 'Minimalist Nordic furniture, ceramic cookware, ambient lighting.',    logo: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=200', banner: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200' },
  { name: 'Botanica Greenery',  email: 'botanica@vendors.com', password: 'password123', storeName: 'Botanica Plant Co.',    description: 'Exotic indoor plants, ceramic planters and organic soil.',            logo: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=200', banner: 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=1200' },
  { name: 'Glow Skin Lab',      email: 'glow@vendors.com',     password: 'password123', storeName: 'Glow Botanical Beauty', description: 'Vegan skincare, hydrating serums, organic hair treatments and oils.', logo: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=200', banner: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200' }
];

async function seedProductsSafe() {
  console.log('================================================================');
  console.log('   ShopSphere Extended — Safe Non-Destructive Product Seeder   ');
  console.log('================================================================');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shopsphere';
  console.log(`[Safe Seeder] Connecting to MongoDB at: ${mongoUri}`);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log('[Safe Seeder] Connected to MongoDB.');

  // 1. Pre-flight backup of existing products
  const initialProducts = await Product.find().lean();
  console.log(`[Safe Seeder] Current products in database: ${initialProducts.length}`);

  if (initialProducts.length > 0) {
    const backupDir = path.join(__dirname, '../data/backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `products_backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(initialProducts, null, 2), 'utf8');
    console.log(`[Safe Seeder] Created backup of ${initialProducts.length} existing products at: ${backupFile}`);
  }

  // 2. Ensure Categories Exist (Non-destructively)
  const categoryMap = {};
  for (const cData of BASE_CATEGORIES) {
    let cat = await Category.findOne({ name: cData.name });
    if (!cat) {
      const slug = cData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      cat = await Category.create({
        name: cData.name,
        slug,
        icon: cData.icon,
        image: cData.image,
        description: cData.description
      });
      console.log(`[Safe Seeder] Created missing category: "${cat.name}"`);
    }
    categoryMap[cat.name] = cat._id;
  }

  // 3. Ensure Vendors Exist (Non-destructively)
  const vendors = [];
  for (const vData of BASE_VENDORS) {
    let vendor = await Vendor.findOne({ storeName: vData.storeName });
    if (!vendor) {
      let user = await User.findOne({ email: vData.email });
      if (!user) {
        user = await User.create({
          name: vData.name,
          email: vData.email,
          password: vData.password,
          role: 'vendor'
        });
      }
      const storeSlug = vData.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      vendor = await Vendor.create({
        user: user._id,
        storeName: vData.storeName,
        storeSlug,
        description: vData.description,
        logo: vData.logo,
        banner: vData.banner,
        status: 'approved',
        rating: 4.8,
        numRatings: 124,
        totalSales: 450000
      });
      console.log(`[Safe Seeder] Created missing vendor: "${vendor.storeName}"`);
    }
    vendors.push(vendor);
  }

  // 4. Load 300 Products Dataset
  const datasetPath = path.join(__dirname, '../data/products300.json');
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset not found at ${datasetPath}. Please run buildCatalog.js first.`);
  }

  const rawProducts = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  console.log(`[Safe Seeder] Loaded ${rawProducts.length} products from dataset.`);

  if (rawProducts.length !== 300) {
    throw new Error(`Dataset must contain exactly 300 products, found: ${rawProducts.length}`);
  }

  // 5. Group products by category and assign vendors round-robin
  const productsByCategory = new Map();
  for (const p of rawProducts) {
    if (!productsByCategory.has(p.categoryName)) {
      productsByCategory.set(p.categoryName, []);
    }
    productsByCategory.get(p.categoryName).push(p);
  }

  let poolOffset = 0;
  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const [categoryName, prods] of productsByCategory.entries()) {
    const categoryId = categoryMap[categoryName];
    if (!categoryId) {
      throw new Error(`Unrecognized category "${categoryName}" in dataset.`);
    }

    for (let i = 0; i < prods.length; i++) {
      const p = prods[i];
      const assignedVendor = vendors[(poolOffset + i) % vendors.length]._id;

      // Check if product already exists by exact name
      const existing = await Product.findOne({ name: p.name });

      if (existing) {
        // Update product attributes to maintain consistency without changing its _id
        existing.description = p.description;
        existing.price = p.price;
        existing.discountPrice = p.discountPrice;
        existing.stock = p.stock;
        existing.rating = p.rating;
        existing.numReviews = p.numReviews;
        existing.soldCount = p.soldCount;
        existing.images = p.images;
        existing.isFeatured = p.isFeatured;
        existing.isActive = true;
        existing.category = categoryId;
        existing.vendor = assignedVendor;
        await existing.save();
        updatedCount++;
      } else {
        // Insert new product
        await Product.create({
          name: p.name,
          description: p.description,
          price: p.price,
          discountPrice: p.discountPrice,
          stock: p.stock,
          rating: p.rating,
          numReviews: p.numReviews,
          soldCount: p.soldCount,
          images: p.images,
          isFeatured: p.isFeatured,
          isActive: true,
          category: categoryId,
          vendor: assignedVendor
        });
        addedCount++;
      }
    }
    poolOffset += 2; // Offset rotation across categories
  }

  // 6. Final Database Verification
  // Verification is scoped to the 300 base-catalog products, so extra products
  // (e.g. from scripts/seedCatalogExpansion.js) do not fail this check.
  const baseNameFilter = { name: { $in: rawProducts.map((p) => p.name) } };
  const finalTotalProducts = await Product.countDocuments(baseNameFilter);
  const allProductsInDb = await Product.countDocuments();
  console.log('\n----------------------------------------------------------------');
  console.log('                 Safe Seeding Summary Report                    ');
  console.log('----------------------------------------------------------------');
  console.log(`  Initial Products in DB : ${initialProducts.length}`);
  console.log(`  New Products Inserted  : ${addedCount}`);
  console.log(`  Products Updated       : ${updatedCount}`);
  console.log(`  Base Catalog Products  : ${finalTotalProducts}`);
  console.log(`  Total Products in DB   : ${allProductsInDb}`);
  console.log('----------------------------------------------------------------');

  console.log('\n[Safe Seeder] Verified Distribution Across Categories:');
  const TARGET_COUNTS = {
    'Electronics': 40,
    'Clothing': 40,
    'Shoes': 35,
    'Home & Kitchen': 40,
    'Beauty & Skincare': 35,
    'Sports & Fitness': 35,
    'Books & Stationery': 35,
    'Plants & Garden': 40
  };

  let allMatches = true;
  for (const [catName, target] of Object.entries(TARGET_COUNTS)) {
    const catId = categoryMap[catName];
    const actual = await Product.countDocuments({ ...baseNameFilter, category: catId });
    const match = actual === target ? 'MATCH (OK)' : `MISMATCH (Expected ${target})`;
    console.log(`  - ${catName.padEnd(20)}: ${String(actual).padStart(3)} / ${target} -> ${match}`);
    if (actual !== target) allMatches = false;
  }

  // Check vendor distribution
  console.log('\n[Safe Seeder] Verified Distribution Across Vendors:');
  for (const v of vendors) {
    const vCount = await Product.countDocuments({ vendor: v._id });
    console.log(`  - ${v.storeName.padEnd(25)}: ${vCount} products`);
  }

  // Check active status
  const activeCount = await Product.countDocuments({ ...baseNameFilter, isActive: true });
  console.log(`\n[Safe Seeder] Active Products: ${activeCount} / ${finalTotalProducts}`);

  // Check pricing and discount integrity
  const invalidPriceCount = await Product.countDocuments({
    $or: [
      { price: { $lte: 0 } },
      { stock: { $lt: 0 } },
      { $expr: { $and: [{ $gt: ['$discountPrice', 0] }, { $gte: ['$discountPrice', '$price'] }] } }
    ]
  });
  console.log(`[Safe Seeder] Invalid Prices / Stock Violations: ${invalidPriceCount}`);

  await mongoose.disconnect();
  console.log('\n[Safe Seeder] Done! Database disconnected.');

  if (!allMatches || finalTotalProducts !== 300) {
    throw new Error(`Catalog verification failed! Expected 300 products, got ${finalTotalProducts}`);
  }
}

if (require.main === module) {
  seedProductsSafe().catch(err => {
    console.error('[Safe Seeder Error]:', err);
    process.exit(1);
  });
}

module.exports = { seedProductsSafe };
