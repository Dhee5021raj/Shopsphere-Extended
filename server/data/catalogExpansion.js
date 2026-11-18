'use strict';
/**
 * Catalog Expansion Generator
 *
 * Builds a deterministic set of additional marketplace products on top of the
 * curated 300-product base catalog (products300.json, which stays unchanged).
 *
 * Every generated product belongs to a concrete product TYPE (laptop, hoodie,
 * air fryer, ...). Each type has its own fictional brands, models, variants,
 * description and price band, and reuses photos from base-catalog products of
 * the same type, so a listing's picture always shows that kind of item.
 * Brands are fictional on purpose: no generated listing poses as a real brand.
 *
 *   const { buildExpansion } = require('./catalogExpansion');
 *   buildExpansion(baseProducts, { perCategory: 60 })  // -> [{ name, categoryName, ... }]
 *
 * Output is identical on every run (seeded PRNG), so re-seeding is idempotent
 * when products are matched by name.
 */

// Small deterministic PRNG (mulberry32) so prices/stock/ratings are stable.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Round to familiar retail price points (…99 / …499 / …999).
function retailPrice(raw) {
  if (raw < 1000) return Math.max(199, Math.round(raw / 50) * 50 - 1);
  if (raw < 10000) return Math.round(raw / 100) * 100 - 1;
  if (raw < 50000) return Math.round(raw / 500) * 500 - 1;
  return Math.round(raw / 1000) * 1000 - 1;
}

