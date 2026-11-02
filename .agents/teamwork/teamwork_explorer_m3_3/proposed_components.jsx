import React from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Zap,
  TrendingUp,
  Activity,
  Layers,
  Search,
  Database,
  ExternalLink,
  ShieldCheck,
  Compass
} from 'lucide-react';

/**
 * Canonical Metadata Registry for Benchmark & Relational Queries.
 * Provides scholarly, relational-calculus level descriptions decoupled from UI search events.
 */
export const SPEC_METADATA = {
  rare_category_revenue_7d: {
    title: 'Rare Category Revenue (7-Day)',
    shortDesc: 'Sum of order-item line totals grouped by vendor for products in a rare category over the last 7 days.',
    computation: '5-relation join (cat ⋈ p ⋈ oi ⋈ o ⋈ v) summing order item line totals grouped by vendor for orders placed in the last 7 days — top 50 vendors by revenue.',
    joinOrder: 'categories ▸ products ▸ order items ▸ orders ▸ vendors',
    selectivity: 'High (~1 rare category row out of 100). Semi-join reduction prunes >99% of intermediate product and order tuples.',
    relations: ['categories', 'products', 'order_items', 'orders', 'vendors'],
  },
  common_category_revenue_365d: {
    title: 'Common Category Revenue (365-Day)',
    shortDesc: 'Sum of order-item line totals grouped by vendor for products in a common category over 365 days.',
    computation: '5-relation join (cat ⋈ p ⋈ oi ⋈ o ⋈ v) summing order item line totals grouped by vendor for Category 1 over 365 days — top 50 vendors by revenue.',
    joinOrder: 'categories ▸ products ▸ order items ▸ orders ▸ vendors',
    selectivity: 'Low (unselective). High cardinality survives reducer pass; transfer overhead outweighs reduction (honest negative control).',
    relations: ['categories', 'products', 'order_items', 'orders', 'vendors'],
  },
  vendor_scoped_revenue_90d: {
    title: 'Vendor-Scoped Revenue (90-Day)',
    shortDesc: 'Sum of order-item line totals grouped by product for one large vendor over 90 days.',
    computation: '4-relation join (v ⋈ oi ⋈ o ⋈ p) summing line totals grouped by product, restricted to Vendor 0 over 90 days — top 50 products by revenue.',
    joinOrder: 'vendors ▸ order items ▸ orders ▸ products',
    selectivity: 'Medium-High (1 vendor scoped). Demonstrates vendor-partition pruning via semi-join reducer.',
    relations: ['vendors', 'order_items', 'orders', 'products'],
  },
  user_scoped_spend_30d: {
    title: 'User-Scoped Spend (30-Day)',
    shortDesc: 'Sum of order-item line totals grouped by product for orders placed by a single user in 30 days.',
    computation: '4-relation join (u ⋈ o ⋈ oi ⋈ p) summing order item line totals grouped by product for orders placed by one user in the last 30 days — top 50 products by spend.',
    joinOrder: 'users ▸ orders ▸ order items ▸ products',
    selectivity: 'Extremely high (single user needle in 100k orders). Near-instant semi-join pruning across orders and items.',
    relations: ['users', 'orders', 'order_items', 'products'],
  },
  low_rating_reviews_by_category: {
    title: 'Low Rating Reviews by Category',
    shortDesc: 'Count of 1–2★ reviews with average rating, grouped by category via review → product → category + vendor.',
    computation: '4-relation join (r ⋈ p ⋈ c ⋈ v) counting reviews with rating ≤ 2 and calculating average rating per category — top 50 categories by review count.',
    joinOrder: 'reviews ▸ products ▸ categories ▸ vendors',
    selectivity: 'Medium. Branching join tree where reviews filter does not strongly constrain the products relation.',
    relations: ['reviews', 'products', 'categories', 'vendors'],
  },
  vendor_category_revenue_365d: {
    title: 'Vendor × Category Revenue (365-Day)',
    shortDesc: 'Sum of order-item line totals grouped by category, restricted to one vendor over 365 days.',
    computation: '5-relation join (v ⋈ p ⋈ oi ⋈ o ⋈ c) summing line totals grouped by category for Vendor 0 over 365 days — top 50 categories by revenue.',
    joinOrder: 'vendors ▸ products ▸ order items ▸ orders ▸ categories',
    selectivity: 'Mixed 5-relation join across vendor and category axes.',
    relations: ['vendors', 'products', 'order_items', 'orders', 'categories'],
  },
  user_vendor_category_spend_30d: {
    title: 'User × Vendor × Category Spend (30-Day)',
    shortDesc: 'Spend per (vendor × category) for a single user over 30 days (heaviest 6-relation join tree).',
    computation: '6-relation join (u ⋈ o ⋈ oi ⋈ p ⋈ v ⋈ c) summing spend per (vendor × category) pair for one user over 30 days — top 50 pairs by spend.',
    joinOrder: 'users ▸ orders ▸ order items ▸ products ▸ vendors ▸ categories',
    selectivity: 'Heaviest join tree (6 relations). Transfer + temporary collection materialization dominate execution time at small scales.',
    relations: ['users', 'orders', 'order_items', 'products', 'vendors', 'categories'],
  }
};

