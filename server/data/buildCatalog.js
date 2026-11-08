'use strict';
/**
 * Catalog Compiler & Live Validator
 * Generates server/data/products300.json with exactly 300 unique products
 * across 8 categories according to the target distribution:
 *
 * Target Distribution:
 * - Electronics:        40
 * - Clothing:           40
 * - Shoes:              35
 * - Home & Kitchen:     40
 * - Beauty & Skincare:  35
 * - Sports & Fitness:   35
 * - Books & Stationery: 35
 * - Plants & Garden:    40
 * TOTAL: 300
 */

const fs = require('fs');
const path = require('path');
const { BOOK_ISBNS, STATIONERY_ITEMS, PLANT_ITEMS } = require('./supplementalData');

// Helper to convert USD prices from DummyJSON to realistic Indian Rupee (INR) amounts
function toINR(usdPrice, category) {
  let inr = Math.round(usdPrice * 85);
  // Round to friendly consumer prices (e.g. ending in 99, 499, 999)
  if (inr < 500) {
    inr = Math.max(299, Math.round(inr / 50) * 50 - 1);
  } else if (inr < 2000) {
    inr = Math.round(inr / 100) * 100 - 1;
  } else if (inr < 10000) {
    inr = Math.round(inr / 500) * 500 - 1;
  } else {
    inr = Math.round(inr / 1000) * 1000 - 1;
  }
  return inr;
}

function computeDiscountPrice(price, discountPercentage) {
  const pct = discountPercentage && discountPercentage > 0 ? discountPercentage : 15;
  const rawDiscount = price * (1 - pct / 100);
  let disc = Math.round(rawDiscount);
  if (disc >= price) disc = Math.round(price * 0.85);
  // Friendly ending
  if (disc > 1000) disc = Math.round(disc / 100) * 100 - 1;
  return disc;
}