// `img` matches base-catalog product NAMES in the same category whose photos
// are reused for this type.
const TYPES = {
  Electronics: [
    { img: /laptop|macbook|matebook|zenbook|yoga|xps/i, brands: ['Voltrix', 'Nebula', 'Corelight', 'Arcforge'], models: ['AirBook 14', 'ProBook 16', 'Creator X15', 'Swift 13'], variants: ['16GB/512GB', '32GB/1TB'], price: [42000, 165000],
      desc: (n) => `${n} laptop with a bright IPS display, fast SSD storage, backlit keyboard and all-day battery life for work, study and light gaming.` },
    { img: /^iphone (\d+s?|x)( pro)?$|^samsung galaxy s\d+$|^(oppo|realme|vivo)\b/i, brands: ['Pixelon', 'Zentra', 'Orbix', 'Kairo'], models: ['Nova 5G', 'Edge Pro', 'Lite S', 'Max Ultra'], variants: ['128GB', '256GB'], price: [9999, 74999],
      desc: (n) => `${n} smartphone with a 120Hz AMOLED screen, triple camera system, 5000mAh battery and fast charging.` },
    { img: /ipad|tab/i, brands: ['Pixelon', 'Zentra', 'Lumina'], models: ['Pad 11', 'Tab S Air', 'Pad Mini 8'], variants: ['Wi-Fi 64GB', 'Wi-Fi 128GB', 'LTE 128GB'], price: [12999, 59999],
      desc: (n) => `${n} tablet with a slim aluminium body, stereo speakers and stylus support for notes, reading and streaming.` },
    { img: /airpods|earphones|beats|wh-1000/i, brands: ['SonicBay', 'Auralis', 'BassCraft', 'Hushwave'], models: ['Buds Pro', 'Pods Lite', 'Over-Ear ANC', 'Neckband Sport'], variants: ['Black', 'White', 'Navy'], price: [1499, 24999],
      desc: (n) => `${n} wireless audio with active noise cancellation, low-latency Bluetooth 5.3 and up to 30 hours of playback.` },
    { img: /watch/i, brands: ['Pulseon', 'Tempra', 'Kinetiq'], models: ['Fit Watch 3', 'Active GT', 'Smart Band 8'], variants: ['Black Strap', 'Silver Mesh', 'Olive Strap'], price: [2499, 29999],
      desc: (n) => `${n} smartwatch with heart-rate and SpO2 tracking, built-in GPS, sleep insights and a week-long battery.` },
    { img: /charger|battery|airpower/i, brands: ['Chargefy', 'VoltNest', 'Ampora'], models: [['GaN 65W Charger', /iphone charger/i], ['PowerBank 20000', /battery/i], ['MagPad Wireless', /airpower/i], ['Dual USB-C 35W', /iphone charger/i]], variants: ['White', 'Graphite'], price: [999, 5999],
      desc: (n) => `${n} with smart power delivery, over-heat protection and fast charging for phones, tablets and laptops.` },
    { img: /echo|homepod/i, brands: ['Auralis', 'Hushwave', 'Domio'], models: ['Home Speaker', 'Smart Speaker Mini', 'Room Speaker Max'], variants: ['Charcoal', 'Chalk', 'Sage'], price: [2999, 19999],
      desc: (n) => `${n} smart speaker with room-filling 360° sound, far-field microphones and multi-room playback.` }
  ],
  Clothing: [
    { img: /shirt|tshirt|plaid|check/i, brands: ['Northloom', 'Urbanthread', 'Kestrel & Co', 'Mavenwear'], models: ['Oxford Shirt', 'Flannel Check Shirt', 'Linen Casual Shirt', 'Crew Neck Tee'], variants: ['Navy', 'White', 'Olive'], price: [699, 3499],
      desc: (n) => `${n} cut from soft breathable fabric with reinforced seams and a modern regular fit.` },
    { img: /dress|frock|gown|corset|top/i, brands: ['Verella', 'Lune Atelier', 'Rosmarin'], models: ['Wrap Midi Dress', 'Tiered Maxi Dress', 'Shift Dress', 'A-Line Sundress'], variants: ['Floral Print', 'Black', 'Terracotta'], price: [1199, 5999],
      desc: (n) => `${n} in a flowing lightweight weave with a flattering silhouette for day-to-evening wear.` },
    { img: /bag|handbag/i, brands: ['Verella', 'Carryon Studio', 'Tanhide'], models: ['Leather Tote', 'Crossbody Bag', 'Structured Satchel', 'Mini Shoulder Bag'], variants: ['Tan', 'Black', 'Burgundy'], price: [1499, 8999],
      desc: (n) => `${n} with sturdy stitched handles, a zipped inner pocket and an adjustable strap.` },
    { img: /watch|rolex|longines/i, brands: ['Tempra', 'Halden', 'Marquee'], models: ['Classic Chronograph', 'Minimal Dress Watch', 'Diver Automatic'], variants: ['Leather Strap', 'Steel Bracelet', 'Mesh Strap'], price: [2499, 24999],
      desc: (n) => `${n} with a scratch-resistant mineral crystal, 50m water resistance and a precise quartz movement.` },
    { img: /glasses/i, brands: ['Solace Optics', 'Ravenshade', 'Kestrel & Co'], models: ['Aviator Sunglasses', 'Wayfarer Sunglasses', 'Round Polarised Shades'], variants: ['Gunmetal', 'Tortoise', 'Matte Black'], price: [799, 4999],
      desc: (n) => `${n} with polarised UV400 lenses and a lightweight, durable frame.` },
    { img: /jacket|hoodie|blazer|jogger|jeans|v-neck|boxy/i, brands: ['Northloom', 'Urbanthread', 'Mavenwear'], models: [['Field Jacket', /field jac|biker/i], ['Selvedge Denim Jeans', /jeans/i], ['Cargo Joggers', /jogger/i], ['Wool Blazer', /blazer/i]], variants: ['Charcoal', 'Indigo', 'Stone'], price: [1299, 6999],
      desc: (n) => `${n} built for everyday comfort with a relaxed fit, durable fabric and fade-resistant colour.` }
  ],
  Shoes: [
    { img: /sneaker|trainer|runner|running|jordan|rider|cross-training/i, brands: ['Stridex', 'Paceline', 'Aerostep', 'Vantro'], models: ['Cloud Runner', 'Court Classic', 'Tempo Knit', 'Street Low'], variants: ['White', 'Black', 'Grey'], price: [1999, 11999],
      desc: (n) => `${n} sneakers with a cushioned midsole, breathable upper and grippy rubber outsole.` },
    { img: /boot|chukka|chelsea/i, brands: ['Ridgemoor', 'Brogan & Hale', 'Trailforge'], models: ['Chelsea Boot', 'Hiking Boot', 'Lace-Up Work Boot', 'Desert Boot'], variants: ['Brown', 'Black', 'Tan'], price: [2999, 13999],
      desc: (n) => `${n} with a padded collar, cushioned footbed and durable lug sole for all-weather wear.` },
    { img: /oxford|derby|loafer|monk|moccasin/i, brands: ['Brogan & Hale', 'Calloway', 'Vantro'], models: ['Leather Oxford', 'Penny Loafer', 'Derby Shoe', 'Driving Moccasin'], variants: ['Dark Brown', 'Black', 'Cognac'], price: [2499, 9999],
      desc: (n) => `${n} in polished genuine leather with a cushioned insole for long days at the office.` },
    { img: /heel|slipper|sandal|espadrille|golden|slide/i, brands: ['Lune Atelier', 'Sundaze', 'Verella'], models: ['Block Heel Sandal', 'Strappy Flat', 'Comfort Slide', 'Espadrille'], variants: ['Nude', 'Black', 'Gold'], price: [899, 5499],
      desc: (n) => `${n} with a soft padded footbed and a secure, adjustable fit.` }
  ],
  'Home & Kitchen': [
    { img: /\bpan\b|wok|silver pot/i, brands: ['Hearthline', 'Cuisora', 'Ironwell'], models: ['Non-Stick Frying Pan', 'Stainless Saucepan', 'Cast Iron Skillet', 'Deep Kadai'], variants: ['24cm', '28cm'], price: [799, 4999],
      desc: (n) => `${n} with even heat distribution, a stay-cool handle and induction-ready base.` },
    { img: /blender|microwave|stove/i, brands: ['Cuisora', 'Brewmate', 'Kitchora'], models: [['Mixer Grinder 750W', /boxed blender/i], ['Hand Blender', /hand blender/i], ['Microwave Oven 20L', /microwave/i], ['Induction Cooktop', /stove/i]], variants: ['Black', 'Steel'], price: [1499, 9999],
      desc: (n) => `${n} with multiple speed settings, safety lock and easy-clean detachable parts.` },
    { img: /spatula|whisk|tongs|peeler|grater|turner|knife|board|sieve|strainer|rolling/i, brands: ['Hearthline', 'Kitchora', 'Bamboo & Bloom'], models: [['Utensil Set', /spatula|turner|tongs|whisk/i], ["Chef's Knife", /knife/i], ['Chopping Board', /chopping board/i], ['Silicone Spatula Trio', /spatula/i]], variants: ['5-Piece', 'Classic', 'Large'], price: [299, 2999],
      desc: (n) => `${n} made from food-safe, dishwasher-friendly materials for everyday cooking.` },
    { img: /cup|^glass$|^plate$|^spoon$|^fork$|lunch box/i, brands: ['Claystone', 'Hearthline', 'Nordhaus'], models: [['Dinner Set', /^plate$/i], ['Ceramic Mug Set', /cup/i], ['Glass Tumblers', /^glass$/i], ['Steel Lunch Box', /lunch box/i]], variants: ['4-Piece', '6-Piece', 'Matte Grey'], price: [399, 3999],
      desc: (n) => `${n} with a durable finish that is microwave and dishwasher safe.` },
    { img: /lamp|frame|showpiece|swing|decoration|plant pot/i, brands: ['Nordhaus', 'Lumen & Oak', 'Claystone'], models: [['Table Lamp', /lamp/i], ['Photo Frame Set', /frame/i], ['Decor Showpiece', /showpiece/i], ['Indoor Plant Pot', /plant pot/i]], variants: ['Warm White', 'Walnut', 'Ivory'], price: [599, 5999],
      desc: (n) => `${n} that adds a calm, modern accent to living rooms, bedrooms and work desks.` },
    { img: /\bbed\b|sofa|bedside table|chair/i, brands: ['Nordhaus', 'Lumen & Oak', 'Timberlane'], models: [['Bedside Table', /bedside/i], ['Office Chair', /chair/i], ['Three-Seater Sofa', /sofa/i], ['Queen Bed Frame', /\bbed\b/i]], variants: ['Walnut', 'Oak', 'White'], price: [3999, 34999],
      desc: (n) => `${n} crafted from engineered wood with a scratch-resistant finish and simple home assembly.` }
  ],
  'Beauty & Skincare': [
    { img: /serum|vitamin c|niacinamide|hyaluronic|retinol|glycolic/i, brands: ['Dermique', 'Glowlab', 'Purelle'], models: ['Vitamin C Serum', 'Niacinamide Serum', 'Hyaluronic Serum', 'Retinol Night Serum'], variants: ['30ml', '50ml'], price: [499, 2499],
      desc: (n) => `${n} with clinically tested actives for brighter, smoother and more even-toned skin.` },
    { img: /moistur|lotion|cream|butter|barrier|wash/i, brands: ['Dermique', 'Purelle', 'Velvetine'], models: ['Daily Moisturiser', 'Ceramide Cream', 'Body Lotion', 'Gel Moisturiser'], variants: ['50g', '100ml', '200ml'], price: [349, 1999],
      desc: (n) => `${n} that locks in hydration without feeling greasy; suitable for all skin types.` },
    { img: /spf|sunscreen|matte/i, brands: ['Glowlab', 'Solace Skin'], models: ['SPF 50 Sunscreen', 'Tinted Sunscreen', 'Sun Gel SPF 40'], variants: ['50g', '80g'], price: [399, 1499],
      desc: (n) => `${n} with broad-spectrum PA++++ protection and a lightweight, no-white-cast finish.` },
    { img: /mascara|eyeshadow|powder|lip|palette/i, brands: ['Velvetine', 'Muse Cosmetics', 'Rosmarin Beauty'], models: [['Volume Mascara', /mascara/i], ['Eyeshadow Palette', /eyeshadow/i], ['Matte Lipstick', /lipstick/i], ['Setting Powder', /powder/i]], variants: ['Classic', 'Nude', 'Berry'], price: [299, 1999],
      desc: (n) => `${n} with rich, long-wear pigment that is cruelty-free and gentle on skin.` },
    { img: /ck one|chanel|dior|gucci|perfume|parfum/i, brands: ['Maison Liora', 'Ambrette', 'Noir Atelier'], models: ['Eau de Parfum', 'Eau de Toilette', 'Body Mist'], variants: ['Citrus', 'Oud', 'Floral', 'Vanilla'], price: [799, 6999],
      desc: (n) => `${n} with a long-lasting, layered fragrance for day and evening.` },
    { img: /cleans|foaming|scrub|mud|mist|soap|wash/i, brands: ['Purelle', 'Herbelle', 'Glowlab'], models: [['Foaming Face Wash', /foaming|cleansing/i], ['Mud Mask', /mud/i], ['Body Scrub', /scrub/i], ['Facial Mist', /mist/i]], variants: ['100ml', '150ml'], price: [299, 1499],
      desc: (n) => `${n} made with plant-based ingredients that cleanse gently without stripping skin.` }
  ],
  'Sports & Fitness': [
    { img: /dumbbell|kettlebell|barbell|bench/i, brands: ['IronPeak', 'Forgefit', 'Titanflex'], models: [['Hex Dumbbell Pair', /dumbbell/i], ['Kettlebell', /kettlebell/i], ['Adjustable Bench', /bench/i], ['Barbell Collar Set', /barbell/i]], variants: ['5kg', '10kg', '16kg'], price: [1499, 14999],
      desc: (n) => `${n} for home strength training, with a secure grip and rubber coating that protects floors.` },
    { img: /yoga|mat|roller|band|flooring/i, brands: ['Zenrise', 'Flowform', 'Forgefit'], models: [['Yoga Mat', /yoga/i], ['Foam Roller', /roller/i], ['Resistance Band Set', /band/i], ['Exercise Floor Tiles', /flooring/i]], variants: ['6mm', 'Purple', 'Teal'], price: [399, 3499],
      desc: (n) => `${n} with anti-slip texture and durable, sweat-resistant material for daily workouts.` },
    { img: /cricket/i, brands: ['Strikeline', 'Willowcraft', 'Boundary Pro'], models: [['English Willow Bat', /cricket bat/i], ['Kashmir Willow Bat', /cricket bat/i], ['Leather Cricket Ball', /cricket ball/i], ['Batting Helmet', /helmet/i]], variants: ['Size 5', 'Full Size', 'Junior'], price: [499, 12999],
      desc: (n) => `${n} built for match and net practice, with a balanced pick-up and reinforced edges.` },
    { img: /football|basketball|volleyball/i, brands: ['Kickzone', 'Courtside', 'Goalline'], models: [['Match Football', /^football$/i], ['Training Basketball', /^basketball$/i], ['Beach Volleyball', /volleyball/i]], variants: ['Size 5', 'Size 7', 'Size 4'], price: [499, 2999],
      desc: (n) => `${n} with a durable stitched cover and consistent bounce for indoor and outdoor play.` },
    { img: /tennis|shuttlecock|racket/i, brands: ['Smashpoint', 'Courtside', 'Netrix'], models: [['Tennis Racket', /racket/i], ['Shuttlecock Tube', /shuttlecock/i], ['Tennis Balls', /tennis ball/i]], variants: ['Pack of 3', 'Pro', 'Graphite'], price: [299, 7999],
      desc: (n) => `${n} offering control and power for club-level and recreational players.` },
    { img: /gloves|rope|shaker|grip|push-up|rings|straps/i, brands: ['Forgefit', 'Titanflex', 'IronPeak'], models: [['Boxing Gloves', /gloves/i], ['Speed Jump Rope', /rope/i], ['Protein Shaker', /shaker/i], ['Push-Up Bars', /push-up/i]], variants: ['Black', 'Red', 'Blue'], price: [299, 3499],
      desc: (n) => `${n} designed for HIIT, boxing and bodyweight training at home or the gym.` }
  ],
  // Stationery only: invented book titles would have no real cover images.
  'Books & Stationery': [
    { img: /notebook|leuchtturm|moleskine|rhodia|midori/i, brands: ['Inkwell', 'Paperloom', 'Folio & Fable'], models: ['A5 Dotted Notebook', 'Hardcover Journal', 'Spiral Planner', 'Pocket Notebook'], variants: ['Black', 'Sage', 'Navy', 'Mustard'], price: [299, 1999],
      desc: (n) => `${n} with thick acid-free paper, lay-flat binding and a ribbon bookmark.` },
    { img: /micron|pilot|tombow/i, brands: ['Inkwell', 'Scribe & Co', 'Nibworth'], models: [['Fineliner Set', /micron/i], ['Brush Pen Set', /tombow/i], ['Fountain Pen', /pilot/i]], variants: ['Pack of 6', 'Pack of 12', 'Fine Nib'], price: [199, 2999],
      desc: (n) => `${n} with smooth, quick-drying ink for notes, journaling and sketching.` },
    { img: /pencil|graphite|lumograph|rotring|faber/i, brands: ['Scribe & Co', 'Draftline', 'Paperloom'], models: [['Graphite Pencil Set', /faber|staedtler/i], ['Mechanical Pencil', /rotring/i], ['Sketching Kit', /faber|staedtler/i]], variants: ['12 Pieces', '24 Pieces', '0.5mm'], price: [149, 1999],
      desc: (n) => `${n} with break-resistant leads and consistent grading for drawing and drafting.` }
  ],
  'Plants & Garden': [
    { img: /monstera|philodendron|pothos|ivy|calathea|maranta|alocasia|anthurium/i, brands: ['Greenhaven', 'Leafline', 'Verdant Co'], models: [['Monstera', /monstera/i], ['Philodendron', /philodendron/i], ['Pothos', /pothos/i], ['Calathea', /calathea/i]], variants: ['Small', 'Medium', 'Large'], price: [349, 2999],
      desc: (n) => `${n} indoor plant in a nursery pot, shipped healthy with a simple light and watering care guide.` },
    { img: /succulent|aloe|jade|haworthia|cactus|pearls/i, brands: ['Desertbloom', 'Greenhaven'], models: [['Succulent Trio', /haworthia|pearls/i], ['Aloe Vera', /aloe/i], ['Jade Plant', /jade/i]], variants: ['Set of 3', 'Set of 6', 'Single'], price: [249, 1499],
      desc: (n) => `${n} that needs little water and thrives on sunny windowsills.` },
    { img: /palm|ficus|fig|strelitzia|dracaena|areca|rubber/i, brands: ['Leafline', 'Verdant Co'], models: [['Areca Palm', /areca/i], ['Rubber Plant', /elastica/i], ['Fiddle Leaf Fig', /fiddle/i], ['Dragon Tree', /dracaena/i]], variants: ['3ft', '4ft', 'Medium'], price: [599, 4999],
      desc: (n) => `${n} statement plant that brightens living rooms and offices.` },
    { img: /\bpots?\b|planter|terracotta|stand/i, brands: ['Claystone', 'Terra & Twig'], models: [['Ceramic Planter', /ceramic/i], ['Terracotta Pot Set', /terracotta/i], ['Plant Stand', /stand/i]], variants: ['6 inch', '8 inch', 'Set of 3'], price: [299, 2999],
      desc: (n) => `${n} with a drainage hole and a finish that suits any room.` },
    { img: /shears|soil|neem|mist|moss|watering|potting|hydroponic/i, brands: ['Terra & Twig', 'Greenhaven'], models: [['Pruning Shears', /shears/i], ['Potting Mix', /perlite/i], ['Neem Oil Spray', /neem/i], ['Watering Can', /long-spout/i]], variants: ['Standard', '2kg', '1L'], price: [199, 1499],
      desc: (n) => `${n} for healthy, pest-free plants and easy everyday plant care.` }
  ]
};

