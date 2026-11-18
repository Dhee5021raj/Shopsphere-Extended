const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User     = require('./models/User');
const Vendor   = require('./models/Vendor');
const Category = require('./models/Category');
const Product  = require('./models/Product');
const Review   = require('./models/Review');
const Order    = require('./models/Order');
const Cart     = require('./models/Cart');

dotenv.config();

const seedData = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shopsphere';
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
      console.log(`[ShopSphere Seed] Connected to MongoDB at ${mongoUri}`);
    } catch (connErr) {
      console.log('[ShopSphere Seed] Local MongoDB offline. Starting MongoMemoryServer fallback...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      mongoUri = mongod.getUri();
      await mongoose.connect(mongoUri);
      console.log('[ShopSphere Seed] Connected to MongoMemoryServer.');
    }

    // Clear existing collections
    await User.deleteMany({});
    await Vendor.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Review.deleteMany({});
    await Order.deleteMany({});
    await Cart.deleteMany({});
    console.log('[ShopSphere Seed] Cleared existing database records.');

    // ── 1. ADMIN ──────────────────────────────────────────────
    const adminUser = await User.create({
      name: 'ShopSphere Admin',
      email: 'admin@shopsphere.com',
      password: 'adminpassword123',
      role: 'admin',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
    });

    // ── 2. CUSTOMERS ──────────────────────────────────────────
    const customer1 = await User.create({
      name: 'Alex Johnson',
      email: 'alex@gmail.com',
      password: 'password123',
      role: 'customer',
      avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200',
      addresses: [{ title: 'Home', street: '42 Tech Park Avenue', city: 'Bengaluru', state: 'Karnataka', zipCode: '560100', isDefault: true }]
    });

    await User.create({
      name: 'Sophia Patel',
      email: 'sophia@gmail.com',
      password: 'password123',
      role: 'customer',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      addresses: [{ title: 'Apartment', street: '108 Horizon Towers', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', isDefault: true }]
    });

    // ── 3. 5 VENDORS ──────────────────────────────────────────
    const vendorUsersData = [
      { name: 'Nexus Electronics',  email: 'nexus@vendors.com',    password: 'password123', storeName: 'Nexus Tech Lab',        description: 'Premium gaming laptops, earbuds, smartwatches and peripherals.',     logo: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200', banner: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200' },
      { name: 'Urban Luxe Couture', email: 'urban@vendors.com',    password: 'password123', storeName: 'Urban Luxe Apparel',    description: 'Sustainable fashion, designer streetwear, organic cotton and leather.', logo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=200', banner: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200' },
      { name: 'Aura Home Living',   email: 'aura@vendors.com',     password: 'password123', storeName: 'Aura Living & Decor',   description: 'Minimalist Nordic furniture, ceramic cookware, ambient lighting.',    logo: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=200', banner: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200' },
      { name: 'Botanica Greenery',  email: 'botanica@vendors.com', password: 'password123', storeName: 'Botanica Plant Co.',    description: 'Exotic indoor plants, ceramic planters and organic soil.',            logo: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=200', banner: 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=1200' },
      { name: 'Glow Skin Lab',      email: 'glow@vendors.com',     password: 'password123', storeName: 'Glow Botanical Beauty', description: 'Vegan skincare, hydrating serums, organic hair treatments and oils.', logo: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=200', banner: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200' }
    ];

    const vendors = [];
    for (const vData of vendorUsersData) {
      const user = await User.create({ name: vData.name, email: vData.email, password: vData.password, role: 'vendor' });
      const storeSlug = vData.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const vendor = await Vendor.create({
        user: user._id, storeName: vData.storeName, storeSlug, description: vData.description,
        logo: vData.logo, banner: vData.banner,
        status: 'approved', rating: 4.8, numRatings: 124, totalSales: 450000
      });
      vendors.push(vendor);
    }

    // ── 4. 8 CATEGORIES ───────────────────────────────────────
    const categoriesData = [
      { name: 'Electronics',       icon: 'Laptop',    image: 'https://images.unsplash.com/photo-1498049860654-af1a5c566876?w=600', description: 'Gadgets, laptops, audio & smart devices' },
      { name: 'Clothing',          icon: 'Shirt',     image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600', description: 'Men & women stylish apparel' },
      { name: 'Shoes',             icon: 'Footprints',image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',    description: 'Sneakers, boots & athletic footwear' },
      { name: 'Home & Kitchen',    icon: 'Home',      image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600', description: 'Modern decor, furniture & cookware' },
      { name: 'Beauty & Skincare', icon: 'Sparkles',  image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600', description: 'Organic serums, cosmetics & self-care' },
      { name: 'Sports & Fitness',  icon: 'Dumbbell',  image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600', description: 'Gym equipment, yoga mats & outdoor gear' },
      { name: 'Books & Stationery',icon: 'BookOpen',  image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600', description: 'Bestselling novels, journals & art supplies' },
      { name: 'Plants & Garden',   icon: 'Leaf',      image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600', description: 'Indoor flora, planters & gardening tools' }
    ];

    const categories = [];
    for (const cData of categoriesData) {
      const slug = cData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const cat = await Category.create({ name: cData.name, slug, icon: cData.icon, image: cData.image, description: cData.description });
      categories.push(cat);
    }

    const c = {};
    categories.forEach(cat => { c[cat.name] = cat._id; });
    const [v0, v1, v2, v3, v4] = vendors;

    // ── 5. 300 UNIQUE PRODUCTS FROM COMPILED DATASET ──────────
    // Exactly 300 verified products with authentic images distributed across 8 categories:
    // Electronics: 40, Clothing: 40, Shoes: 35, Home & Kitchen: 40,
    // Beauty & Skincare: 35, Sports & Fitness: 35, Books & Stationery: 35, Plants & Garden: 40.
    const productsRaw = require('./data/products300.json');
    const productsData = productsRaw.map(p => ({
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
      category: c[p.categoryName]
    }));

    // ── 5b. SPREAD EACH CATEGORY'S PRODUCTS ACROSS MULTIPLE VENDORS ──
    const productsByCategory = new Map();
    for (const p of productsData) {
      const key = p.category.toString();
      if (!productsByCategory.has(key)) productsByCategory.set(key, []);
      productsByCategory.get(key).push(p);
    }
    let poolOffset = 0;
    for (const [, group] of productsByCategory) {
      for (let i = 0; i < group.length; i++) {
        group[i].vendor = vendors[(poolOffset + i) % vendors.length]._id;
      }
      poolOffset += 2;
    }

    const createdProducts = await Product.insertMany(productsData);
    console.log(`[ShopSphere Seed] Created ${createdProducts.length} unique products.`);

    // Sample order — item vendors must match the products' (now spread-out)
    // vendors, not a hardcoded vendors[0], or the admin order view shows the
    // wrong store next to each item.
    await Order.create({
      customer: customer1._id,
      items: [
        { product: createdProducts[0]._id, vendor: createdProducts[0].vendor, name: createdProducts[0].name, quantity: 1, price: createdProducts[0].discountPrice, status: 'Delivered' },
        { product: createdProducts[1]._id, vendor: createdProducts[1].vendor, name: createdProducts[1].name, quantity: 1, price: createdProducts[1].discountPrice, status: 'Delivered' }
      ],
      shippingAddress: customer1.addresses[0],
      totalAmount: createdProducts[0].discountPrice + createdProducts[1].discountPrice,
      paymentStatus: 'Paid', paymentMethod: 'Card', orderStatus: 'Delivered'
    });

    // ── 6. EXPANDED CATALOG (+480 generated products, 60 per category) ──
    // Skip with SEED_BASE_ONLY=1 to get just the curated 300-product catalog.
    let totalProducts = productsData.length;
    if (process.env.SEED_BASE_ONLY !== '1') {
      const { seedCatalogExpansion } = require('./scripts/seedCatalogExpansion');
      const expansion = await seedCatalogExpansion({ perCategory: 60 });
      totalProducts = expansion.total;
      console.log(`[ShopSphere Seed] Added ${expansion.inserted} expansion products.`);
    }

    console.log('[ShopSphere Seed] Database successfully seeded!');
    console.log(`  → ${totalProducts} products (${Math.ceil(totalProducts / 12)} pages at 12/page)`);
    console.log('  → 8 categories, 5 vendors, 1 admin, 2 customers');
    process.exit(0);
  } catch (error) {
    console.error('[ShopSphere Seed Error]:', error);
    process.exit(1);
  }
};

seedData();
