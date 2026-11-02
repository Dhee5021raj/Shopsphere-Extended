const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────
// AUTO-SEED — runs after every DB connect if collections empty
// ─────────────────────────────────────────────────────────────
const autoSeed = async () => {
  try {
    const User     = require('../models/User');
    const Vendor   = require('../models/Vendor');
    const Category = require('../models/Category');
    const Product  = require('../models/Product');
    const Order    = require('../models/Order');

    const existingCount = await User.countDocuments();
    if (existingCount > 0) {
      console.log('[ShopSphere DB] Database already seeded — skipping.');
      return;
    }

    console.log('[ShopSphere DB] Auto-seeding database...');

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
      { name: 'Nexus Electronics',  email: 'nexus@vendors.com',    password: 'password123', storeName: 'Nexus Tech Lab',        description: 'Premium gaming laptops, earbuds, smartwatches and peripherals.',        logo: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200', banner: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200' },
      { name: 'Urban Luxe Couture', email: 'urban@vendors.com',    password: 'password123', storeName: 'Urban Luxe Apparel',    description: 'Sustainable fashion, designer streetwear, organic cotton and leather.',   logo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=200', banner: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200' },
      { name: 'Aura Home Living',   email: 'aura@vendors.com',     password: 'password123', storeName: 'Aura Living & Decor',   description: 'Minimalist Nordic furniture, ceramic cookware, ambient lighting.',       logo: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=200', banner: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200' },
      { name: 'Botanica Greenery',  email: 'botanica@vendors.com', password: 'password123', storeName: 'Botanica Plant Co.',    description: 'Exotic indoor plants, ceramic planters and organic soil.',               logo: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=200', banner: 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=1200' },
      { name: 'Glow Skin Lab',      email: 'glow@vendors.com',     password: 'password123', storeName: 'Glow Botanical Beauty', description: 'Vegan skincare, hydrating serums, organic hair treatments and oils.',    logo: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=200', banner: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200' }
    ];

    const vendors = [];
    for (const vData of vendorUsersData) {
      const user = await User.create({ name: vData.name, email: vData.email, password: vData.password, role: 'vendor' });
      const storeSlug = vData.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const vendor = await Vendor.create({
        user: user._id, storeName: vData.storeName, storeSlug,
        description: vData.description, logo: vData.logo, banner: vData.banner,
        status: 'approved', rating: 4.8, numRatings: 124, totalSales: 450000
      });
      vendors.push(vendor);
    }

    // ── 4. 8 CATEGORIES ───────────────────────────────────────
    const categoriesData = [
      { name: 'Electronics',       icon: 'Laptop',    image: 'https://images.unsplash.com/photo-1498049860654-af1a5c566876?w=600', description: 'Gadgets, laptops, audio & smart devices' },
      { name: 'Clothing',          icon: 'Shirt',     image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600', description: 'Men & women stylish apparel' },
      { name: 'Shoes',             icon: 'Footprints',image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600', description: 'Sneakers, boots & athletic footwear' },
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

    // ── 5. 48 UNIQUE PRODUCTS ─────────────────────────────────
    const productsData = [

      // ── ELECTRONICS (8) ────────────────────────────────────
      {
        name: 'AeroBlade Cyber Gaming Laptop 16 Pro',
        description: 'Intel i9-14900HX, NVIDIA RTX 4080 12GB, 32GB DDR5 RAM, 1TB NVMe SSD, 240Hz QHD OLED — built for hardcore gaming and 3D rendering.',
        price: 185000, discountPrice: 169999, stock: 12, category: c['Electronics'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=600'],
        isFeatured: true, rating: 4.9, numReviews: 28, soldCount: 45
      },
      {
        name: 'SonicPulse ANC Wireless Earbuds',
        description: 'True wireless spatial audio, 45dB hybrid ANC, 40 hours total battery, IPX7 water resistance, wireless charging case.',
        price: 12999, discountPrice: 8999, stock: 45, category: c['Electronics'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600'],
        isFeatured: true, rating: 4.7, numReviews: 42, soldCount: 110
      },
      {
        name: 'Chronos Ultra Smartwatch Titanium',
        description: 'Grade-5 titanium chassis, sapphire crystal, ECG & SpO2 sensor, GPS, 14-day battery, AMOLED always-on display.',
        price: 24999, discountPrice: 19999, stock: 20, category: c['Electronics'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'],
        isFeatured: false, rating: 4.6, numReviews: 18, soldCount: 35
      },
      {
        name: 'NovaMech X Mechanical Keyboard TKL',
        description: 'Hot-swap tactile switches, per-key RGB, aircraft-grade aluminum body, USB-C detachable cable, 1000Hz polling rate.',
        price: 8999, discountPrice: 6999, stock: 30, category: c['Electronics'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=600'],
        isFeatured: false, rating: 4.5, numReviews: 55, soldCount: 80
      },
      {
        name: 'QuantumPixel 27" 4K 144Hz Gaming Monitor',
        description: 'IPS panel, 1ms GTG, HDR600, 99% DCI-P3, G-Sync & FreeSync Premium, height-adjustable ergonomic stand.',
        price: 52999, discountPrice: 44999, stock: 8, category: c['Electronics'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600'],
        isFeatured: false, rating: 4.8, numReviews: 32, soldCount: 28
      },
      {
        name: 'HyperCool Pro 360mm AIO Liquid Cooler',
        description: '360mm radiator, three 120mm ARGB fans, Intel LGA1700 & AMD AM5 compatible, LCD display pump head.',
        price: 14999, discountPrice: 11499, stock: 15, category: c['Electronics'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1591488320449-011701bb6704?w=600'],
        isFeatured: false, rating: 4.6, numReviews: 21, soldCount: 42
      },
      {
        name: 'StealthPad Pro Drawing Tablet A4',
        description: '8192 pressure-level pen, 12" active area, tilt recognition, 8 programmable express keys, compatible with Photoshop, Clip Studio & Blender.',
        price: 18999, discountPrice: 14999, stock: 18, category: c['Electronics'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1561736778-92e52a7769ef?w=600'],
        isFeatured: false, rating: 4.7, numReviews: 38, soldCount: 62
      },
      {
        name: 'OmniCam 4K60 Action Camera Ultra',
        description: 'Sony sensor, 4K60fps, 20MP, HorizonSteady 2.0 gimbal stabilisation, 10m waterproof, dual-screen, 2-hour battery.',
        price: 29999, discountPrice: 22999, stock: 22, category: c['Electronics'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=600'],
        isFeatured: false, rating: 4.5, numReviews: 29, soldCount: 50
      },

      // ── CLOTHING (7) ────────────────────────────────────────
      {
        name: 'Vintage Distressed Italian Leather Jacket',
        description: 'Handcrafted 100% full-grain Italian calfskin leather, soft satin lining, heavy-duty YKK zippers, timeless biker aesthetic.',
        price: 28999, discountPrice: 22499, stock: 15, category: c['Clothing'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600'],
        isFeatured: true, rating: 4.9, numReviews: 22, soldCount: 54
      },
      {
        name: 'Organic Heavyweight Fleece Hoodie',
        description: '450 GSM GOTS certified organic cotton, double-layered hood, relaxed boxy streetwear fit, pre-shrunk fabric.',
        price: 4999, discountPrice: 3499, stock: 60, category: c['Clothing'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=600'],
        isFeatured: true, rating: 4.7, numReviews: 50, soldCount: 140
      },
      {
        name: 'Merino Wool Slim-Fit Blazer',
        description: '100% superfine 18.5 micron Merino wool, half-canvas construction, surgeon cuffs, natural stretch — office to evening.',
        price: 19999, discountPrice: 15999, stock: 20, category: c['Clothing'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600'],
        isFeatured: false, rating: 4.8, numReviews: 18, soldCount: 38
      },
      {
        name: 'Technical Stretch Cargo Joggers',
        description: '4-way stretch nylon-spandex blend, 6 secure pockets, tapered cuff, DWR water-resistant finish — gym to street.',
        price: 3999, discountPrice: 2799, stock: 50, category: c['Clothing'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600'],
        isFeatured: false, rating: 4.4, numReviews: 60, soldCount: 175
      },
      {
        name: 'Bamboo Fiber Essential V-Neck Tee 3-Pack',
        description: '70% bamboo viscose, 30% organic cotton, ultra-soft, breathable, anti-odour, available in black/white/grey.',
        price: 2999, discountPrice: 1999, stock: 100, category: c['Clothing'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600'],
        isFeatured: false, rating: 4.6, numReviews: 85, soldCount: 260
      },
      {
        name: 'Waxed Canvas Field Jacket',
        description: 'British Millerain waxed canvas, corduroy collar, flannel-lined chest pockets, YKK brass zips — weatherproof heritage style.',
        price: 12999, discountPrice: 9999, stock: 18, category: c['Clothing'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=600'],
        isFeatured: false, rating: 4.7, numReviews: 24, soldCount: 42
      },
      {
        name: 'Premium Raw Selvedge Denim Jeans',
        description: 'Japanese 14.5oz selvedge denim, unsanforized raw, slim straight cut, copper rivets, leather patch — ages beautifully.',
        price: 8999, discountPrice: 6999, stock: 30, category: c['Clothing'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1542272604-787c3835535d?w=600'],
        isFeatured: false, rating: 4.8, numReviews: 45, soldCount: 90
      },

      // ── SHOES (6) ───────────────────────────────────────────
      {
        name: 'Apex Runner Carbon Performance Sneakers',
        description: 'Carbon fibre propulsion plate, nitrogen-infused foam midsole, breathable engineered mesh — built for elite marathons.',
        price: 16999, discountPrice: 13999, stock: 25, category: c['Shoes'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600'],
        isFeatured: true, rating: 4.8, numReviews: 38, soldCount: 95
      },
      {
        name: 'Heritage Suede Desert Boot',
        description: 'Full-grain suede leather upper, crepe rubber sole, classic chukka silhouette — effortless smart-casual style.',
        price: 7999, discountPrice: 5999, stock: 35, category: c['Shoes'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=600'],
        isFeatured: false, rating: 4.4, numReviews: 28, soldCount: 60
      },
      {
        name: 'Waterproof Gore-Tex Hiking Boots',
        description: 'Gore-Tex extended comfort membrane, Vibram Megagrip sole, protective rubber toe cap — rated for 3-season alpine hiking.',
        price: 14999, discountPrice: 11499, stock: 18, category: c['Shoes'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1520219306100-ec4afde4a4f4?w=600'],
        isFeatured: false, rating: 4.7, numReviews: 42, soldCount: 78
      },
      {
        name: 'Minimalist Barefoot Running Shoes',
        description: '0mm heel drop, ultra-thin 3mm Vibram sole, wide toe box, machine washable, weighs just 195g per shoe.',
        price: 5999, discountPrice: 4499, stock: 40, category: c['Shoes'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1539185441755-769473a23570?w=600'],
        isFeatured: false, rating: 4.5, numReviews: 55, soldCount: 120
      },
      {
        name: 'Handcrafted Goodyear Welt Oxford Shoes',
        description: 'Full-grain calf leather, double leather sole, Goodyear welt construction, hand-burnished finish — resoleable luxury.',
        price: 21999, discountPrice: 17499, stock: 12, category: c['Shoes'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=600'],
        isFeatured: false, rating: 4.9, numReviews: 20, soldCount: 30
      },
      {
        name: 'Slip-On Canvas Espadrilles',
        description: 'Natural jute rope outsole, pure canvas upper, leather insole — handcrafted in Spain, summer essential.',
        price: 2999, discountPrice: 1999, stock: 70, category: c['Shoes'], vendor: v1._id,
        images: ['https://images.unsplash.com/photo-1465877783223-4eba513e27c6?w=600'],
        isFeatured: false, rating: 4.3, numReviews: 68, soldCount: 200
      },

      // ── HOME & KITCHEN (6) ──────────────────────────────────
      {
        name: 'Nordic Ceramic Minimalist Dining Set 16pc',
        description: '16-piece matte ceramic dinnerware — dinner plates, salad bowls, soup bowls, mugs. Microwave & dishwasher safe.',
        price: 9999, discountPrice: 7499, stock: 22, category: c['Home & Kitchen'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=600'],
        isFeatured: true, rating: 4.9, numReviews: 35, soldCount: 65
      },
      {
        name: 'Aura Smart RGBW Ambient LED Panel 32-Zone',
        description: '32-zone RGBW smart light panel, app + voice control, music sync mode, works with Alexa, Google Home & HomeKit.',
        price: 5499, discountPrice: 3999, stock: 50, category: c['Home & Kitchen'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600'],
        isFeatured: false, rating: 4.6, numReviews: 44, soldCount: 90
      },
      {
        name: 'Staub Cast Iron Dutch Oven 5.5 Quart',
        description: 'Enameled cast iron, self-basting spikes lid, oven-safe to 250°C, compatible with all cooktops including induction.',
        price: 18999, discountPrice: 14499, stock: 14, category: c['Home & Kitchen'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600'],
        isFeatured: false, rating: 4.8, numReviews: 56, soldCount: 88
      },
      {
        name: 'Bamboo Cutting Board Set (3-Piece)',
        description: 'End-grain bamboo, juice groove, anti-slip feet, 3 sizes — chop, slice and serve sustainably.',
        price: 2999, discountPrice: 1999, stock: 80, category: c['Home & Kitchen'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600'],
        isFeatured: false, rating: 4.5, numReviews: 72, soldCount: 195
      },
      {
        name: 'Ultrasonic Aromatherapy Essential Oil Diffuser',
        description: '500ml ultrasonic diffuser, 7-colour ambient LED, timer, auto-shutoff, whisper-quiet — fills a room in minutes.',
        price: 3499, discountPrice: 2499, stock: 60, category: c['Home & Kitchen'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600'],
        isFeatured: false, rating: 4.6, numReviews: 88, soldCount: 230
      },
      {
        name: '7-Piece German Steel Professional Knife Set',
        description: 'High-carbon German steel, full-tang riveted handles, hardwood magnetic block, chef + santoku + bread + utility + pairing knives.',
        price: 12999, discountPrice: 9499, stock: 16, category: c['Home & Kitchen'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1593618998160-e34014e67546?w=600'],
        isFeatured: false, rating: 4.7, numReviews: 42, soldCount: 72
      },

      // ── BEAUTY & SKINCARE (5) ───────────────────────────────
      {
        name: 'HydraGlow Vitamin C + Hyaluronic Acid Serum',
        description: '20% L-Ascorbic acid, Ferulic acid & 3% Hyaluronic Acid. Brightens, reduces hyperpigmentation & boosts collagen.',
        price: 2499, discountPrice: 1799, stock: 100, category: c['Beauty & Skincare'], vendor: v4._id,
        images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600'],
        isFeatured: true, rating: 4.9, numReviews: 88, soldCount: 310
      },
      {
        name: 'Rose Gold Retinol Anti-Ageing Night Cream',
        description: 'Encapsulated retinol 0.5%, niacinamide & tripeptide complex. Visibly reduces fine lines and wrinkles overnight.',
        price: 1899, discountPrice: 1399, stock: 80, category: c['Beauty & Skincare'], vendor: v4._id,
        images: ['https://images.unsplash.com/photo-1570194065650-d99fb4d8a609?w=600'],
        isFeatured: false, rating: 4.7, numReviews: 65, soldCount: 200
      },
      {
        name: 'Activated Charcoal Deep Pore Cleansing Mask',
        description: 'Kaolin clay + bamboo charcoal mask, removes excess sebum, unclogs pores, brightens dull skin in 10 minutes.',
        price: 999, discountPrice: 699, stock: 150, category: c['Beauty & Skincare'], vendor: v4._id,
        images: ['https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600'],
        isFeatured: false, rating: 4.6, numReviews: 120, soldCount: 420
      },
      {
        name: 'SPF 50+ Tinted Mineral Sunscreen Fluid',
        description: 'Zinc oxide UVA/UVB broad-spectrum SPF 50+, sheer tinted finish, non-comedogenic, reef-safe, dermatologist tested.',
        price: 1499, discountPrice: 1099, stock: 120, category: c['Beauty & Skincare'], vendor: v4._id,
        images: ['https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=600'],
        isFeatured: false, rating: 4.8, numReviews: 95, soldCount: 340
      },
      {
        name: 'Argan & Keratin Intensive Hair Repair Mask',
        description: 'Moroccan argan oil + hydrolyzed keratin protein mask. Repairs heat & chemical damage in one wash. Salon-quality result.',
        price: 1299, discountPrice: 899, stock: 90, category: c['Beauty & Skincare'], vendor: v4._id,
        images: ['https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=600'],
        isFeatured: false, rating: 4.5, numReviews: 78, soldCount: 280
      },

      // ── SPORTS & FITNESS (6) ────────────────────────────────
      {
        name: 'PowerMax Elite Adjustable Dumbbell Set 5-52.5 lbs',
        description: '15 weight settings per dumbbell, dial-select mechanism, replaces 30 individual weights — compact home gym solution.',
        price: 18999, discountPrice: 14999, stock: 18, category: c['Sports & Fitness'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600'],
        isFeatured: true, rating: 4.8, numReviews: 40, soldCount: 70
      },
      {
        name: 'ProForm Natural Cork Yoga Mat 6mm',
        description: 'Natural cork top layer, TPE rubber base, antimicrobial surface, superior non-slip grip even when wet, carry strap included.',
        price: 3499, discountPrice: 2499, stock: 70, category: c['Sports & Fitness'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=600'],
        isFeatured: false, rating: 4.6, numReviews: 90, soldCount: 230
      },
      {
        name: 'Resistance Band Set Pro 11-Piece',
        description: '5 resistance levels (10–50 lbs), door anchor, ankle straps, handles, carry bag — full-body workout, travel-friendly.',
        price: 2499, discountPrice: 1799, stock: 90, category: c['Sports & Fitness'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600'],
        isFeatured: false, rating: 4.5, numReviews: 110, soldCount: 315
      },
      {
        name: 'Smart Digital Jump Rope with LCD Counter',
        description: 'Ball-bearing speed rope, digital rep & calorie counter, memory-foam handles, adjustable PVC cable, for cardio & HIIT.',
        price: 1499, discountPrice: 999, stock: 120, category: c['Sports & Fitness'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1434682881908-b43d0467b798?w=600'],
        isFeatured: false, rating: 4.4, numReviews: 88, soldCount: 280
      },
      {
        name: 'Elite Compression Running Socks 6-Pair Set',
        description: '20-30 mmHg graduated compression, moisture-wicking Coolmax fibre, arch support, blister-free heel tab — marathoner favourite.',
        price: 1999, discountPrice: 1399, stock: 200, category: c['Sports & Fitness'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600'],
        isFeatured: false, rating: 4.5, numReviews: 145, soldCount: 390
      },
      {
        name: 'Foldable Compact Rowing Machine',
        description: '8 magnetic resistance levels, LCD monitor (time/count/calories), foldable for storage, 120kg max weight, smooth silent rowing.',
        price: 24999, discountPrice: 18999, stock: 10, category: c['Sports & Fitness'], vendor: v2._id,
        images: ['https://images.unsplash.com/photo-1591291621164-2c6367723315?w=600'],
        isFeatured: false, rating: 4.7, numReviews: 35, soldCount: 42
      },

      // ── BOOKS & STATIONERY (6) ──────────────────────────────
      {
        name: 'The Art of System Design & MongoDB Architecture',
        description: 'Comprehensive hardcover guide to database indexing, aggregation pipelines, ACID transactions and high-scale backend development.',
        price: 1499, discountPrice: 1199, stock: 120, category: c['Books & Stationery'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600'],
        isFeatured: true, rating: 5.0, numReviews: 110, soldCount: 450
      },
      {
        name: 'Leuchtturm1917 A5 Hardcover Dotted Journal',
        description: '249 numbered pages, 2 ribbon bookmarks, pocket, ink-proof 80gsm paper, hardcover. The gold standard planner and journal.',
        price: 1299, discountPrice: 999, stock: 200, category: c['Books & Stationery'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600'],
        isFeatured: false, rating: 4.8, numReviews: 75, soldCount: 280
      },
      {
        name: 'Arctic Pro Precision Drafting Pencil Set',
        description: '0.3 / 0.5 / 0.7mm technical drafting pencils, break-resistant polymer lead, rubberized grip, metal carry case.',
        price: 999, discountPrice: 749, stock: 150, category: c['Books & Stationery'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1568205631383-d6dac7e6ecab?w=600'],
        isFeatured: false, rating: 4.5, numReviews: 48, soldCount: 120
      },
      {
        name: 'Clean Code: A Handbook of Agile Software Craftsmanship',
        description: 'Robert C. Martin\'s definitive guide to writing maintainable, readable, and testable code. Essential reading for every developer.',
        price: 1999, discountPrice: 1499, stock: 80, category: c['Books & Stationery'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=600'],
        isFeatured: false, rating: 4.9, numReviews: 145, soldCount: 520
      },
      {
        name: 'Sakura Pigma Micron Fineliner Pen Set 8-Piece',
        description: 'Archival-quality pigment ink, 0.2 to 0.8mm line widths, waterproof, fade-proof — favoured by architects and illustrators.',
        price: 1199, discountPrice: 849, stock: 180, category: c['Books & Stationery'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600'],
        isFeatured: false, rating: 4.7, numReviews: 92, soldCount: 310
      },
      {
        name: 'A5 Weekly Planner & Goal Tracker 2026',
        description: 'Undated weekly planner, monthly overview, habit tracker, project planning spreads, 160gsm FSC-certified paper.',
        price: 799, discountPrice: 549, stock: 250, category: c['Books & Stationery'], vendor: v0._id,
        images: ['https://images.unsplash.com/photo-1506784926709-22f1ec395907?w=600'],
        isFeatured: false, rating: 4.6, numReviews: 130, soldCount: 450
      },

      // ── PLANTS & GARDEN (6) ─────────────────────────────────
      {
        name: 'Monstera Deliciosa Swiss Cheese Plant',
        description: 'Potted in a 10-inch hand-finished terracotta planter. Vibrant splits, low-maintenance, air-purifying statement plant.',
        price: 2999, discountPrice: 2199, stock: 40, category: c['Plants & Garden'], vendor: v3._id,
        images: ['https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=600'],
        isFeatured: true, rating: 4.9, numReviews: 60, soldCount: 180
      },
      {
        name: 'Fiddle Leaf Fig Indoor Tree',
        description: 'Statement fig tree in 12-inch ceramic glazed pot. Large architectural leaves, air-purifying, ideal focal point for living rooms.',
        price: 3999, discountPrice: 2899, stock: 25, category: c['Plants & Garden'], vendor: v3._id,
        images: ['https://images.unsplash.com/photo-1463320898484-cdee8141c787?w=600'],
        isFeatured: false, rating: 4.7, numReviews: 30, soldCount: 55
      },
      {
        name: 'Succulent & Cactus Desk Garden Set of 6',
        description: '6 assorted succulent and cactus varieties in hand-painted terracotta pots. Zero-maintenance, perfect desk companions.',
        price: 1499, discountPrice: 1099, stock: 60, category: c['Plants & Garden'], vendor: v3._id,
        images: ['https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600'],
        isFeatured: false, rating: 4.8, numReviews: 95, soldCount: 320
      },
      {
        name: 'Peace Lily Air Purifier Plant (Large)',
        description: 'NASA-approved air-purifying plant in 8-inch ceramic white pot. Removes benzene & formaldehyde, thrives in low light.',
        price: 1999, discountPrice: 1399, stock: 50, category: c['Plants & Garden'], vendor: v3._id,
        images: ['https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600'],
        isFeatured: false, rating: 4.7, numReviews: 48, soldCount: 130
      },
      {
        name: 'Bonsai Ficus Starter Kit with Ceramic Pot',
        description: 'Pre-grown Ficus microcarpa bonsai in hand-painted drip-glaze ceramic pot, bamboo tray, training wire and care booklet.',
        price: 3499, discountPrice: 2499, stock: 30, category: c['Plants & Garden'], vendor: v3._id,
        images: ['https://images.unsplash.com/photo-1599598425947-5202edd56bdb?w=600'],
        isFeatured: false, rating: 4.6, numReviews: 36, soldCount: 75
      },
      {
        name: 'Indoor Herb Garden Grow Kit (Basil, Mint, Coriander)',
        description: 'Self-watering bamboo planter box, organic coco-peat discs, heirloom seed packets, pH tester strip. Ready to grow in 7 days.',
        price: 1299, discountPrice: 899, stock: 80, category: c['Plants & Garden'], vendor: v3._id,
        images: ['https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600'],
        isFeatured: false, rating: 4.8, numReviews: 110, soldCount: 380
      }
    ];

    await Product.insertMany(productsData);

    // Sample order using first two products
    const firstTwo = await Product.find().limit(2);
    if (firstTwo.length >= 2) {
      await Order.create({
        customer: customer1._id,
        items: [
          { product: firstTwo[0]._id, vendor: v0._id, name: firstTwo[0].name, quantity: 1, price: firstTwo[0].discountPrice, status: 'Delivered' },
          { product: firstTwo[1]._id, vendor: v0._id, name: firstTwo[1].name, quantity: 1, price: firstTwo[1].discountPrice, status: 'Delivered' }
        ],
        shippingAddress: customer1.addresses[0],
        totalAmount: firstTwo[0].discountPrice + firstTwo[1].discountPrice,
        paymentStatus: 'Paid', paymentMethod: 'Card', orderStatus: 'Delivered'
      });
    }

    console.log(`[ShopSphere DB] Auto-seed complete: ${productsData.length} products, 8 categories, 5 vendors, 3 demo users.`);
  } catch (err) {
    console.error('[ShopSphere DB] Auto-seed error:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// CONNECT DB
// ─────────────────────────────────────────────────────────────
const connectDB = async () => {
  let mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shopsphere';

  try {
    const conn = await mongoose.connect(mongoUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 3000
    });
    console.log(`[ShopSphere DB] Connected to MongoDB: ${conn.connection.host}`);
    await autoSeed();
  } catch (error) {
    console.warn(`[ShopSphere DB Warning] Local MongoDB not available on ${mongoUri}.`);
    try {
      console.log(`[ShopSphere DB] Initializing MongoMemoryServer fallback...`);
      const { MongoMemoryReplSet } = require('mongodb-memory-server');
      const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      const memoryUri = replSet.getUri();
      await mongoose.connect(memoryUri, { autoIndex: true });
      console.log(`[ShopSphere DB] Fallback: MongoMemoryServer with ReplicaSet ACID Transaction support!`);
      await autoSeed();
    } catch (memError) {
      console.error(`[ShopSphere DB Error] Connection failed:`, memError.message);
      process.exit(1);
    }
  }
};

module.exports = connectDB;
