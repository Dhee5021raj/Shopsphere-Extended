'use strict';
/**
 * Verified Supplemental Data for Books, Stationery, and Plants
 */

const BOOK_ISBNS = [
  { name: 'Clean Code: A Handbook of Agile Software Craftsmanship', isbn: '9780132350884', author: 'Robert C. Martin', price: 1499, disc: 1199 },
  { name: 'The Pragmatic Programmer: Your Journey to Mastery', isbn: '9780201616224', author: 'David Thomas, Andrew Hunt', price: 1699, disc: 1399 },
  { name: 'Designing Data-Intensive Applications', isbn: '9781491903063', author: 'Martin Kleppmann', price: 1899, disc: 1549 },
  { name: 'Effective Java: Best Practices for Java Platform', isbn: '9780134685991', author: 'Joshua Bloch', price: 1799, disc: 1449 },
  { name: 'Code Complete: Practical Handbook of Software Construction', isbn: '9780735619678', author: 'Steve McConnell', price: 1999, disc: 1599 },
  { name: 'Domain-Driven Design: Tackling Complexity in Software', isbn: '9780321125217', author: 'Eric Evans', price: 2199, disc: 1799 },
  { name: 'Designing Web APIs: Principles and Best Practices', isbn: '9781449373320', author: 'Brenda Jin', price: 1399, disc: 1099 },
  { name: 'Building Microservices: Designing Fine-Grained Systems', isbn: '9781491950357', author: 'Sam Newman', price: 1699, disc: 1349 },
  { name: 'Learning JavaScript Design Patterns', isbn: '9781449331819', author: 'Addy Osmani', price: 1299, disc: 999 },
  { name: 'Clean Architecture: A Craftsman\'s Guide to Software', isbn: '9780134494166', author: 'Robert C. Martin', price: 1599, disc: 1299 },
  { name: 'JavaScript: The Good Parts', isbn: '9780596517748', author: 'Douglas Crockford', price: 999, disc: 799 },
  { name: 'Fluent Python: Clear, Concise, and Effective Programming', isbn: '9781491954249', author: 'Luciano Ramalho', price: 1999, disc: 1649 },
  { name: 'Atomic Habits: An Easy & Proven Way to Build Good Habits', isbn: '9780735211292', author: 'James Clear', price: 799, disc: 599 },
  { name: 'Deep Work: Rules for Focused Success in a Distracted World', isbn: '9781455586691', author: 'Cal Newport', price: 899, disc: 699 },
  { name: 'The Subtle Art of Not Giving a F*ck', isbn: '9780062457714', author: 'Mark Manson', price: 699, disc: 549 },
  { name: 'The Power of Habit: Why We Do What We Do', isbn: '9780812981605', author: 'Charles Duhigg', price: 799, disc: 629 },
  { name: 'Sapiens: A Brief History of Humankind', isbn: '9780062316097', author: 'Yuval Noah Harari', price: 999, disc: 799 },
  { name: 'Thinking, Fast and Slow', isbn: '9780374533557', author: 'Daniel Kahneman', price: 899, disc: 699 },
  { name: 'The Lean Startup: How Constant Innovation Drives Growth', isbn: '9780307887894', author: 'Eric Ries', price: 899, disc: 719 },
  { name: 'Essentialism: The Disciplined Pursuit of Less', isbn: '9781591846444', author: 'Greg McKeown', price: 799, disc: 619 },
  { name: 'Grit: The Power of Passion and Perseverance', isbn: '9780525536512', author: 'Angela Duckworth', price: 799, disc: 639 },
  { name: 'Show Your Work!: 10 Ways to Share Your Creativity', isbn: '9780761178972', author: 'Austin Kleon', price: 599, disc: 479 },
  { name: 'Zero to One: Notes on Startups, or How to Build the Future', isbn: '9780804139298', author: 'Peter Thiel', price: 899, disc: 699 },
  { name: 'Range: Why Generalists Triumph in a Specialized World', isbn: '9780735214484', author: 'David Epstein', price: 899, disc: 719 },
  { name: 'Refactoring: Improving the Design of Existing Code', isbn: '9780201485677', author: 'Martin Fowler', price: 1899, disc: 1499 }
];