/**
 * Decouples user search triggers from canonical relational query explanation.
 */
export const getCanonicalQueryInfo = (recordOrSpec) => {
  const spec = typeof recordOrSpec === 'string' ? recordOrSpec : recordOrSpec?.spec;
  const description = typeof recordOrSpec === 'object' ? recordOrSpec?.description : null;

  if (SPEC_METADATA[spec]) {
    return SPEC_METADATA[spec];
  }

  if (spec && spec.startsWith('live_search_')) {
    const base = SPEC_METADATA.rare_category_revenue_7d;
    return {
      title: 'Live Search Query (Rare Category Revenue)',
      shortDesc: 'Revenue per vendor for rare category products ordered in last 7 days, restricted to products matching live search filters.',
      computation: '5-relation join (cat ⋈ p ⋈ oi ⋈ o ⋈ v) evaluating aggregate vendor revenue on products matching live user search criteria — spliced into product relation.',
      joinOrder: 'categories ▸ products ▸ order items ▸ orders ▸ vendors',
      selectivity: 'Dynamic (filter-dependent). Spliced into product relation on both Standard MongoDB and Optimized (mongo-pt) sides.',
      relations: base.relations,
      isLiveVariant: true,
    };
  }

  return {
    title: spec || 'Benchmark Query',
    shortDesc: description || 'Benchmark relational query execution',
    computation: description || 'Relational join pipeline execution',
    joinOrder: 'Standard pipeline join tree',
    selectivity: 'Benchmark specification',
    relations: [],
    isLiveVariant: false,
  };
};

/**
 * Extracts and formats the application trigger context cleanly.
 */
export const getTriggerContext = (record) => {
  if (!record) return { label: 'Benchmark Protocol', kind: 'benchmark', action: 'Direct benchmark execution' };
  const { trigger, kind, search_term } = record;

  if (kind !== 'shadow' || !trigger) {
    return {
      label: kind ? `Benchmark (${kind})` : 'Benchmark Protocol',
      kind: kind || 'benchmark',
      action: 'Direct benchmark execution'
    };
  }

  try {
    const [pathname, qs] = String(trigger).split('?');
    const params = new URLSearchParams(qs || '');
    if (pathname.startsWith('/api/products')) {
      const search = search_term || params.get('search');
      const category = params.get('category');
      if (search) {
        return {
          label: 'Product Search',
          action: `Searched for "${search}"`,
          searchTerm: search,
          kind: 'search',
          endpoint: trigger
        };
      }
      if (category) {
        return {
          label: 'Category Browse',
          action: `Browsed category "${category}"`,
          kind: 'browse',
          endpoint: trigger
        };
      }
      return {
        label: 'Catalog Browse',
        action: 'Opened Product Catalog',
        kind: 'catalog',
        endpoint: trigger
      };
    }
    if (pathname.startsWith('/api/analytics/admin')) {
      return {
        label: 'Admin Dashboard',
        action: 'Loaded Admin Analytics',
        kind: 'analytics',
        endpoint: trigger
      };
    }
    if (pathname.startsWith('/api/analytics/vendor')) {
      return {
        label: 'Vendor Dashboard',
        action: 'Loaded Vendor Analytics',
        kind: 'analytics',
        endpoint: trigger
      };
    }
    return {
      label: 'API Request',
      action: pathname,
      kind: 'api',
      endpoint: trigger
    };
  } catch (_) {
    return { label: 'API Trigger', action: trigger, kind: 'api', endpoint: trigger };
  }
};