async function buildCatalog() {
  console.log('[Catalog Builder] Fetching DummyJSON product catalog...');
  const res = await fetch('https://dummyjson.com/products?limit=250');
  const dummyData = await res.json();
  const dummyProducts = dummyData.products || [];
  console.log(`[Catalog Builder] Retrieved ${dummyProducts.length} raw products from DummyJSON.`);

  const catalog = {
    'Electronics': [],
    'Clothing': [],
    'Shoes': [],
    'Home & Kitchen': [],
    'Beauty & Skincare': [],
    'Sports & Fitness': [],
    'Books & Stationery': [],
    'Plants & Garden': []
  };

  const usedNames = new Set();

  function addProduct(categoryName, prod) {
    if (catalog[categoryName].length >= getTargetCount(categoryName)) {
      return false;
    }
    let name = prod.name.trim();
    if (usedNames.has(name.toLowerCase())) {
      name = `${name} Special Edition`;
    }
    if (usedNames.has(name.toLowerCase())) {
      name = `${name} Pro`;
    }
    usedNames.add(name.toLowerCase());

    const price = Math.max(199, Number(prod.price) || 999);
    let discountPrice = Number(prod.discountPrice);
    if (!discountPrice || discountPrice >= price || discountPrice <= 0) {
      discountPrice = Math.round(price * 0.8);
    }

    catalog[categoryName].push({
      name,
      categoryName,
      description: prod.description || `High-quality ${name} designed for superior durability and everyday performance.`,
      price,
      discountPrice,
      stock: Math.max(8, Number(prod.stock) || 30),
      rating: Number((prod.rating ? Math.min(5.0, Math.max(3.8, Number(prod.rating))) : 4.5).toFixed(1)),
      numReviews: Number(prod.numReviews) || Math.floor(Math.random() * 80) + 15,
      soldCount: Number(prod.soldCount) || Math.floor(Math.random() * 250) + 40,
      images: Array.isArray(prod.images) && prod.images.length > 0 ? prod.images : [prod.image],
      isFeatured: Boolean(prod.isFeatured),
      isActive: true
    });
    return true;
  }

  function getTargetCount(cat) {
    switch (cat) {
      case 'Electronics': return 40;
      case 'Clothing': return 40;
      case 'Shoes': return 35;
      case 'Home & Kitchen': return 40;
      case 'Beauty & Skincare': return 35;
      case 'Sports & Fitness': return 35;
      case 'Books & Stationery': return 35;
      case 'Plants & Garden': return 40;
      default: return 0;
    }
  }

  // 1. ELECTRONICS (Target: 40)
  // DummyJSON categories: smartphones (16), laptops (5), tablets (3), mobile-accessories (14) = 38
  const elecSources = dummyProducts.filter(p =>
    ['smartphones', 'laptops', 'tablets', 'mobile-accessories'].includes(p.category)
  );
  for (const p of elecSources) {
    const price = toINR(p.price, 'Electronics');
    const discountPrice = computeDiscountPrice(price, p.discountPercentage);
    addProduct('Electronics', {
      name: p.title,
      description: p.description,
      price,
      discountPrice,
      stock: p.stock || 25,
      rating: p.rating || 4.6,
      images: p.images && p.images.length > 0 ? p.images : [p.thumbnail],
      isFeatured: catalog['Electronics'].length < 5
    });
  }

  // 2 additional high-tech electronics to reach exact 40
  const extraElectronics = [
    {
      name: 'AeroBlade Cyber Gaming Laptop 16 Pro',
      description: 'Intel i9-14900HX, NVIDIA RTX 4080 12GB, 32GB DDR5 RAM, 1TB NVMe SSD, 240Hz QHD OLED — built for hardcore gaming and 3D rendering.',
      price: 185000, discountPrice: 169999, stock: 12, rating: 4.9, numReviews: 48, soldCount: 95,
      images: ['https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=600'], isFeatured: true
    },
    {
      name: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
      description: 'Industry-leading noise cancellation with two processors and 8 microphones, Hi-Res Audio, crystal-clear hands-free calling, 30-hour battery life.',
      price: 29990, discountPrice: 26990, stock: 40, rating: 4.8, numReviews: 120, soldCount: 350,
      images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'], isFeatured: true
    }
  ];
  for (const p of extraElectronics) addProduct('Electronics', p);

  // 2. HOME & KITCHEN (Target: 40)
  // DummyJSON categories: kitchen-accessories (30), furniture (5), home-decoration (5) = 40
  const homeSources = dummyProducts.filter(p =>
    ['kitchen-accessories', 'furniture', 'home-decoration'].includes(p.category)
  );
  for (const p of homeSources) {
    const price = toINR(p.price, 'Home & Kitchen');
    const discountPrice = computeDiscountPrice(price, p.discountPercentage);
    addProduct('Home & Kitchen', {
      name: p.title,
      description: p.description,
      price,
      discountPrice,
      stock: p.stock || 30,
      rating: p.rating || 4.5,
      images: p.images && p.images.length > 0 ? p.images : [p.thumbnail],
      isFeatured: catalog['Home & Kitchen'].length < 5
    });
  }

  // 3. SPORTS & FITNESS (Target: 35)
  // DummyJSON categories: sports-accessories (17)
  const sportsSources = dummyProducts.filter(p => p.category === 'sports-accessories');
  for (const p of sportsSources) {
    const price = toINR(p.price, 'Sports & Fitness');
    const discountPrice = computeDiscountPrice(price, p.discountPercentage);
    addProduct('Sports & Fitness', {
      name: p.title,
      description: p.description,
      price,
      discountPrice,
      stock: p.stock || 35,
      rating: p.rating || 4.5,
      images: p.images && p.images.length > 0 ? p.images : [p.thumbnail],
      isFeatured: catalog['Sports & Fitness'].length < 4
    });
  }

  // 18 Additional Gym & Fitness Gear
  const extraSports = [
    { name: 'PowerMax Elite Adjustable Dumbbell 24kg Single', desc: '15 weight settings in one dial, from 2.5kg to 24kg. Compact space-saving cast iron dumbbell.', price: 14999, disc: 11999, img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600' },
    { name: 'ProForm Natural High-Density Cork Yoga Mat 6mm', desc: 'Natural Portuguese cork top layer, non-slip recycled rubber base, antimicrobial surface with carry strap.', price: 3499, disc: 2499, img: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=600' },
    { name: 'Competition Solid Cast Iron Kettlebell 16kg', desc: 'Gravity-cast single piece iron kettlebell, flat machined base, smooth wide handle for two-handed swings.', price: 4499, disc: 3499, img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600' },
    { name: 'Heavy-Duty Resistance Loop Exercise Bands Set of 5', desc: '100% natural Malaysian latex loop bands ranging from 10 to 50 lbs resistance with compact carry pouch.', price: 1299, disc: 899, img: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600' },
    { name: 'Deep Tissue Grid Trigger Foam Roller 33cm', desc: 'High-density EVA foam with multi-density grid pattern for myofascial release, relieving tightness and soreness.', price: 1499, disc: 999, img: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600' },
    { name: 'Pro Speed Bearing Wire Jump Rope for Crossfit', desc: 'Dual 360-degree ball bearings, tangle-free coated wire cable, ergonomic aluminum non-slip knurled handles.', price: 999, disc: 699, img: 'https://images.unsplash.com/photo-1434682881908-b43d0467b798?w=600' },
    { name: 'Elite Leather Weightlifting Lever Belt 10mm', desc: 'Top-grain cowhide leather, heavy-duty stainless steel quick-release lever buckle, 4-inch uniform width.', price: 5999, disc: 4499, img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600' },
    { name: 'Heavy-Bag Training Boxing Gloves 14oz Synthetic Leather', desc: 'Multi-layer foam padding, breathable mesh palm, full wrap-around hook-and-loop wrist strap.', price: 2999, disc: 2199, img: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600' },
    { name: 'Adjustable Foldable Incline Decline Workout Bench', desc: 'Commercial steel frame, 7 backrest positions, 3 seat angles, high-density foam padding, 300kg capacity.', price: 11999, disc: 8999, img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600' },
    { name: 'Olympic Barbell Quick-Release Clamp Collars Pair', desc: 'Reinforced solid nylon resin frame, rubberized grip pads, fast locking snap-latch mechanism for 2" bars.', price: 899, disc: 649, img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600' },
    { name: 'Bodyweight Suspension Training Straps Pro Kit', desc: 'Industrial-grade nylon webbing, rubber handles, integrated foot cradles, door anchor and mesh travel bag.', price: 3499, disc: 2499, img: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600' },
    { name: 'Stainless Steel Insulated Protein Shaker Bottle 750ml', desc: 'Double-wall vacuum insulated kitchen-grade stainless steel, leak-proof flip cap, integrated blending whisk.', price: 1699, disc: 1299, img: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600' },
    { name: 'Wood Gymnastic Rings with Heavy-Duty Numbered Straps', desc: 'Smooth birch wood 32mm rings, 15ft heavy-duty straps with printed measurement markings and steel buckles.', price: 2799, disc: 2099, img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600' },
    { name: 'Ergonomic Push-Up Stand Bars with Foam Grip', desc: 'Sturdy steel S-shaped construction, angled to minimize wrist strain, non-skid rubber base pads.', price: 999, disc: 749, img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600' },
    { name: 'Adjustable Hand Grip Strengthener 10kg-60kg', desc: 'Stainless steel spring, textured rubber handle, rotatable dial to calibrate resistance for forearm training.', price: 699, disc: 499, img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600' },
    { name: 'Aerobic Exercise Stepper with Adjustable Risers', desc: 'Shock-absorbing non-stick textured surface, 3 adjustable height levels (10cm, 15cm, 20cm), 150kg weight limit.', price: 2499, disc: 1899, img: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600' },
    { name: 'Interlocking EVA Foam Gym Flooring Tiles 6-Pack', desc: 'High-density 12mm thick protective floor mats with border edges, water-resistant and noise-reducing.', price: 1999, disc: 1499, img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600' },
    { name: 'Foldable Magnetic Rowing Machine with LCD Display', desc: '8 magnetic resistance levels, silent belt drive, molded padded seat, foldable vertical storage design.', price: 24999, disc: 19999, img: 'https://images.unsplash.com/photo-1591291621164-2c6367723315?w=600' }
  ];
  for (const s of extraSports) {
    addProduct('Sports & Fitness', {
      name: s.name,
      description: s.desc,
      price: s.price,
      discountPrice: s.disc,
      stock: 25,
      rating: 4.7,
      images: [s.img],
      isFeatured: false
    });
  }

  // 4. BEAUTY & SKINCARE (Target: 35)
  // DummyJSON categories: beauty (5), fragrances (5), skin-care (3) = 13
  const beautySources = dummyProducts.filter(p =>
    ['beauty', 'fragrances', 'skin-care'].includes(p.category)
  );
  for (const p of beautySources) {
    const price = toINR(p.price, 'Beauty & Skincare');
    const discountPrice = computeDiscountPrice(price, p.discountPercentage);
    addProduct('Beauty & Skincare', {
      name: p.title,
      description: p.description,
      price,
      discountPrice,
      stock: p.stock || 40,
      rating: p.rating || 4.6,
      images: p.images && p.images.length > 0 ? p.images : [p.thumbnail],
      isFeatured: catalog['Beauty & Skincare'].length < 4
    });
  }

  // 22 Additional Skincare / Cosmetics Products
  const extraBeauty = [
    { name: 'HydraGlow 20% Vitamin C + Ferulic Acid Serum', desc: 'Stable L-ascorbic acid with pure ferulic acid and hyaluronic acid to brighten dull skin, even tone, and boost collagen.', price: 1999, disc: 1499, img: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600' },
    { name: 'Advanced Encapsulated Retinol 0.5% Night Cream', desc: 'Slow-release micro-encapsulated retinol with peptides and niacinamide to accelerate cellular renewal without irritation.', price: 2199, disc: 1699, img: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600' },
    { name: '2% BHA Salicylic Acid Pore Clarifying Liquid', desc: 'Leave-on liquid exfoliant that unclogs enlarged pores, smooths texture, and gently clears stubborn blackheads.', price: 1499, disc: 1199, img: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600' },
    { name: 'Niacinamide 10% + Zinc 1% Oil Control Serum', desc: 'High-strength vitamin and mineral blemish formula that balances sebum activity and minimizes pore congestion.', price: 999, disc: 749, img: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=600' },
    { name: 'Centella Asiatica Soothing Barrier Relief Gel', desc: '92% fermented Cica extract with madecassoside to instantly calm redness, repair compromised skin barriers, and hydrate.', price: 1299, disc: 999, img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600' },
    { name: 'Multi-Molecular Hyaluronic Acid Hydrating Gel', desc: '5 distinct molecular weights of sodium hyaluronate providing multi-depth hydration for plump, bouncy skin.', price: 1199, disc: 899, img: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600' },
    { name: 'Broad Spectrum SPF 50+ Invisible Matte Sunscreen Gel', desc: 'Zero white cast, non-greasy water-resistant chemical sunscreen formulated with aloe vera and vitamin E.', price: 1399, disc: 999, img: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=600' },
    { name: 'Japanese Camellia Deep Cleansing Facial Oil', desc: 'Gentle emulsifying botanical oil cleanser that dissolves stubborn waterproof makeup without stripping natural lipids.', price: 1799, disc: 1349, img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600' },
    { name: 'Gentle Hydrating Ceramide Foaming Face Wash', desc: 'Soap-free pH 5.5 daily cleanser with 3 essential ceramides, amino acids, and soothing oat milk extract.', price: 899, disc: 699, img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600' },
    { name: 'Organic Bulgarian Rosewater Facial Mist Toner', desc: '100% pure steam-distilled Rosa Damascena floral water to refresh, balance pH, and prep skin for serums.', price: 799, disc: 599, img: 'https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=600' },
    { name: '100% Pure Cold-Pressed Moroccan Argan Oil 50ml', desc: 'Unrefined certified organic liquid gold packed with oleic acid, linoleic acid, and vitamin E for hair and skin.', price: 1599, disc: 1199, img: 'https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=600' },
    { name: 'Shea Butter & Peptide Intensive Lip Repair Balm', desc: 'Deeply restorative overnight lip butter with shea, cupuacu butter, and vegan peptides to heal chapped lips.', price: 599, disc: 449, img: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600' },
    { name: 'Himalayan Pink Salt & Arabica Coffee Body Scrub', desc: 'Exfoliating blend of mineral-rich Himalayan crystals, organic ground Arabica beans, sweet almond oil, and raw cacao.', price: 999, disc: 749, img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600' },
    { name: 'Hydrolyzed Marine Collagen Firming Eye Gel', desc: 'Cooling roll-on applicator infused with caffeine, marine collagen, and eyebright extract to de-puff morning bags.', price: 1299, disc: 949, img: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600' },
    { name: 'Glycolic Acid 7% Resurfacing Exfoliating Toner', desc: 'Alpha hydroxy acid clarifying toner with Tasmanian pepperberry, ginseng root, and aloe vera for radiant glow.', price: 1099, disc: 849, img: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=600' },
    { name: 'Bamboo Charcoal Detoxifying Mineral Mud Mask', desc: 'Activated bamboo carbon with Dead Sea mineral mud to vacuum impurities, excess oil, and environmental pollution.', price: 899, disc: 649, img: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600' },
    { name: 'Ceramide & Squalane Moisture Barrier Recovery Balm', desc: 'Rich lipid repair salve with 5:1:1 physiological ceramide ratio, plant squalane, and colloidal oatmeal.', price: 1699, disc: 1299, img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600' },
    { name: 'Oat Extract Calming & Soothing Facial Serum', desc: 'Concentrated colloidal oat suspension with beta-glucan to soothe flare-ups, eczema-prone skin, and stinging.', price: 1199, disc: 899, img: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600' },
    { name: 'Fermented Rice Water Brightening Glow Essence', desc: 'Korean galactomyces ferment filtrate with arbutin to soften texture, fade post-acne dark marks, and illuminate.', price: 1399, disc: 1049, img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600' },
    { name: 'Probiotics Balancing Lightweight Daily Moisturizer', desc: 'Lactobacillus ferment lysate with panthenol B5, providing oil-free microbiome-friendly hydration all day.', price: 1199, disc: 899, img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600' },
    { name: 'Tea Tree & Witch Hazel Clarifying Spot Treatment', desc: 'Targeted drying lotion with 100% Australian tea tree oil, sulfur, and zinc oxide to rapidly shrink whiteheads.', price: 699, disc: 499, img: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600' },
    { name: 'Botanical Argan & Keratin Deep Conditioning Mask', desc: 'Intensive rinse-out salon reconstructor with hydrolysed keratin, panthenol, and shea butter for frizz-free silky hair.', price: 1299, disc: 949, img: 'https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=600' }
  ];
  for (const b of extraBeauty) {
    addProduct('Beauty & Skincare', {
      name: b.name,
      description: b.desc,
      price: b.price,
      discountPrice: b.disc,
      stock: 45,
      rating: 4.8,
      images: [b.img],
      isFeatured: false
    });
  }

  // 5. SHOES (Target: 35)
  // DummyJSON categories: mens-shoes (5), womens-shoes (5) = 10
  const shoeSources = dummyProducts.filter(p => ['mens-shoes', 'womens-shoes'].includes(p.category));
  for (const p of shoeSources) {
    const price = toINR(p.price, 'Shoes');
    const discountPrice = computeDiscountPrice(price, p.discountPercentage);
    addProduct('Shoes', {
      name: p.title,
      description: p.description,
      price,
      discountPrice,
      stock: p.stock || 25,
      rating: p.rating || 4.6,
      images: p.images && p.images.length > 0 ? p.images : [p.thumbnail],
      isFeatured: catalog['Shoes'].length < 4
    });
  }

  // 25 Additional Footwear models
  const extraShoes = [
    { name: 'Apex Runner Carbon Plate Road Racing Shoes', desc: 'Full-length carbon fiber propulsion plate, nitrogen-infused supercritical foam midsole, breathable engineered mesh upper.', price: 16999, disc: 13999, img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600' },
    { name: 'Handcrafted Goodyear Welted Oxford Leather Shoes', desc: 'Full-grain calfskin leather, double oak-tanned leather sole, Goodyear welt construction, hand-burnished cognac finish.', price: 18999, disc: 14999, img: 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=600' },
    { name: 'Classic Chelsea Suede Leather Ankle Boots', desc: 'Water-repellent European suede leather, elasticized side gussets, stacked leather heel with non-slip rubber commando sole.', price: 8999, disc: 6999, img: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=600' },
    { name: 'Gore-Tex Waterproof Mountain Hiking Boots', desc: 'Vibram Megagrip lug outsole, waterproof breathable Gore-Tex membrane, protective rubber rand, ergonomic ankle collar.', price: 14999, disc: 11999, img: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600' },
    { name: 'Minimalist Wide Toe-Box Barefoot Trainers', desc: 'Zero-drop heel-to-toe, flexible 4mm puncture-resistant sole, wide anatomical toe box allowing natural splay.', price: 5999, disc: 4499, img: 'https://images.unsplash.com/photo-1539185441755-769473a23570?w=600' },
    { name: 'Classic White Leather Low-Top Tennis Sneakers', desc: 'Buttery smooth Nappa leather, vulcanized rubber cupsole, padded collar, understated minimalist profile.', price: 6999, disc: 4999, img: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600' },
    { name: 'Chunky Lug-Sole Combat Boots in Polished Leather', desc: '8-eyelet lace-up silhouette, inside brass zip for quick access, heavy lugged cleated sole, durable pull tab.', price: 9999, disc: 7499, img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600' },
    { name: 'Breathable Knit Cushion Running Sneakers', desc: 'Seamless sock-like Flyknit upper, responsive high-rebound EVA midsole, durable carbon rubber high-wear zones.', price: 4999, disc: 3799, img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600' },
    { name: 'Handwoven Espadrille Canvas Slip-On Shoes', desc: 'Natural jute rope midsole, breathable organic cotton canvas upper, flexible non-slip natural rubber under-sole.', price: 2999, disc: 1999, img: 'https://images.unsplash.com/photo-1465877783223-4eba513e27c6?w=600' },
    { name: 'Italian Leather Penny Loafers with Moc-Toe Stitch', desc: 'Classic penny keeper strap, unlined supple leather for barefoot comfort, flexible Blake-stitched leather sole.', price: 11999, disc: 8999, img: 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=600' },
    { name: 'Trail-Ready Outdoor Shoes with Vibram Traction', desc: 'Rugged ripstop upper with TPU overlays, rock protection plate in forefoot, quick-lace drawstring cord system.', price: 8499, disc: 6499, img: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600' },
    { name: 'Cushioned Orthopedic Recovery Walking Clogs', desc: 'High-density closed-cell foam with contoured arch support and deep heel cup to soothe tired feet after sports.', price: 3499, disc: 2499, img: 'https://images.unsplash.com/photo-1539185441755-769473a23570?w=600' },
    { name: 'Retro High-Top Basketball Leather Sneakers', desc: 'Padded ankle collar, perforated toe box, pivot-point traction herringbone rubber sole, vintage two-tone colorway.', price: 8999, disc: 6999, img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600' },
    { name: 'Low-Profile Skateboarding Canvas Shoes', desc: 'Double-wrapped foxing tape, padded collar, sticky gum waffle outsole for board grip, reinforced ollie patch.', price: 3999, disc: 2999, img: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600' },
    { name: 'All-Weather Insulated Winter Duck Boots', desc: 'Waterproof molded rubber shell bottom, 200g Thinsulate insulation, full-grain oiled leather shaft, shearling lining.', price: 10999, disc: 8499, img: 'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?w=600' },
    { name: 'Cap-Toe Derby Formal Shoes in Dark Espresso', desc: 'Blind eyelets, clean cap-toe stitching, cushioned footbed, non-marking composite dress sole for all-day office comfort.', price: 7999, disc: 5999, img: 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=600' },
    { name: 'Slip-On Driving Moccasins in Velvety Nubuck', desc: 'Split rubber pod sole extending up the heel counter, contrast hand-stitching, ultra-flexible leather construction.', price: 5499, disc: 3999, img: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=600' },
    { name: 'Cross-Training High-Impact Stability Shoes', desc: 'Flat stable heel for heavy squats and deadlifts, flexible forefoot for lunges and burpees, durable side rope-wraps.', price: 7499, disc: 5499, img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600' },
    { name: 'Bohemian Braided Strappy Flat Sandals', desc: 'Hand-braided vegetable-tanned leather straps, cushioned suede footbed, flexible non-slip natural crepe sole.', price: 2999, disc: 2199, img: 'https://images.unsplash.com/photo-1465877783223-4eba513e27c6?w=600' },
    { name: 'Spikeless Waterproof Leather Golf Shoes', desc: 'Full-grain treated leather, integrated traction lugs for turf grip without damaging greens, cushioned EVA midsole.', price: 9999, disc: 7499, img: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600' },
    { name: 'Waterproof Neoprene Ankle Deck Boots', desc: '100% waterproof 4mm neoprene with rubber overlay, non-marking chevron slip-resistant outsole, pull loops.', price: 6499, disc: 4999, img: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=600' },
    { name: 'Classic Double-Monk Strap Dress Shoes in Burnished Tan', desc: 'Twin buckle straps over instep, chisel toe profile, handcrafted Argentine leather sole with rubber heel insert.', price: 12999, disc: 9499, img: 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=600' },
    { name: 'Ergonomic Arch-Support Slide Recovery Sandals', desc: 'Waterproof molded EVA foam slide with deep heel cup and pronounced arch support for post-workout recovery.', price: 2199, disc: 1599, img: 'https://images.unsplash.com/photo-1539185441755-769473a23570?w=600' },
    { name: 'Water-Resistant Cordura Winter Booties with Zip', desc: 'DWR-treated Cordura nylon shell, cozy fleece lining, side YKK waterproof zipper, anti-slip Arctic grip sole.', price: 7999, disc: 5999, img: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=600' },
    { name: 'Heritage Suede Chukka Desert Boots', desc: 'Two-eyelet desert boot pattern, rich unlined suede, plantation crepe sole, effortless casual weekend pairing.', price: 6999, disc: 5299, img: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=600' }
  ];
  for (const s of extraShoes) {
    addProduct('Shoes', {
      name: s.name,
      description: s.desc,
      price: s.price,
      discountPrice: s.disc,
      stock: 30,
      rating: 4.7,
      images: [s.img],
      isFeatured: false
    });
  }

  // 6. CLOTHING (Target: 40)
  // DummyJSON categories: mens-shirts (5), tops (5), womens-dresses (5), womens-bags (5), sunglasses (5), mens-watches (6) = 31
  const clothSources = dummyProducts.filter(p =>
    ['mens-shirts', 'tops', 'womens-dresses', 'womens-bags', 'sunglasses', 'mens-watches'].includes(p.category)
  );
  for (const p of clothSources) {
    const price = toINR(p.price, 'Clothing');
    const discountPrice = computeDiscountPrice(price, p.discountPercentage);
    addProduct('Clothing', {
      name: p.title,
      description: p.description,
      price,
      discountPrice,
      stock: p.stock || 45,
      rating: p.rating || 4.5,
      images: p.images && p.images.length > 0 ? p.images : [p.thumbnail],
      isFeatured: catalog['Clothing'].length < 5
    });
  }

  // 9 Additional Premium Apparel items to hit 40
  const extraClothing = [
    { name: 'Vintage Distressed Italian Leather Biker Jacket', desc: 'Handcrafted 100% full-grain calfskin leather, satin interior lining, asymmetric heavy YKK zips, vintage motorcycle cut.', price: 28999, disc: 22499, img: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600' },
    { name: 'Heavyweight 450 GSM Organic Cotton Boxy Hoodie', desc: 'GOTS certified organic cotton, double-layered hood, ribbed side gussets, pre-shrunk heavyweight French terry.', price: 4999, disc: 3499, img: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=600' },
    { name: 'Superfine 18.5 Micron Merino Wool Blazer', desc: 'Pure Merino wool, half-canvas chest piece, notch lapels, horn buttons, breathable four-season luxury drape.', price: 19999, disc: 15999, img: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600' },
    { name: 'Technical 4-Way Stretch Cargo Jogger Pants', desc: 'Water-resistant DWR finish, zippered cargo utility pockets, articulated knee seams, tapered elastic cuffs.', price: 3999, disc: 2799, img: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600' },
    { name: 'Bamboo Fiber Breathable Essential V-Neck Tee 3-Pack', desc: '70% bamboo viscose, 30% organic cotton, silky soft handfeel, natural odor resistance, tagless collar.', price: 2999, disc: 1999, img: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600' },
    { name: 'British Millerain Waxed Canvas Field Jacket', desc: 'Weatherproof staywax canvas shell, corduroy collar, flannel handwarmer pockets, brass snaps and storm flap.', price: 12999, disc: 9999, img: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=600' },
    { name: 'Japanese 14.5oz Raw Selvedge Denim Jeans', desc: 'Kuroki mills unsanforized raw denim, classic red selvedge ID line, hidden back pocket rivets, leather patch.', price: 8999, disc: 6999, img: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600' },
    { name: 'Pure Mulberry Silk Button-Down Collared Blouse', desc: 'Grade 6A 22-momme pure mulberry silk, mother-of-pearl buttons, relaxed French seam tailoring, breathable luster.', price: 8499, disc: 6299, img: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600' },
    { name: 'Relaxed Pure French Linen Resort Collar Shirt', desc: 'Normandy certified natural flax linen, garment-dyed, camp collar, shell buttons, airy breathable summer drape.', price: 4499, disc: 3299, img: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600' }
  ];
  for (const c of extraClothing) {
    addProduct('Clothing', {
      name: c.name,
      description: c.desc,
      price: c.price,
      discountPrice: c.disc,
      stock: 40,
      rating: 4.8,
      images: [c.img],
      isFeatured: false
    });
  }

  // 7. BOOKS & STATIONERY (Target: 35)
  // 25 Books with real ISBN covers
  for (const b of BOOK_ISBNS) {
    addProduct('Books & Stationery', {
      name: b.name,
      description: `Bestselling authoritative title by ${b.author}. Comprehensive reference, hardcover / premium edition covering key concepts with clarity.`,
      price: b.price,
      discountPrice: b.disc,
      stock: 50,
      rating: 4.9,
      images: [`https://covers.openlibrary.org/b/isbn/${b.isbn}-L.jpg`],
      isFeatured: catalog['Books & Stationery'].length < 4
    });
  }
  // 10 Stationery Items
  for (const s of STATIONERY_ITEMS) {
    addProduct('Books & Stationery', {
      name: s.name,
      description: s.description,
      price: s.price,
      discountPrice: s.discountPrice,
      stock: 60,
      rating: 4.7,
      images: [s.image],
      isFeatured: false
    });
  }

  // 8. PLANTS & GARDEN (Target: 40)
  // 40 Botanical Items
  for (const p of PLANT_ITEMS) {
    addProduct('Plants & Garden', {
      name: p.name,
      description: p.desc,
      price: p.price,
      discountPrice: p.disc,
      stock: 35,
      rating: 4.8,
      images: [p.img],
      isFeatured: catalog['Plants & Garden'].length < 5
    });
  }

  // Verification & Assembly
  const allProducts = [];
  console.log('\n[Catalog Builder] Category Counts Verification:');
  for (const [catName, prods] of Object.entries(catalog)) {
    console.log(`  - ${catName.padEnd(20)}: ${prods.length} (Target: ${getTargetCount(catName)})`);
    if (prods.length !== getTargetCount(catName)) {
      throw new Error(`Count mismatch for ${catName}: expected ${getTargetCount(catName)}, got ${prods.length}`);
    }
    allProducts.push(...prods);
  }

  console.log(`\n[Catalog Builder] Total compiled products: ${allProducts.length} (Target: 300)`);
  if (allProducts.length !== 300) {
    throw new Error(`Expected exactly 300 products, got ${allProducts.length}`);
  }

  // Check unique names
  const nameSet = new Set();
  for (const p of allProducts) {
    if (nameSet.has(p.name)) {
      throw new Error(`Duplicate product name detected: "${p.name}"`);
    }
    nameSet.add(p.name);
  }
  console.log('[Catalog Builder] All 300 product names are strictly unique.');

  // Validate images with async batch HEAD checks
  console.log('\n[Catalog Builder] Verifying image URLs accessibility...');
  let validCount = 0;
  let failCount = 0;
  const BATCH_SIZE = 25;

  for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
    const batch = allProducts.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (prod) => {
        const url = prod.images[0];
        try {
          const checkRes = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          if (checkRes.ok) {
            validCount++;
          } else {
            console.warn(`[Image Warn] ${prod.name} -> HTTP ${checkRes.status}: ${url}`);
            failCount++;
          }
        } catch (fetchErr) {
          console.warn(`[Image Error] ${prod.name} -> ${fetchErr.message}: ${url}`);
          failCount++;
        }
      })
    );
  }

  console.log(`[Catalog Builder] Image verification complete: ${validCount} valid HTTP 200, ${failCount} failed.`);
  if (failCount > 0) {
    console.warn(`[Catalog Builder] Warning: ${failCount} image URLs had fetch warnings.`);
  }

  // Save compiled dataset
  const outputPath = path.join(__dirname, 'products300.json');
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2), 'utf8');
  console.log(`[Catalog Builder] Successfully wrote ${allProducts.length} products to ${outputPath}`);
}

buildCatalog().catch(err => {
  console.error('[Catalog Builder Fatal Error]:', err);
  process.exit(1);
});
