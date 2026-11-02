'use strict';
/**
 * Benchmark query specs (Step 5). Plain JSON-like data; "@now-Nd" tokens are
 * resolved at run time. Mix of selective / unselective / vendor-scoped /
 * user-scoped / reviews queries, plus a deliberately non-helping case.
 *
 * All specs are acyclic (join trees) and gamma-acyclic (every joined pair
 * shares exactly one attribute), so every connected join order is safe — which
 * is why SafeSubjoin is not needed here.
 */

const specs = [
  {
    name: 'rare_category_revenue_7d',
    description: 'Revenue per vendor for the rare category over the last 7 days (selective).',
    relations: [
      { alias: 'cat', collection: 'categories', localFilter: { is_rare: true } },
      { alias: 'p', collection: 'products', localFilter: {} },
      { alias: 'oi', collection: 'order_items', localFilter: {} },
      { alias: 'o', collection: 'orders', localFilter: { created_at: { $gte: '@now-7d' } } },
      { alias: 'v', collection: 'vendors', localFilter: {} }
    ],
    edges: [
      { left: 'p.category_id', right: 'cat._id' },
      { left: 'oi.product_id', right: 'p._id' },
      { left: 'oi.order_id', right: 'o._id' },
      { left: 'oi.vendor_id', right: 'v._id' }
    ],
    group: {
      keys: [{ expr: 'v._id', as: 'vendor_id' }, { expr: 'v.name', as: 'vendor_name' }],
      aggregates: [{ op: 'sum', expr: 'oi.line_total', as: 'revenue' }]
    },
    orderBy: [{ field: 'revenue', dir: -1 }],
    limit: 50
  },
  {
    name: 'common_category_revenue_365d',
    description: 'Revenue per vendor for the common category over 365 days (unselective — expected NOT to help).',
    relations: [
      { alias: 'cat', collection: 'categories', localFilter: { name: 'Category 1' } },
      { alias: 'p', collection: 'products', localFilter: {} },
      { alias: 'oi', collection: 'order_items', localFilter: {} },
      { alias: 'o', collection: 'orders', localFilter: { created_at: { $gte: '@now-365d' } } },
      { alias: 'v', collection: 'vendors', localFilter: {} }
    ],
    edges: [
      { left: 'p.category_id', right: 'cat._id' },
      { left: 'oi.product_id', right: 'p._id' },
      { left: 'oi.order_id', right: 'o._id' },
      { left: 'oi.vendor_id', right: 'v._id' }
    ],
    group: {
      keys: [{ expr: 'v._id', as: 'vendor_id' }, { expr: 'v.name', as: 'vendor_name' }],
      aggregates: [{ op: 'sum', expr: 'oi.line_total', as: 'revenue' }]
    },
    orderBy: [{ field: 'revenue', dir: -1 }],
    limit: 50
  },
  {
    name: 'vendor_scoped_revenue_90d',
    description: 'Revenue per product for one large vendor over 90 days (vendor-scoped).',
    relations: [
      { alias: 'v', collection: 'vendors', localFilter: { name: 'Vendor 0' } },
      { alias: 'oi', collection: 'order_items', localFilter: {} },
      { alias: 'o', collection: 'orders', localFilter: { created_at: { $gte: '@now-90d' } } },
      { alias: 'p', collection: 'products', localFilter: {} }
    ],
    edges: [
      { left: 'oi.vendor_id', right: 'v._id' },
      { left: 'oi.order_id', right: 'o._id' },
      { left: 'oi.product_id', right: 'p._id' }
    ],
    group: {
      keys: [{ expr: 'p._id', as: 'product_id' }, { expr: 'p.name', as: 'product_name' }],
      aggregates: [{ op: 'sum', expr: 'oi.line_total', as: 'revenue' }]
    },
    orderBy: [{ field: 'revenue', dir: -1 }],
    limit: 50
  },
  {
    name: 'user_scoped_spend_30d',
    description: 'Spend per product for one user over 30 days (user-scoped).',
    relations: [
      { alias: 'u', collection: 'users', localFilter: { email: 'user7@bench.local' } },
      { alias: 'o', collection: 'orders', localFilter: { created_at: { $gte: '@now-30d' } } },
      { alias: 'oi', collection: 'order_items', localFilter: {} },
      { alias: 'p', collection: 'products', localFilter: {} }
    ],
    edges: [
      { left: 'o.user_id', right: 'u._id' },
      { left: 'oi.order_id', right: 'o._id' },
      { left: 'oi.product_id', right: 'p._id' }
    ],
    group: {
      keys: [{ expr: 'p._id', as: 'product_id' }, { expr: 'p.name', as: 'product_name' }],
      aggregates: [{ op: 'sum', expr: 'oi.line_total', as: 'spend' }]
    },
    orderBy: [{ field: 'spend', dir: -1 }],
    limit: 50
  },
  {
    name: 'low_rating_reviews_by_category',
    description: 'Low-rating review counts per category (reviews).',
    relations: [
      { alias: 'r', collection: 'reviews', localFilter: { rating: { $lte: 2 } } },
      { alias: 'p', collection: 'products', localFilter: {} },
      { alias: 'c', collection: 'categories', localFilter: {} },
      { alias: 'v', collection: 'vendors', localFilter: {} }
    ],
    edges: [
      { left: 'r.product_id', right: 'p._id' },
      { left: 'p.category_id', right: 'c._id' },
      { left: 'p.vendor_id', right: 'v._id' }
    ],
    group: {
      keys: [{ expr: 'c._id', as: 'category_id' }, { expr: 'c.name', as: 'category_name' }],
      aggregates: [
        { op: 'count', as: 'n_reviews' },
        { op: 'avg', expr: 'r.rating', as: 'avg_rating' }
      ]
    },
    orderBy: [{ field: 'n_reviews', dir: -1 }],
    limit: 50
  },
  {
    name: 'vendor_category_revenue_365d',
    description: 'Revenue per category for one vendor over 365 days (mixed, 5 relations).',
    relations: [
      { alias: 'v', collection: 'vendors', localFilter: { name: 'Vendor 0' } },
      { alias: 'p', collection: 'products', localFilter: {} },
      { alias: 'oi', collection: 'order_items', localFilter: {} },
      { alias: 'o', collection: 'orders', localFilter: { created_at: { $gte: '@now-365d' } } },
      { alias: 'c', collection: 'categories', localFilter: {} }
    ],
    edges: [
      { left: 'p.vendor_id', right: 'v._id' },
      { left: 'oi.product_id', right: 'p._id' },
      { left: 'oi.order_id', right: 'o._id' },
      { left: 'p.category_id', right: 'c._id' }
    ],
    group: {
      keys: [{ expr: 'c._id', as: 'category_id' }, { expr: 'c.name', as: 'category_name' }],
      aggregates: [{ op: 'sum', expr: 'oi.line_total', as: 'revenue' }]
    },
    orderBy: [{ field: 'revenue', dir: -1 }],
    limit: 50
  },
  {
    name: 'user_vendor_category_spend_30d',
    description: 'Spend per (vendor × category) for one user over the last 30 days — the heaviest spec (6 relations); transfer + materialization often dominate here.',
    relations: [
      { alias: 'u', collection: 'users', localFilter: { email: 'user7@bench.local' } },
      { alias: 'o', collection: 'orders', localFilter: { created_at: { $gte: '@now-30d' } } },
      { alias: 'oi', collection: 'order_items', localFilter: {} },
      { alias: 'p', collection: 'products', localFilter: {} },
      { alias: 'v', collection: 'vendors', localFilter: {} },
      { alias: 'c', collection: 'categories', localFilter: {} }
    ],
    edges: [
      { left: 'o.user_id', right: 'u._id' },
      { left: 'oi.order_id', right: 'o._id' },
      { left: 'oi.product_id', right: 'p._id' },
      { left: 'oi.vendor_id', right: 'v._id' },
      { left: 'p.category_id', right: 'c._id' }
    ],
    group: {
      keys: [
        { expr: 'v._id', as: 'vendor_id' }, { expr: 'v.name', as: 'vendor_name' },
        { expr: 'c._id', as: 'category_id' }, { expr: 'c.name', as: 'category_name' }
      ],
      aggregates: [{ op: 'sum', expr: 'oi.line_total', as: 'spend' }]
    },
    orderBy: [{ field: 'spend', dir: -1 }],
    limit: 50
  }
];