/**
 * Speedup factor badge highlighting acceleration (>1.0x).
 */
export const SpeedupBadge = ({ speedup }) => {
  if (speedup == null) {
    return <span className="text-slate-400 font-mono text-xs">—</span>;
  }

  const num = Number(speedup);
  if (num >= 1.05) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs"
        title={`Optimized (mongo-pt) is ${num.toFixed(2)}x faster than Standard MongoDB`}
      >
        <span className="text-[10px]">⚡</span>
        {num.toFixed(2)}×
      </span>
    );
  }

  if (num >= 0.95) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300"
        title="Parity: Standard MongoDB and Optimized (mongo-pt) execution times are comparable"
      >
        ~{num.toFixed(2)}×
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200"
      title={`Transfer and materialization overhead exceeded reduction benefit (${num.toFixed(2)}x)`}
    >
      <span className="text-[10px]">🔻</span>
      {num.toFixed(2)}×
    </span>
  );
};

/**
 * Result verification status badge with polynomial checksum and tuple row count.
 */
export const VerificationBadge = ({ equal, checksum, rows, mismatch }) => {
  if (equal == null) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200"
        title="Result verification not evaluated for this protocol record"
      >
        n/v
      </span>
    );
  }

  if (equal) {
    return (
      <div className="flex flex-col items-center">
        <span
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs"
          title={`✓ Equal: Standard MongoDB and Optimized (mongo-pt) returned identical results (${rows != null ? `${rows} rows` : ''}). Checksum: ${checksum || 'verified'}`}
        >
          <CheckCircle size={12} className="text-emerald-700" />
          Equal (ok)
        </span>
        {checksum && (
          <span
            className="font-mono text-[9px] text-slate-500 mt-0.5 tracking-tight"
            title={`CRC32 polynomial result checksum across both engines: ${checksum}`}
          >
            {checksum}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-xs"
        title={`Mismatch: Query results differed between engines! Reason: ${mismatch || 'Data variance'}`}
      >
        <AlertTriangle size={12} className="text-rose-700" />
        MISMATCH
      </span>
      {mismatch && (
        <span className="text-[9px] text-rose-600 font-semibold max-w-[100px] truncate" title={mismatch}>
          {mismatch}
        </span>
      )}
    </div>
  );
};

/**
 * Transfer overhead (%) and Materialization time (ms) breakdown cell.
 */
export const OverheadCell = ({ transferMs, matMs, overheadPct, fmtMs, pct }) => {
  const pctVal = overheadPct != null ? Math.round(overheadPct) : null;
  const pctColor = pctVal == null ? 'bg-slate-300' : pctVal < 30 ? 'bg-emerald-500' : pctVal < 70 ? 'bg-amber-500' : 'bg-indigo-500';
  const badgeColor = pctVal == null ? 'text-slate-400 bg-slate-100 border-slate-200' : pctVal < 30 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : pctVal < 70 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-indigo-700 bg-indigo-50 border-indigo-200';

  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${badgeColor}`}>
          {pct(overheadPct)}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
        <span title={`Transfer overhead ($in reducer arrays): ${fmtMs(transferMs)}`}>T: {fmtMs(transferMs)}</span>
        {' · '}
        <span title={`Materialization time (temporary collections): ${fmtMs(matMs)}`}>M: {fmtMs(matMs)}</span>
      </div>
      {pctVal != null && (
        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-1 border border-slate-200">
          <div className={`${pctColor} h-full transition-all`} style={{ width: `${Math.min(100, Math.max(0, pctVal))}%` }} />
        </div>
      )}
    </div>
  );
};

/**
 * Dual Latency & Instantaneous Throughput Cell.
 */
export const LatencyThroughputCell = ({ ms, engine = 'standard', fmtMs, fmtThroughput }) => {
  const tput = ms != null && ms > 0 ? (1000 / ms) : null;
  const isStd = engine === 'standard';
  const color = isStd ? 'text-rose-600' : 'text-emerald-600';

  return (
    <div className="text-right">
      <div className={`font-bold ${color} text-xs`}>
        {fmtMs(ms)}
      </div>
      <div className="text-[10px] text-slate-500 font-mono" title={`Instantaneous throughput: ${fmtThroughput(tput)}`}>
        {fmtThroughput(tput)}
      </div>
    </div>
  );
};