const STATIONERY_ITEMS = [
  {
    name: 'Leuchtturm1917 Medium A5 Dotted Hardcover Notebook',
    description: '249 numbered pages, 80 gsm ink-proof acid-free paper, 2 ribbon page markers, expandable inner pocket, elastic enclosure band, sticker for labelling and archiving.',
    price: 1899, discountPrice: 1499,
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600'
  },
  {
    name: 'Moleskine Classic Expanded Hard Cover Ruled Notebook',
    description: '400 lined ivory-colored acid-free pages, rounded corners, ribbon bookmark, expandable inner back pocket, iconic Italian notebook for writers and creatives.',
    price: 2199, discountPrice: 1749,
    image: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=600'
  },
  {
    name: 'Faber-Castell 9000 Graphite Artist Pencil Set of 12',
    description: '12 degrees of hardness (8B to 2H), SV-bonded lead to resist breakage, superior artist quality for technical drawing and shading in a vintage metal tin.',
    price: 1199, discountPrice: 899,
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600'
  },
  {
    name: 'Sakura Pigma Micron Archival Fineliner Pens 6-Pack',
    description: 'Waterproof, chemically stable, fade-resistant archival Pigma pigment ink. Tip sizes 0.20mm to 0.50mm plus 1 brush pen for drafting, manga, and journaling.',
    price: 999, discountPrice: 799,
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600'
  },
  {
    name: 'Tombow Dual Brush Marker Pens Pastel 10-Pack',
    description: 'Flexible brush tip and fine bullet tip in one pen. Water-based blendable ink, odorless, acid-free, 9 pastel hues plus 1 colorless blender pen.',
    price: 2499, discountPrice: 1999,
    image: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=600'
  },
  {
    name: 'Midori MD Notebook A5 Minimalist Grid Paper',
    description: 'Made in Japan with bleed-resistant MD Paper that prevents feathering even with fountain pens. Lies flat 180 degrees with subtle paraffin paper dust jacket.',
    price: 1499, discountPrice: 1199,
    image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600'
  },
  {
    name: 'Rotring 600 Drafting Mechanical Pencil 0.5mm Matte Black',
    description: 'Full metal hexagonal brass barrel, non-slip knurled grip, fixed lead guidance sleeve preventing breakage, lead hardness grade indicator dial.',
    price: 2999, discountPrice: 2399,
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600'
  },
  {
    name: 'Rhodia DotPad No. 16 Wirebound Notepad Black A5',
    description: '80 micro-perforated detachable sheets of superfine 80gsm Clairefontaine vellum paper. Pale violet geometric 5mm dot grid, water-resistant coated cover.',
    price: 799, discountPrice: 599,
    image: 'https://images.unsplash.com/photo-1506784926709-22f1ec395907?w=600'
  },
  {
    name: 'Staedtler Mars Lumograph Premium Drawing Pencils Set of 12',
    description: 'Break-resistant super-bonded special lead formulation, metallic blue barrel, PEFC-certified cedar wood, perfect for sketching and expressive portraits.',
    price: 1399, discountPrice: 1049,
    image: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=600'
  },
  {
    name: 'Pilot Custom 74 Clear Demonstrator Fountain Pen',
    description: 'Japanese transparent resin barrel, 14K gold rhodium-plated nib (Fine), Con-70 high-capacity push-button converter included, smooth wet ink flow.',
    price: 14999, discountPrice: 11999,
    image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600'
  }
];