const byName = {};
for (const s of specs) byName[s.name] = s;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Live-search variant (Step 7b): the same join shape as
 * rare_category_revenue_7d, but the products relation carries the user's
 * ACTUAL search term and the filters the user applied (minRating / price
 * range / in-stock / featured), so both naive and reduced sides measure the
 * query the user really asked for. The demo vendor filter is emulated by the
 * shadow script AFTER connecting (maps a demo store name deterministically to
 * a bench `Vendor N`), because the two databases share no supplier ids.
 *
 * Trade-off (accepted): per-run numbers are no longer comparable row-to-row
 * — selectivity changes with the term/filters, and a loose combo can overflow
 * the $in cap and skip transfer steps.
 */
function makeLiveSearchSpec({ search, filters = {} } = {}) {
  const term = String(search || '').trim().slice(0, 120);
  if (!term) throw new Error('makeLiveSearchSpec requires a non-empty search term');
  const spec = JSON.parse(JSON.stringify(byName['rare_category_revenue_7d']));
  const p = spec.relations.find((r) => r.alias === 'p');
  p.localFilter = { name: { $regex: escapeRegExp(term), $options: 'i' } };
  if (filters.minRating != null && !Number.isNaN(Number(filters.minRating))) p.localFilter.rating = { $gte: Number(filters.minRating) };
  if (filters.minPrice != null || filters.maxPrice != null) {
    p.localFilter.price = {};
    if (filters.minPrice != null && !Number.isNaN(Number(filters.minPrice))) p.localFilter.price.$gte = Number(filters.minPrice);
    if (filters.maxPrice != null && !Number.isNaN(Number(filters.maxPrice))) p.localFilter.price.$lte = Number(filters.maxPrice);
  }
  if (filters.inStock) p.localFilter.stock = { $gt: 0 };
  if (filters.featured) p.localFilter.isFeatured = true;
  const parts = [];
  if (filters.minRating != null) parts.push(`minRating ≥ ${filters.minRating}`);
  if (filters.minPrice != null || filters.maxPrice != null) parts.push(`price ${filters.minPrice != null ? `≥ ${filters.minPrice}` : ''}${filters.minPrice != null && filters.maxPrice != null ? ' and ' : ''}${filters.maxPrice != null ? `≤ ${filters.maxPrice}` : ''}`);
  if (filters.inStock) parts.push('in stock');
  if (filters.featured) parts.push('featured');
  if (filters.vendorName) parts.push(`vendor "${filters.vendorName}" (bench-emulated)`);
  const safeSlug = (term.toLowerCase().replace(/[^a-z0-9]+/g, '-') + (parts.length ? '-and-filters' : '')).replace(/^-|-$/g, '').slice(0, 40);
  spec.name = `live_search_${safeSlug || 'term'}`;
  spec.description = `Live search "${term}"${parts.length ? ` with filters (${parts.join(', ')})` : ''} — revenue per vendor for the rare category over the last 7 days, restricted to matching products (live-search variant of rare_category_revenue_7d).`;
  return spec;
}

module.exports = { specs, byName, makeLiveSearchSpec };