/**
 * @param {Array} baseProducts - products300.json rows (used for the image pool)
 * @param {{ perCategory?: number }} options
 * @returns {Array} generated product rows in the same shape as products300.json
 */
function buildExpansion(baseProducts, { perCategory = 60 } = {}) {
  const baseNames = new Set(baseProducts.map((p) => p.name.toLowerCase()));
  const out = [];
  let seed = 1;

  for (const [categoryName, types] of Object.entries(TYPES)) {
    const inCategory = baseProducts.filter((p) => p.categoryName === categoryName);
    // Image pool per type; a type with no matching base photos is skipped.
    const usable = types
      .map((t) => ({ ...t, photos: inCategory.filter((p) => t.img.test(p.name)).map((p) => p.images) }))
      .filter((t) => t.photos.length > 0);
    if (usable.length === 0) continue;

    // Enumerate every brand × model × variant name per type, MODEL varying
    // fastest so even a short run covers every model (knives AND mugs, not ten
    // frying pans). Types are then taken round-robin for an even category mix.
    const queues = usable.map((t) => {
      const models = t.models.map((m) => {
        // A model is a label, or [label, regex] that picks its own matching photos.
        const [label, modelImg] = Array.isArray(m) ? m : [m, null];
        const own = modelImg ? inCategory.filter((p) => modelImg.test(p.name)).map((p) => p.images) : [];
        return { label, photos: own.length ? own : t.photos };
      });
      const names = [];
      for (const variant of t.variants) for (const brand of t.brands) for (const model of models) {
        names.push({ name: `${brand} ${model.label} ${variant}`, photos: model.photos });
      }
      return { type: t, names, i: 0 };
    });

    let made = 0;
    let exhausted = 0;
    while (made < perCategory && exhausted < queues.length) {
      exhausted = 0;
      for (const q of queues) {
        if (made >= perCategory) break;
        if (q.i >= q.names.length) { exhausted++; continue; }
        const { name, photos } = q.names[q.i];
        const idx = q.i++;
        if (baseNames.has(name.toLowerCase())) continue;

        const rand = prng(seed++);
        const [lo, hi] = q.type.price;
        const price = retailPrice(lo + rand() * (hi - lo));
        const discountPct = [0, 0.05, 0.1, 0.15, 0.2, 0.25][Math.floor(rand() * 6)];
        const discountPrice = discountPct ? retailPrice(price * (1 - discountPct)) : 0;
        out.push({
          name,
          categoryName,
          description: q.type.desc(name),
          price,
          discountPrice: discountPrice && discountPrice < price ? discountPrice : 0,
          stock: rand() < 0.06 ? 0 : 5 + Math.floor(rand() * 120),
          rating: 0,
          numReviews: 0,
          soldCount: Math.floor(rand() * 400),
          images: photos[idx % photos.length],
          isFeatured: rand() < 0.05,
          isActive: true
        });
        made++;
      }
    }
  }
  return out;
}

module.exports = { buildExpansion, TYPES };