const PLANT_ITEMS = [
  { name: 'Monstera Deliciosa Swiss Cheese Plant in Terracotta', desc: 'Lush tropical houseplant with iconic natural leaf fenestrations, potted in a porous 10-inch Italian terracotta pot. Air-purifying and adaptable to moderate indirect light.', price: 2499, disc: 1899, img: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=600' },
  { name: 'Sansevieria Trifasciata Laurentii Snake Plant', desc: 'Architectural sword-like leaves with vivid yellow borders. NASA-certified top air purifier, thriving on minimal watering and low to bright light.', price: 1499, disc: 1199, img: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600' },
  { name: 'Fiddle Leaf Fig Architectural Indoor Tree (4 Feet)', desc: 'Dramatic violin-shaped leathery leaves standing 4 feet tall in a designer matte white ceramic pot. The quintessential focal piece for bright living rooms.', price: 4499, disc: 3499, img: 'https://images.unsplash.com/photo-1463320898484-cdee8141c787?w=600' },
  { name: 'Peace Lily Spathiphyllum Air-Purifying Plant', desc: 'Glossy dark green foliage producing elegant snow-white spathes. Effective at removing airborne VOCs; signals clearly when thirsty by gently drooping.', price: 1299, disc: 999, img: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600' },
  { name: 'ZZ Plant Zamioculcas Zamiifolia Low-Light Foliage', desc: 'Glossy waxy leaflets along thick upright stems that store moisture in subterranean rhizomes. Virtually indestructible even in shaded interior office spaces.', price: 1699, disc: 1299, img: 'https://images.unsplash.com/photo-1632207691143-643e2a9a9361?w=600' },
  { name: 'Golden Pothos Trailing Vine in Hanging Ceramic', desc: 'Heart-shaped variegated green and gold leaves cascading up to 4 feet. Potted in a handcrafted speckled stoneware hanging planter with jute macrame.', price: 999, disc: 749, img: 'https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?w=600' },
  { name: 'Aloe Barbadensis Miller Medicinal Succulent', desc: 'Thick fleshy leaves packed with nutrient-dense soothing gel. Thrives in sun-drenched windowsills with sparing bi-weekly watering in gritty cactus mix.', price: 799, disc: 599, img: 'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?w=600' },
  { name: 'Areca Palm Dypsis Lutescens Tropical Indoor Palm', desc: 'Feathery arching fronds in a 12-inch woven seagrass basket. Natural humidifier capable of transpiring up to 1 liter of moisture daily in dry air.', price: 2999, disc: 2299, img: 'https://images.unsplash.com/photo-1545241047-6083a3684587?w=600' },
  { name: 'Chlorophytum Comosum Variegated Spider Plant', desc: 'Arching ribbons with creamy ivory centers producing abundant miniature spiderettes on runner stems. Safe for households with dogs and cats.', price: 699, disc: 499, img: 'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?w=600' },
  { name: 'Ficus Elastica Burgundy Rubber Tree', desc: 'Broad leathery foliage with deep burgundy and espresso sheen. Grows vigorously with weekly watering and bright indirect ambient sunlight.', price: 1999, disc: 1499, img: 'https://images.unsplash.com/photo-1463320898484-cdee8141c787?w=600' },
  { name: 'Nephrolepis Exaltata Boston Sword Fern', desc: 'Voluminous cascading arching fronds in a moisture-retentive hanging planter. Thrives in bathroom humidity and filtered diffused window light.', price: 1199, disc: 899, img: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=600' },
  { name: 'Calathea Ornata Pinstripe Peacock Plant', desc: 'Dark purple-backed leaves etched with delicate salmon-pink pinstripes. Folds its leaves gracefully upward each evening in prayer-like motion.', price: 1599, disc: 1199, img: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600' },
  { name: 'Crassula Ovata Lucky Jade Plant Bonsai', desc: 'Woody branching succulent stems crowned with plump emerald jade leaves. Regarded as a symbol of prosperity; requires minimal irrigation and direct light.', price: 1399, disc: 1049, img: 'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?w=600' },
  { name: 'Senecio Rowleyanus String of Pearls Trailing Succulent', desc: 'Spherical bead-like foliage cascading dramatically over the edges of a concrete bowl. Striking architectural piece for sunny floating shelves.', price: 1299, disc: 949, img: 'https://images.unsplash.com/photo-1520302630591-fd1c66edc19d?w=600' },
  { name: 'Strelitzia Nicolai Giant White Bird of Paradise', desc: 'Massive banana-like paddle leaves bringing dramatic conservatory atmosphere into large open living rooms. Thrives in high-light locations.', price: 4999, disc: 3899, img: 'https://images.unsplash.com/photo-1512428813834-c702c7702b78?w=600' },
  { name: 'Philodendron Birkin Variegated White Pinstripe', desc: 'Compact glossy leaves featuring distinctive high-contrast white variegation lines that intensify as new leaves emerge under bright light.', price: 1799, disc: 1349, img: 'https://images.unsplash.com/photo-1600411833196-7c1f6b1a8b90?w=600' },
  { name: 'Anthurium Andraeanum Red Flamingo Flower', desc: 'Glossy heart-shaped spathes in brilliant scarlet red with golden central spadix. Blooms continuously for up to 8 weeks in warm ambient temperatures.', price: 1899, disc: 1449, img: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600' },
  { name: 'Aspidistra Elatior Cast Iron Indestructible Plant', desc: 'Deep forest-green ribbed foliage named for its legendary resilience against neglect, dust, dry heating air, and low-light corner placements.', price: 2199, disc: 1699, img: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600' },
  { name: 'Hedera Helix Glacier English Ivy Hanging Basket', desc: 'Classic variegated ivy with creamy margins on three-lobed leaves. Vigorous grower that climbs trellises or cascades gracefully from wall planters.', price: 899, disc: 649, img: 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=600' },
  { name: 'Ficus Ginseng Microcarpa Root-Over-Rock Bonsai', desc: 'Exposed sculptural aerial root trunk trained over natural lava rock, topped with a dense canopy of miniature glossy ficus leaves. Ceramic tray included.', price: 3499, disc: 2699, img: 'https://images.unsplash.com/photo-1599598425947-5202edd56bdb?w=600' },
  { name: 'Haworthia Fasciata Zebra Succulent in Concrete Pot', desc: 'Stiff triangular rosettes ringed with raised white pearly horizontal ridges. Extremely drought-tolerant and compact for minimalist modern desks.', price: 699, disc: 519, img: 'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?w=600' },
  { name: 'Maranta Leuconeura Red Prayer Plant', desc: 'Tricolor velvet foliage with lime green centers and vivid red herringbone veins that fold vertically in prayer at nightfall.', price: 1399, disc: 1049, img: 'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=600' },
  { name: 'Alocasia Polly African Mask Compact Elephant Ear', desc: 'Metallic arrow-shaped leaves with scalloped edges and prominent silvery veins. Compact hybrid bred for indoor tabletops.', price: 1699, disc: 1299, img: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=600' },
  { name: 'Pilea Peperomioides Chinese Money Plant', desc: 'Coin-shaped circular leaves on delicate stems radiating outward from a central stalk. Easily sprouts miniature baby pups to share with friends.', price: 999, disc: 749, img: 'https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?w=600' },
  { name: 'Aglaonema Silver Bay Chinese Evergreen', desc: 'Wide silvery-gray leaves bordered with emerald green markings. Renowned as one of the most durable and air-purifying indoor species.', price: 1899, disc: 1399, img: 'https://images.unsplash.com/photo-1632207691143-643e2a9a9361?w=600' },
  { name: 'Dracaena Marginata Red-Edged Dragon Tree', desc: 'Slender architectural trunk crowned with a tuft of narrow ribbon-like leaves edged in thin crimson borders. 3 feet height in ribbed ceramic pot.', price: 2299, disc: 1799, img: 'https://images.unsplash.com/photo-1545241047-6083a3684587?w=600' },
  { name: 'Peperomia Watermelon Striped Compact Houseplant', desc: 'Fleshy peltate leaves adorned with alternating dark green and shimmering silver stripes mirroring the rind of miniature watermelons.', price: 1099, disc: 849, img: 'https://images.unsplash.com/photo-1596547609652-9cf5d8d76921?w=600' },
  { name: 'Tradescantia Zebrina Silver Wandering Dude', desc: 'Vibrant purple undersides with metallic silver parallel stripes on the upper leaf surface. Fast-rooting trailing vine for high shelves.', price: 799, disc: 599, img: 'https://images.unsplash.com/photo-1545241047-6083a3684587?w=600' },
  { name: 'Begonia Maculata Polka Dot Spotted Houseplant', desc: 'Dramatic olive-green angel wing foliage speckled with silver polka dots and deep crimson undersides. Produces clusters of delicate white blossoms.', price: 1799, disc: 1399, img: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=600' },
  { name: 'Ceropegia Woodii String of Hearts Hanging Vine', desc: 'Delicate purple wiry vines adorned with pairs of tiny marbled heart-shaped succulent leaves. Grows up to 6 feet long in sunny window spots.', price: 1299, disc: 999, img: 'https://images.unsplash.com/photo-1520302630591-fd1c66edc19d?w=600' },
  { name: 'Handcrafted Terracotta Pots with Saucers 5-Pack', desc: 'Set of 5 graduated breathable natural clay planters (4" to 8") with drainage holes and matching drip saucers. Ideal for succulents, herbs, and aroids.', price: 1499, disc: 1149, img: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600' },
  { name: 'Self-Watering Hydroponic Windowsill Planters Trio', desc: 'Sub-irrigation reservoir pots with cotton wicking cords and water level indicators. Keeps indoor herbs and foliage hydrated for up to 14 days unattended.', price: 1799, disc: 1399, img: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600' },
  { name: 'Heavy-Duty Bypass Pruning Shears Japanese Steel', desc: 'SK5 high-carbon Japanese steel blades, ergonomic shock-absorbing forged aluminum handles, precision sap groove, and brass safety thumb lock.', price: 1299, disc: 949, img: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600' },
  { name: 'Stainless Steel Long-Spout Indoor Watering Can 1.5L', desc: 'Precision curved swan-neck spout allows targeted irrigation directly at soil level without splashing delicate foliage. Rust-proof brushed brass finish.', price: 1699, disc: 1299, img: 'https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=600' },
  { name: 'Organic Perlite & Coco-Peat Potting Soil Mix 10kg', desc: 'Aerated, pH-buffered growing medium blended with washed coco-coir, horticultural perlite, vermiculite, and organic worm castings for optimal root health.', price: 899, disc: 699, img: 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=600' },
  { name: 'Pure Cold-Pressed Organic Neem Oil Plant Foliage Spray', desc: 'Ready-to-use botanical leaf wash and shine spray derived from organic cold-pressed neem seed oil. Naturally cleans foliage and discourages pests.', price: 699, disc: 499, img: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600' },
  { name: 'Brass Fine-Mist Botanical Plant Mister 300ml', desc: 'Vintage pump-action mister generating ultra-fine diffused vapor for tropical humidity-loving orchids, calatheas, ferns, and terrariums.', price: 999, disc: 749, img: 'https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=600' },
  { name: 'Premium Coco-Coir Climbing Moss Poles 4-Pack', desc: 'Extendable stackable coir totem poles providing sturdy aerial root anchorage and natural moisture retention for climbing monsteras and philodendrons.', price: 1199, disc: 899, img: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600' },
  { name: 'Solid Bamboo Multi-Tier Indoor Plant Display Stand', desc: '6-tier natural lacquered bamboo shelving rack holding up to 10 potted plants. Space-saving corner ladder design with 40kg total weight capacity.', price: 2999, disc: 2299, img: 'https://images.unsplash.com/photo-1545241047-6083a3684587?w=600' },
  { name: 'Ceramic Glazed Minimalist Cylinder Planters Set of 3', desc: 'Three nested ceramic planters (5", 6.5", 8") in matte sage green glaze, complete with drainage mesh nets and protective silicone base plugs.', price: 2199, disc: 1699, img: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600' }
];

module.exports = { BOOK_ISBNS, STATIONERY_ITEMS, PLANT_ITEMS };
