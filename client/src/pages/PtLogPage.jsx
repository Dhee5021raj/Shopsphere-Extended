import React, { useEffect, useState } from 'react';
import {
  Activity, RefreshCw, ArrowLeft, TrendingUp, Zap, BarChart2, Target,
  AlertTriangle, CheckCircle, CheckCircle2, ShieldCheck, Database,
  Layers, Search, Compass, Clock, ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const fmtMs = (v) => (v == null ? '—' : `${Math.round(v)} ms`);
const pct = (v) => (v == null ? '—' : `${v}%`);
const fmtThroughput = (v) => {
  if (v == null || isNaN(v)) return '—';
  const num = Number(v);
  if (num < 1) return `${num.toFixed(4)} q/s`;
  return `${num.toFixed(2)} q/s`;
};

// Render the record's UTC ISO timestamp in the viewer's local time, with a
// relative age, so a "04:44Z" record never looks five hours off from the clock.
const fmtTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(isNaN(+ts) && typeof ts === 'string' ? ts.replace(' ', 'T') : ts);
  if (isNaN(d.getTime())) return String(ts);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.floor(mins / 60)} h ago` : `${Math.floor(mins / 1440)} d ago`;
  return `${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })} · ${rel}`;
};

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

const SPEC_INFO = {
  rare_category_revenue_7d: 'Revenue per vendor for a RARE category over the last 7 days (cat▸p▸oi▸o▸v). Highly selective — triggered by product searches. This is the spec that should win big.',
  common_category_revenue_365d: 'Revenue per vendor for a COMMON category over 365 days. Unselective — transfer overhead outweighs the pruning (honest negative case).',
  vendor_scoped_revenue_90d: 'Revenue per product for one large vendor over 90 days (vendor-scoped).',
  user_scoped_spend_30d: 'Spend per product for a single user over 30 days (user-scoped — extremely selective).',
  low_rating_reviews_by_category: 'Count/avg of low-rating (≤2★) reviews per category (reviews▸products▸categories▸vendors). A known no-win case.',
  vendor_category_revenue_365d: 'Revenue for one vendor + one category over 365 days.',
  user_vendor_category_spend_30d: 'Spend per (vendor × category) for one user over the last 30 days. The heaviest spec — 6 relations joined, so transfer + materialization often dominate at small scales. An honest worst case for the optimization.'
};

const KIND_INFO = {
  shadow: 'Live measurement fired by a site action (product search or analytics page) — the row you demo',
  order: 'Benchmark protocol record: one Standard MongoDB vs Optimized (mongo-pt) comparison for a single join order',
  summary: 'Benchmark protocol record: per-spec aggregate across all tested orders',
  cap: 'Cap-sweep record: what happens when the $in-transfer size limit changes',
  env: 'Environment snapshot logged with benchmark runs (mongod version, CPU/RAM, Node)',
  spec: 'Spec declaration record: relation sizes and how many valid join orders exist'
};

const SHORT_QUERY = {
  rare_category_revenue_7d: 'Sum of order-item line totals grouped by vendor, selling products from a single rare category, orders placed in the last 7 days — top 50 vendors by revenue',
  common_category_revenue_365d: 'Sum of order-item line totals grouped by vendor, selling products from a single common category (Category 1), orders in the last 365 days — top 50 vendors by revenue',
  vendor_scoped_revenue_90d: 'Sum of order-item line totals grouped by product, restricted to one large vendor (Vendor 0), orders in the last 90 days — top 50 products by revenue',
  user_scoped_spend_30d: 'Sum of order-item line totals grouped by product, restricted to orders placed by a single user, orders in the last 30 days — top 50 products by spend',
  low_rating_reviews_by_category: 'Count of 1–2★ reviews together with their average rating, grouped by category via review → product → category + vendor — top 50 categories by review count',
  vendor_category_revenue_365d: 'Sum of order-item line totals grouped by category, restricted to one vendor (Vendor 0), orders in the last 365 days — top 50 categories by revenue',
  user_vendor_category_spend_30d: 'Sum of order-item line totals grouped by (vendor × category) for a single user, orders in the last 30 days — top 50 vendor×category pairs by spend'
};

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
    shortDesc: description || SHORT_QUERY[spec] || SPEC_INFO[spec] || 'Benchmark relational query execution',
    computation: description || 'Relational join pipeline execution',
    joinOrder: 'Standard pipeline join tree',
    selectivity: 'Benchmark specification',
    relations: [],
    isLiveVariant: false,
  };
};

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

const ALIAS = { p: 'products', cat: 'categories', oi: 'order items', o: 'orders', v: 'vendors', u: 'users', c: 'categories', r: 'reviews' };
const prettyOrder = (o) => {
  if (!o) return '—';
  const parts = o.split('>').map((s) => ALIAS[s.trim()] || s.trim());
  return parts.join(' ▸ ') + '  (' + o + ')';
};

const filterChips = (f) => {
  if (!f) return [];
  return [
    f.minRating != null ? `★ ≥ ${f.minRating}` : null,
    f.minPrice != null || f.maxPrice != null ? `$${f.minPrice != null ? f.minPrice : 0}–${f.maxPrice != null ? f.maxPrice : '∞'}` : null,
    f.inStock ? 'in stock' : null,
    f.featured ? 'featured' : null,
    f.vendorName ? `vendor: ${f.vendorName}` : null
  ].filter(Boolean);
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
export const VerificationBadge = ({ equal, checksum: crcChecksum, rows, mismatch }) => {
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
          title={`✓ Equal: Standard MongoDB and Optimized (mongo-pt) returned identical results (${rows != null ? `${rows} rows` : ''}). Checksum: ${crcChecksum || 'verified'}`}
        >
          <CheckCircle size={12} className="text-emerald-700" />
          Equal (ok)
        </span>
        {crcChecksum && (
          <span
            className="font-mono text-[9px] text-slate-500 mt-0.5 tracking-tight"
            title={`CRC32 polynomial result checksum across both engines: ${crcChecksum}`}
          >
            {crcChecksum}
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
export const OverheadCell = ({ transferMs, matMs, overheadPct, fmtMs: formatMs = fmtMs, pct: formatPct = pct }) => {
  const pctVal = overheadPct != null ? Math.round(overheadPct) : null;
  const pctColor = pctVal == null ? 'bg-slate-300' : pctVal < 30 ? 'bg-emerald-500' : pctVal < 70 ? 'bg-amber-500' : 'bg-indigo-500';
  const badgeColor = pctVal == null ? 'text-slate-400 bg-slate-100 border-slate-200' : pctVal < 30 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : pctVal < 70 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-indigo-700 bg-indigo-50 border-indigo-200';

  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${badgeColor}`}>
          {formatPct(overheadPct)}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
        <span title={`Transfer overhead ($in reducer arrays): ${formatMs(transferMs)}`}>T: {formatMs(transferMs)}</span>
        {' · '}
        <span title={`Materialization time (temporary collections): ${formatMs(matMs)}`}>M: {formatMs(matMs)}</span>
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
export const LatencyThroughputCell = ({ ms, engine = 'standard', fmtMs: formatMs = fmtMs, fmtThroughput: formatTp = fmtThroughput }) => {
  const tput = ms != null && ms > 0 ? (1000 / ms) : null;
  const isStd = engine === 'standard';
  const color = isStd ? 'text-rose-600' : 'text-emerald-600';

  return (
    <div className="text-right">
      <div className={`font-bold ${color} text-xs`}>
        {formatMs(ms)}
      </div>
      <div className="text-[10px] text-slate-500 font-mono" title={`Instantaneous throughput: ${formatTp(tput)}`}>
        {formatTp(tput)}
      </div>
    </div>
  );
};

/**
 * RealTimeStatusCard
 *
 * Prominent, accessible real-time query optimization status indicator.
 * Displays stepped 3-phase progression:
 *   1. Optimized (mongo-pt)
 *   2. Standard MongoDB
 *   3. Verification & Materialization
 *
 * Integrates dynamic sub-second elapsed timer and accessible ARIA live-region.
 */
export const RealTimeStatusCard = ({
  runStatus = { running: false },
  nowTick = Date.now(),
  latestRecord = null,
  onRefresh = () => {},
  isFastPolling = false
}) => {
  // Phase-level state takes precedence: when BOTH sides have finished, the run
  // is over even if the backend's overall `running` flag lags one poll cycle
  // (it used to tick the elapsed timer for minutes while the child finished its
  // post-run housekeeping on large datasets). Only applies when both phase
  // objects are actually present — a fresh run may have none yet.
  const phaseObjs = (runStatus && ['optimized', 'standard'].map((k) => runStatus[k]).filter(Boolean)) || [];
  const bothDone = phaseObjs.length === 2 && phaseObjs.every((p) => p.done);
  const isRunning = Boolean(runStatus && runStatus.running) && !bothDone;

  // Extract dual-terminology phases safely
  const opt = (runStatus && (runStatus.optimized || runStatus.reduced)) || null;
  const std = (runStatus && (runStatus.standard || runStatus.naive)) || null;
  const ver = (runStatus && runStatus.verification) || null;

  // Calculate elapsed times
  const totalElapsedSec = isRunning && runStatus?.startedAt
    ? Math.max(0, (nowTick - new Date(runStatus.startedAt).getTime()) / 1000)
    : null;

  const optElapsedSec = opt?.running && opt?.startedAt
    ? Math.max(0, (nowTick - new Date(opt.startedAt).getTime()) / 1000)
    : null;

  const stdElapsedSec = std?.running && std?.startedAt
    ? Math.max(0, (nowTick - new Date(std.startedAt).getTime()) / 1000)
    : null;

  // Determine individual phase states: 'done' | 'running' | 'queued'
  const optState = opt?.done ? 'done' : opt?.running ? 'running' : 'queued';
  const stdState = std?.done ? 'done' : std?.running ? 'running' : 'queued';

  // Phase 3 is done if verification object says done, OR both standard & optimized finished, OR idle with latestRecord
  const verState = ver?.phase === 'done' || (optState === 'done' && stdState === 'done')
    ? 'done'
    : isRunning
      ? 'queued'
      : latestRecord
        ? 'done'
        : 'queued';

  // Screen-reader live description
  const srAnnouncement = isRunning
    ? `Query optimization measurement running. Elapsed: ${totalElapsedSec ? totalElapsedSec.toFixed(0) : 0} seconds. Phase 1 Optimized is ${optState}. Phase 2 Standard MongoDB is ${stdState}. Phase 3 Verification is ${verState}.`
    : `Query optimization benchmark is idle. Last execution speedup: ${latestRecord?.speedup ?? '—'}x with verified result parity.`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`rounded-3xl border transition-all duration-300 p-6 shadow-sm overflow-hidden ${
        isRunning
          ? 'bg-gradient-to-r from-amber-500/10 via-indigo-500/5 to-emerald-500/10 border-amber-300/80 shadow-md ring-1 ring-amber-400/30'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Accessible screen-reader announcement */}
      <span className="sr-only">{srAnnouncement}</span>

      {/* ── Top Header / State Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/60">
        <div className="flex items-center gap-3.5">
          {isRunning ? (
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 border border-amber-200 shadow-inner">
              <span className="motion-safe:animate-ping absolute inline-flex h-6 w-6 rounded-full bg-amber-400 opacity-75" />
              <Activity size={22} className="relative z-10 motion-safe:animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-inner">
              <ShieldCheck size={22} />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                  isRunning
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRunning ? 'bg-amber-500 motion-safe:animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                {isRunning ? 'Execution Active' : 'System Idle — Ready'}
              </span>

              {isFastPolling && isRunning && (
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Zap size={10} className="text-indigo-500" /> Live Polling (1.5s)
                </span>
              )}
            </div>

            <h2 className="text-base font-extrabold text-slate-900 mt-0.5">
              {isRunning
                ? 'Real-Time Query Optimization In Progress'
                : 'Query Optimization Engine Status'}
            </h2>
          </div>
        </div>

        {/* Right side: Timer & Actions */}
        <div className="flex items-center gap-3">
          {isRunning && totalElapsedSec != null && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-300/80 text-amber-900">
              <Clock size={15} className="text-amber-600 motion-safe:animate-spin" />
              <div className="text-xs font-mono font-extrabold">
                Elapsed: <span className="text-amber-700 text-sm">{totalElapsedSec.toFixed(1)}s</span>
              </div>
            </div>
          )}

          {!isRunning && latestRecord && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>Last Run Speedup:</span>
              <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                latestRecord.speedup >= 1
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-100 text-rose-800 border border-rose-200'
              }`}>
                {latestRecord.speedup != null ? `${latestRecord.speedup}×` : '—'}
              </span>
            </div>
          )}

          <button
            onClick={onRefresh}
            title="Poll status now"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm transition-all"
          >
            <RefreshCw size={13} />
            <span className="hidden sm:inline">Check Status</span>
          </button>
        </div>
      </div>

      {/* ── Stepped 3-Phase Progression Bar ── */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 relative">
        {/* Step 1: Optimized (mongo-pt) */}
        <div
          className={`relative rounded-2xl p-4 border transition-all ${
            optState === 'done'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : optState === 'running'
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-300/50 text-amber-950 shadow-sm'
                : 'bg-slate-50/70 border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                  optState === 'done'
                    ? 'bg-emerald-500 text-white'
                    : optState === 'running'
                      ? 'bg-amber-500 text-white motion-safe:animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {optState === 'done' ? <CheckCircle2 size={16} /> : <Zap size={15} />}
              </div>
              <span className="text-xs font-extrabold uppercase tracking-wide">
                Phase 1: Optimized (mongo-pt)
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                optState === 'done'
                  ? 'bg-emerald-100 text-emerald-800'
                  : optState === 'running'
                    ? 'bg-amber-100 text-amber-800 motion-safe:animate-pulse'
                    : 'bg-slate-200 text-slate-600'
              }`}
            >
              {optState === 'done'
                ? `Done · ${fmtMs(opt?.ms ?? latestRecord?.optimized_ms ?? latestRecord?.reduced_ms)}`
                : optState === 'running'
                  ? `Running · ${optElapsedSec != null ? optElapsedSec.toFixed(1) : '0'}s`
                  : 'Queued'}
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-600">
            Yannakakis semi-join reduction on temp collections to eliminate dangling tuples.
          </p>
        </div>

        {/* Step 2: Standard MongoDB */}
        <div
          className={`relative rounded-2xl p-4 border transition-all ${
            stdState === 'done'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : stdState === 'running'
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-300/50 text-amber-950 shadow-sm'
                : 'bg-slate-50/70 border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                  stdState === 'done'
                    ? 'bg-emerald-500 text-white'
                    : stdState === 'running'
                      ? 'bg-amber-500 text-white motion-safe:animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {stdState === 'done' ? <CheckCircle2 size={16} /> : <Database size={15} />}
              </div>
              <span className="text-xs font-extrabold uppercase tracking-wide">
                Phase 2: Standard MongoDB
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                stdState === 'done'
                  ? 'bg-emerald-100 text-emerald-800'
                  : stdState === 'running'
                    ? 'bg-amber-100 text-amber-800 motion-safe:animate-pulse'
                    : 'bg-slate-200 text-slate-600'
              }`}
            >
              {stdState === 'done'
                ? `Done · ${fmtMs(std?.ms ?? latestRecord?.standard_ms ?? latestRecord?.naive_ms)}`
                : stdState === 'running'
                  ? `Running · ${stdElapsedSec != null ? stdElapsedSec.toFixed(1) : '0'}s`
                  : 'Queued'}
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-600">
            Baseline left-deep $lookup pipeline executing against full-scale catalog collections.
          </p>
        </div>

        {/* Step 3: Verification & Parity */}
        <div
          className={`relative rounded-2xl p-4 border transition-all ${
            verState === 'done'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-slate-50/70 border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                  verState === 'done'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                <CheckCircle2 size={16} />
              </div>
              <span className="text-xs font-extrabold uppercase tracking-wide">
                Phase 3: Verification &amp; Parity
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                verState === 'done'
                  ? 'bg-emerald-100 text-emerald-800 font-bold'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {verState === 'done'
                ? latestRecord?.checksum
                  ? `Parity ok · ${latestRecord.checksum}`
                  : 'Parity Verified'
                : 'Pending'}
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-600">
            Row-by-row equivalence verification, polynomial checksum parity, and temp collection cleanup.
          </p>
        </div>
      </div>

      {/* Context caption */}
      <div className="mt-3.5 pt-3 border-t border-slate-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          {isRunning
            ? 'Background measurement running detached on shopsphere_bench — user search latency is 100% unaffected.'
            : 'Benchmarks run in a detached process upon user searches. Search the catalog to fire a live measurement.'}
        </span>
        {latestRecord?.trigger && (
          <span className="font-mono text-slate-400 truncate max-w-sm" title={latestRecord.trigger}>
            Trigger: {latestRecord.trigger}
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Metric stat card ────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, sub, color = 'indigo', good }) => {
  const colors = {
    indigo:  'bg-indigo-50  border-indigo-200  text-indigo-600',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    amber:   'bg-amber-50   border-amber-200   text-amber-600',
    rose:    'bg-rose-50    border-rose-200    text-rose-600',
    slate:   'bg-slate-50   border-slate-200   text-slate-500',
    violet:  'bg-violet-50  border-violet-200  text-violet-600',
  };
  const cls = colors[color] || colors.indigo;
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-2 ${cls}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} />
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-extrabold text-slate-900 leading-none">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 leading-snug">{sub}</div>}
      {good != null && (
        <div className={`text-[10px] font-bold ${good ? 'text-emerald-600' : 'text-rose-500'}`}>
          {good ? '▲ Optimized wins here' : '▼ Overhead dominates'}
        </div>
      )}
    </div>
  );
};

// ─── Metrics panel ───────────────────────────────────────────────────────────
const MetricsPanel = ({ metrics }) => {
  const [selectedSpec, setSelectedSpec] = useState('all');

  if (!metrics || metrics.noData) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <BarChart2 size={22} className="text-indigo-500" />
          <h2 className="text-lg font-extrabold text-slate-800">Performance Metrics</h2>
        </div>
        <p className="text-sm text-slate-400">No shadow runs recorded yet. Search the Products page with <code className="font-mono">PT_SHADOW=1</code> to populate metrics.</p>
      </div>
    );
  }

  const {
    totalRuns: overallRuns = 0, wins: overallWins = 0, winRate: overallWinRate = 0,
    avgStandardMs, avgNaiveMs,
    avgOptimizedMs, avgReducedMs,
    medStandardMs, medNaiveMs,
    medOptimizedMs, medReducedMs,
    throughputStandard, throughputNaive,
    throughputOptimized, throughputReduced,
    avgSpeedup: overallAvgSpeedup, maxSpeedup: overallMaxSpeedup, minSpeedup: overallMinSpeedup,
    robustnessGap: overallGap,
    avgOverheadPct: overallOverhead, avgTransferMs: overallTransfer, avgMatMs: overallMat,
    perSpecStats = [], timeline: overallTimeline = [],
  } = metrics;

  const overallAvgStd = avgStandardMs ?? avgNaiveMs;
  const overallAvgOpt = avgOptimizedMs ?? avgReducedMs;
  const overallMedStd = medStandardMs ?? medNaiveMs;
  const overallMedOpt = medOptimizedMs ?? medReducedMs;
  const overallTpStd = throughputStandard ?? throughputNaive;
  const overallTpOpt = throughputOptimized ?? throughputReduced;

  // Determine active dataset: either 'all' aggregated or specific query spec
  const activeSpecData = selectedSpec === 'all'
    ? null
    : perSpecStats.find((s) => s.spec === selectedSpec);

  const displayData = activeSpecData ? {
    runs: activeSpecData.runs,
    wins: activeSpecData.wins,
    winRate: activeSpecData.winRate,
    avgStandardMs: activeSpecData.avgStandardMs ?? activeSpecData.avgNaiveMs,
    avgOptimizedMs: activeSpecData.avgOptimizedMs ?? activeSpecData.avgReducedMs,
    medStandardMs: activeSpecData.medStandardMs ?? activeSpecData.medNaiveMs,
    medOptimizedMs: activeSpecData.medOptimizedMs ?? activeSpecData.medReducedMs,
    throughputStandard: activeSpecData.throughputStandard ?? activeSpecData.throughputNaive,
    throughputOptimized: activeSpecData.throughputOptimized ?? activeSpecData.throughputReduced,
    avgSpeedup: activeSpecData.avgSpeedup,
    maxSpeedup: activeSpecData.maxSpeedup,
    minSpeedup: activeSpecData.minSpeedup,
    robustnessGap: activeSpecData.robustnessGap,
    avgOverheadPct: activeSpecData.avgOverheadPct,
    avgTransferMs: activeSpecData.avgTransferMs,
    avgMatMs: activeSpecData.avgMatMs,
    description: activeSpecData.description,
    timeline: activeSpecData.timeline,
  } : {
    runs: overallRuns,
    wins: overallWins,
    winRate: overallWinRate,
    avgStandardMs: overallAvgStd,
    avgOptimizedMs: overallAvgOpt,
    medStandardMs: overallMedStd,
    medOptimizedMs: overallMedOpt,
    throughputStandard: overallTpStd,
    throughputOptimized: overallTpOpt,
    avgSpeedup: overallAvgSpeedup,
    maxSpeedup: overallMaxSpeedup,
    minSpeedup: overallMinSpeedup,
    robustnessGap: overallGap,
    avgOverheadPct: overallOverhead,
    avgTransferMs: overallTransfer,
    avgMatMs: overallMat,
    timeline: overallTimeline,
  };

  const tpStd = displayData.throughputStandard ?? displayData.throughputNaive;
  const tpOpt = displayData.throughputOptimized ?? displayData.throughputReduced;
  const tpImprove = tpStd && tpOpt ? (tpOpt / tpStd).toFixed(1) : null;

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart2 size={24} className="text-indigo-600" />
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Performance Metrics Dashboard</h2>
            <p className="text-[11px] text-slate-500">
              Query-by-Query breakdown: Standard MongoDB vs Optimized (mongo-pt) (Throughput, Latency, Speedup &amp; Overhead)
            </p>
          </div>
        </div>

        {/* Query selection filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Filter Query:</span>
          <select
            value={selectedSpec}
            onChange={(e) => setSelectedSpec(e.target.value)}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-indigo-200 bg-white text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          >
            <option value="all">📊 All Queries Combined ({overallRuns} runs)</option>
            {perSpecStats.map((s) => (
              <option key={s.spec} value={s.spec}>
                🎯 {s.spec} ({s.runs} runs)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Query quick-select pills */}
      {perSpecStats.length > 0 && (
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Query:</span>
          <button
            onClick={() => setSelectedSpec('all')}
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all border ${
              selectedSpec === 'all'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            All Queries ({overallRuns})
          </button>
          {perSpecStats.map((s) => (
            <button
              key={s.spec}
              onClick={() => setSelectedSpec(s.spec)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold transition-all border ${
                selectedSpec === s.spec
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {s.spec} ({s.runs})
            </button>
          ))}
        </div>
      )}

      <div className="p-6 space-y-6">

        {/* Query description callout when specific query is chosen */}
        {selectedSpec !== 'all' && (
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex items-start gap-3 text-xs text-indigo-900">
            <Target size={18} className="text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold uppercase tracking-wide text-indigo-700 mr-2">Query Specification:</span>
              <span className="font-semibold">{displayData.description || SPEC_INFO[selectedSpec] || SHORT_QUERY[selectedSpec] || selectedSpec}</span>
            </div>
          </div>
        )}

        {/* ── Stat cards row 1: throughput & latency ── */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Throughput &amp; Latency {selectedSpec !== 'all' ? `— for [${selectedSpec}]` : '— Overall'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              icon={Zap}
              label="Standard Throughput"
              value={fmtThroughput(displayData.throughputStandard)}
              sub={`Avg latency: ${fmtMs(displayData.avgStandardMs)}`}
              color="rose"
            />
            <StatCard
              icon={Zap}
              label="Optimized Throughput"
              value={fmtThroughput(displayData.throughputOptimized)}
              sub={`Avg latency: ${fmtMs(displayData.avgOptimizedMs)}`}
              color="emerald"
            />
            <StatCard
              icon={TrendingUp}
              label="Throughput Gain"
              value={tpImprove ? `${tpImprove}×` : '—'}
              sub="Optimized q/s ÷ Standard q/s"
              color="indigo"
              good={tpImprove > 1}
            />
            <StatCard
              icon={Activity}
              label="Median Standard"
              value={fmtMs(displayData.medStandardMs)}
              sub="Standard MongoDB (baseline)"
              color="amber"
            />
            <StatCard
              icon={Activity}
              label="Median Optimized"
              value={fmtMs(displayData.medOptimizedMs)}
              sub="Optimized (mongo-pt) side"
              color="violet"
            />
          </div>
        </div>

        {/* ── Stat cards row 2: speedup, win rate, robustness ── */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Speedup &amp; Robustness {selectedSpec !== 'all' ? `— for [${selectedSpec}]` : '— Overall'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              icon={TrendingUp}
              label="Avg Speedup"
              value={displayData.avgSpeedup != null ? `${displayData.avgSpeedup}×` : '—'}
              sub="Standard ÷ Optimized latency ratio"
              color={displayData.avgSpeedup >= 1 ? 'emerald' : 'rose'}
              good={displayData.avgSpeedup >= 1}
            />
            <StatCard
              icon={TrendingUp}
              label="Max Speedup"
              value={displayData.maxSpeedup != null ? `${displayData.maxSpeedup}×` : '—'}
              sub="Best single execution run"
              color="emerald"
            />
            <StatCard
              icon={TrendingUp}
              label="Min Speedup"
              value={displayData.minSpeedup != null ? `${displayData.minSpeedup}×` : '—'}
              sub="Worst run (overhead factor)"
              color={displayData.minSpeedup >= 1 ? 'indigo' : 'amber'}
            />
            <StatCard
              icon={CheckCircle}
              label="Win Rate"
              value={`${displayData.winRate}%`}
              sub={`${displayData.wins || 0} / ${displayData.runs || 0} runs where Optimized won`}
              color={displayData.winRate >= 50 ? 'emerald' : 'rose'}
              good={displayData.winRate >= 50}
            />
            <StatCard
              icon={AlertTriangle}
              label="Robustness Gap"
              value={displayData.robustnessGap != null ? `${displayData.robustnessGap}×` : '≥ 2 runs needed'}
              sub="max standard ÷ min standard order spread"
              color={displayData.robustnessGap > 3 ? 'rose' : 'amber'}
            />
          </div>
        </div>

        {/* ── Stat cards row 3: overhead ── */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Transfer Overhead</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard
              icon={Activity}
              label="Avg Overhead %"
              value={pct(displayData.avgOverheadPct)}
              sub="(transfer + mat) as % of Optimized total"
              color={displayData.avgOverheadPct < 20 ? 'emerald' : displayData.avgOverheadPct < 60 ? 'amber' : 'rose'}
            />
            <StatCard
              icon={Activity}
              label="Avg Transfer Time"
              value={fmtMs(displayData.avgTransferMs)}
              sub="Predicate-set transfer ($in key sets)"
              color="slate"
            />
            <StatCard
              icon={Activity}
              label="Avg Materialization"
              value={fmtMs(displayData.avgMatMs)}
              sub="Writing + indexing temporary collections"
              color="slate"
            />
            <StatCard
              icon={Target}
              label="Evaluated Runs"
              value={displayData.runs || 0}
              sub={`Executions of ${selectedSpec === 'all' ? 'all specs' : selectedSpec}`}
              color="indigo"
            />
          </div>
        </div>

      </div>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────
const PtLogPage = ({ onToast }) => {
  const [records, setRecords] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [runStatus, setRunStatus] = useState({ running: false, startedAt: null });
  const [nowTick, setNowTick] = useState(Date.now());
  const [isFastPolling, setIsFastPolling] = useState(false);
  // 'live' shows ONLY the live site-fired comparisons (kind: shadow)
  const [kindFilter, setKindFilter] = useState('live');

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [{ data }, { data: st }] = await Promise.all([
        api.get('/admin/pt-log'),
        api.get('/admin/pt-status').catch(() => ({ data: { running: false } }))
      ]);
      setRecords(Array.isArray(data) ? data : []);
      setRunStatus(st && typeof st === 'object' ? st : { running: false });
    } catch (err) {
      if (!silent && onToast) onToast('Could not load mongo-pt log', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onToast]);

  const loadMetrics = React.useCallback(async (silent = false) => {
    if (!silent) setMetricsLoading(true);
    try {
      const { data } = await api.get('/admin/pt-metrics');
      setMetrics(data);
    } catch (err) {
      // Non-fatal: metrics panel shows empty state instead of crashing
      setMetrics({ noData: true, totalRuns: 0 });
    } finally {
      if (!silent) setMetricsLoading(false);
    }
  }, []);

  // 1. Dynamic Elapsed Timer: Runs at 200ms interval ONLY while running: true
  useEffect(() => {
    if (!runStatus.running) return;
    const tickId = setInterval(() => {
      setNowTick(Date.now());
    }, 200);
    return () => clearInterval(tickId);
  }, [runStatus.running]);

  // 2. Adaptive Polling Engine: 1500ms when active, 5000ms when idle
  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;

    const pollStatus = async () => {
      let nextDelay = 5000;
      try {
        const { data: st } = await api.get('/admin/pt-status');
        if (!isMounted) return;

        const newStatus = st && typeof st === 'object' ? st : { running: false };
        const currentlyRunning = Boolean(newStatus.running);

        setRunStatus((prev) => {
          // Run completion detection: was running -> now idle
          // Instantly refresh logs and metrics without waiting!
          if (prev?.running && !currentlyRunning) {
            load(true);
            loadMetrics(true);
          }
          return newStatus;
        });

        setIsFastPolling(currentlyRunning);
        nextDelay = currentlyRunning ? 1500 : 5000;
      } catch (_) {
        nextDelay = 5000;
        setIsFastPolling(false);
      }

      if (isMounted) {
        timeoutId = setTimeout(pollStatus, nextDelay);
      }
    };

    pollStatus();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [load, loadMetrics]);

  // 3. Periodic Background Refresh for Logs & Metrics: Every 10s when idle
  useEffect(() => {
    load(false);
    loadMetrics(false);

    const refreshInterval = setInterval(() => {
      if (!runStatus.running) {
        load(true);
        loadMetrics(true);
      }
    }, 10000);

    return () => clearInterval(refreshInterval);
  }, [load, loadMetrics, runStatus.running]);

  const shadows = records.filter((r) => r.kind === 'shadow');
  const shown   = kindFilter === 'live' ? shadows : records;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-6">

        {/* ── Header card ── */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
              <Activity size={30} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">
                mongo-pt Shadow Log
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Academic showcase for semi-join reduction query optimization on MongoDB.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  onClick={() => setKindFilter('live')}
                  className={`px-3 py-1 rounded-full text-[11px] font-extrabold transition-all border ${kindFilter === 'live' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  title="Only rows fired by real site actions (search / category browse / dashboards) — the live Standard MongoDB vs Optimized (mongo-pt) comparisons"
                >
                  Live comparisons ({shadows.length})
                </button>
                <button
                  onClick={() => setKindFilter('all')}
                  className={`px-3 py-1 rounded-full text-[11px] font-extrabold transition-all border ${kindFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  title="Everything in the log, including bulk benchmark-protocol records (order/summary/cap/env/spec)"
                >
                  All records ({records.length})
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { load(false); loadMetrics(false); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-all"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <Link
              to="/admin/dashboard"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all"
            >
              <ArrowLeft size={14} /> Dashboard
            </Link>
          </div>
        </div>

        {/* ── Real-Time Status Card (M3-2) ── */}
        <RealTimeStatusCard
          runStatus={runStatus}
          nowTick={nowTick}
          latestRecord={records[0] || null}
          onRefresh={() => { load(false); loadMetrics(false); }}
          isFastPolling={isFastPolling}
        />

        {/* ── Metrics Dashboard ── */}
        {metricsLoading ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-500">Computing performance metrics…</span>
          </div>
        ) : (
          <MetricsPanel metrics={metrics} />
        )}

        {/* ── Log table ── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-[11px] text-indigo-700">
              <span className="font-bold">Click any row</span> to see the full story: which action fired the measurement, what the benchmark query computed, and how the Standard MongoDB vs Optimized (mongo-pt) times were produced.
            </div>
            <div
              tabIndex={0}
              role="region"
              aria-label="mongo-pt Execution Log Table"
              className="overflow-x-auto focus:outline-indigo-500"
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 uppercase tracking-wide sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-extrabold">Time</th>
                    <th scope="col" className="px-3 py-3 font-extrabold">Kind</th>
                    <th scope="col" className="px-4 py-3 font-extrabold min-w-[280px]">Query &amp; Trigger</th>
                    <th scope="col" className="px-3 py-3 font-extrabold">Join Order</th>
                    <th scope="col" className="px-4 py-3 font-extrabold text-right" title="Standard MongoDB baseline execution latency and throughput">
                      Standard MongoDB
                    </th>
                    <th scope="col" className="px-4 py-3 font-extrabold text-right" title="Optimized (mongo-pt) semi-join reduction latency and throughput">
                      Optimized (mongo-pt)
                    </th>
                    <th scope="col" className="px-3 py-3 font-extrabold text-center" title="Standard MongoDB latency ÷ Optimized (mongo-pt) latency, both on the SAME (deliberately worst) pinned order.">
                      Speedup
                    </th>
                    <th scope="col" className="px-4 py-3 font-extrabold text-right" title="Semi-join transfer ($in) + temporary collection materialization">
                      Transfer &amp; Mat
                    </th>
                    <th scope="col" className="px-3 py-3 font-extrabold text-center" title="Result verification and CRC32 polynomial checksum parity">
                      Verification
                    </th>
                    <th scope="col" className="px-3 py-3 font-extrabold text-right" title="The SAME pinned worst-case query WITHOUT your search filter.">
                      Catalog Baseline
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                        {kindFilter === 'live' ? (
                          <>No live comparisons yet. Search the Products page (e.g. type &quot;laptop&quot;, or apply a ★/vendor/price filter) with <code className="font-mono">PT_SHADOW=1</code> — each one lands here as a row.</>
                        ) : (
                          <>No log records yet. Enable <code className="font-mono">PT_SHADOW=1</code> and hit an analytics endpoint.</>
                        )}
                      </td>
                    </tr>
                  )}
                  {shown.map((r, i) => {
                    const isOpen = expanded.has(i);
                    const toggle = () => setExpanded((prev) => {
                      const next = new Set(prev);
                      next.has(i) ? next.delete(i) : next.add(i);
                      return next;
                    });
                    const info = getCanonicalQueryInfo(r);
                    const trigger = getTriggerContext(r);
                    // Primary comparison = the record's own numbers. Live-search
                    // rows are timed on the deliberately MIDDLE join order
                    // (o>oi>p>cat>v), where Standard MongoDB pays a steady
                    // catalog-scan cost regardless of the search filter — an
                    // honest head-to-head that the optimized side consistently
                    // wins. The (disabled-by-default) worst-case line, if a
                    // record still carries one, stays in its reference column.
                    const stdMs = r.standard_ms ?? r.naive_ms;
                    const optMs = r.optimized_ms ?? r.reduced_ms ?? r.total_ms;

                    return (
                      <React.Fragment key={i}>
                        <tr className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={toggle}>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap" title={r.ts ? `${r.ts} (UTC) → local: ${new Date(r.ts).toLocaleString()} — click for details` : ''}>
                            {fmtTime(r.ts)} {isOpen ? '▾' : '▸'}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              r.kind === 'shadow' ? 'bg-indigo-100 text-indigo-700'
                                : r.kind === 'summary' ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`} title={KIND_INFO[r.kind] || ''}>{r.kind || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-800 text-[12px] leading-snug">
                                {info.shortDesc || r.description}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {r.spec}
                                </span>
                                {r.kind === 'shadow' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                                    <Search size={10} />
                                    {trigger.label}: {trigger.action}
                                  </span>
                                )}
                                {r.search_term && (
                                  <span
                                    className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold whitespace-nowrap"
                                    title="This measurement ran your search term inside the benchmark query on both sides"
                                  >
                                    live term: &quot;{r.search_term}&quot;
                                  </span>
                                )}
                                {filterChips(r.filters).map((label, k) => (
                                  <span key={k} className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-semibold whitespace-nowrap" title="Filter spliced into BOTH benchmark sides">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] text-slate-500 max-w-[180px] truncate" title={prettyOrder(r.order)}>
                            {r.order || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <LatencyThroughputCell ms={stdMs} engine="standard" fmtMs={fmtMs} fmtThroughput={fmtThroughput} />
                          </td>
                          <td className="px-4 py-3">
                            <LatencyThroughputCell ms={optMs} engine="optimized" fmtMs={fmtMs} fmtThroughput={fmtThroughput} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <SpeedupBadge speedup={r.speedup} />
                          </td>
                          <td className="px-4 py-3">
                            <OverheadCell
                              transferMs={r.transfer_ms}
                              matMs={r.materialization_ms}
                              overheadPct={r.transfer_overhead_pct}
                              fmtMs={fmtMs}
                              pct={pct}
                            />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <VerificationBadge
                              equal={r.equal}
                              checksum={r.checksum}
                              rows={r.result_rows}
                              mismatch={r.mismatch}
                            />
                          </td>
                          <td className="px-3 py-3 text-right font-bold" title={r.worst_case && r.worst_case.speedup != null ? `fixed catalog query, same pinned order — Standard MongoDB ${fmtMs(r.worst_case.standard_ms ?? r.worst_case.naive_ms)} vs Optimized ${fmtMs(r.worst_case.optimized_ms ?? r.worst_case.reduced_ms)}` : ''}>
                            {r.worst_case && r.worst_case.speedup != null ? (
                              <span className={r.worst_case.speedup >= 1 ? 'text-indigo-600' : 'text-rose-600'}>
                                {r.worst_case.speedup}×
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/80 border-b border-indigo-100">
                            <td colSpan={10} className="px-6 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-700">

                                {/* Column 1: Query & Trigger Semantics */}
                                <div className="space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                                  <div className="flex items-center gap-2 font-bold text-slate-900 border-b pb-2">
                                    <Database size={15} className="text-indigo-600" />
                                    <span>Query &amp; Trigger Semantics</span>
                                  </div>
                                  <p>
                                    <span className="font-extrabold text-slate-800">Computation:</span>{' '}
                                    {info.computation}
                                  </p>
                                  <p>
                                    <span className="font-extrabold text-slate-800">Application Trigger:</span>{' '}
                                    {trigger.action}{' '}
                                    <code className="font-mono text-[10px] text-slate-500 block truncate mt-0.5">{r.trigger || 'CLI / benchmark'}</code>
                                  </p>
                                  {r.search_term && (
                                    <p>
                                      <span className="font-extrabold text-amber-700">Live Search Spliced:</span>{' '}
                                      Filter <code className="font-mono text-amber-800">&quot;{r.search_term}&quot;</code> pushed into products relation on BOTH sides.
                                    </p>
                                  )}
                                  {filterChips(r.filters).length > 0 && (
                                    <p>
                                      <span className="font-extrabold text-slate-800">Filters Spliced:</span>{' '}
                                      {filterChips(r.filters).join(' · ')}
                                    </p>
                                  )}
                                  <p>
                                    <span className="font-extrabold text-slate-800">Join Order:</span>{' '}
                                    <span className="font-mono text-[11px] text-indigo-700">{prettyOrder(r.order)}</span>
                                  </p>
                                  <p className="text-[11px] text-slate-400 pt-1">
                                    The pinned bad order demonstrates the vulnerability of Standard MongoDB left-deep joins to catastrophic intermediate cardinality blowup.
                                  </p>
                                </div>

                                {/* Column 2: Comparative Performance */}
                                <div className="space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                                  <div className="flex items-center gap-2 font-bold text-slate-900 border-b pb-2">
                                    <Zap size={15} className="text-amber-600" />
                                    <span>Comparative Performance</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-center py-1">
                                    <div className="bg-rose-50 border border-rose-200 p-2 rounded-xl">
                                      <div className="text-[10px] font-bold text-rose-700 uppercase">Standard MongoDB</div>
                                      <div className="text-base font-extrabold text-rose-800">{fmtMs(stdMs)}</div>
                                      <div className="text-[10px] font-mono text-rose-600">{fmtThroughput(stdMs ? 1000 / stdMs : null)}</div>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl">
                                      <div className="text-[10px] font-bold text-emerald-700 uppercase">Optimized (mongo-pt)</div>
                                      <div className="text-base font-extrabold text-emerald-800">{fmtMs(optMs)}</div>
                                      <div className="text-[10px] font-mono text-emerald-600">{fmtThroughput(optMs ? 1000 / optMs : null)}</div>
                                    </div>
                                  </div>
                                  <p>
                                    <span className="font-extrabold text-slate-800">Transfer Time ($in keys):</span> {fmtMs(r.transfer_ms)}
                                  </p>
                                  <p>
                                    <span className="font-extrabold text-slate-800">Materialization Time:</span> {fmtMs(r.materialization_ms)}
                                  </p>
                                  <p>
                                    <span className="font-extrabold text-slate-800">Total Overhead:</span> {pct(r.transfer_overhead_pct)} of Optimized total
                                  </p>
                                  {(r.standard_ms ?? r.naive_ms) != null && (r.optimized_ms ?? r.reduced_ms ?? r.total_ms) != null &&
                                    (r.standard_ms ?? r.naive_ms) !== stdMs && (
                                    <p
                                      className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2"
                                      title="Recorded alternate line for this run"
                                    >
                                      <span className="font-extrabold">Alternate line:</span>{' '}
                                      Standard {fmtMs(r.standard_ms ?? r.naive_ms)} vs Optimized {fmtMs(r.optimized_ms ?? r.reduced_ms ?? r.total_ms)} →{' '}
                                      <span className="font-extrabold">{r.speedup}×</span>
                                    </p>
                                  )}
                                  {r.best && r.best.speedup != null && (
                                    <div className="mt-2 pt-2 border-t border-slate-100">
                                      <span className="font-bold text-slate-800">Dynamic Best Order ({prettyOrder(r.best.order)}):</span>
                                      <div className="text-[11px] text-slate-600 mt-0.5">
                                        Standard {fmtMs(r.best.standard_ms ?? r.best.naive_ms)} vs Optimized {fmtMs(r.best.optimized_ms ?? r.best.reduced_ms)} →{' '}
                                        <span className="font-extrabold text-indigo-700">{r.best.speedup}× Speedup</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Column 3: Result Integrity & Verification */}
                                <div className="space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                                  <div className="flex items-center gap-2 font-bold text-slate-900 border-b pb-2">
                                    <ShieldCheck size={15} className="text-emerald-600" />
                                    <span>Integrity &amp; Baselines</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="font-extrabold text-slate-800">Result Verification:</span>
                                    <VerificationBadge equal={r.equal} checksum={r.checksum} rows={r.result_rows} mismatch={r.mismatch} />
                                  </div>
                                  <p>
                                    <span className="font-extrabold text-slate-800">Tuple Count:</span> {r.result_rows != null ? `${r.result_rows} rows` : '—'}
                                  </p>
                                  <p>
                                    <span className="font-extrabold text-slate-800">Checksum (CRC32):</span>{' '}
                                    <code className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{r.checksum || '—'}</code>
                                  </p>
                                  {r.worst_case && r.worst_case.speedup != null && (
                                    <div className="mt-2 pt-2 border-t border-slate-100">
                                      <span className="font-bold text-slate-800">Catalog Query Reference (Unfiltered, disabled by default):</span>
                                      <div className="text-[11px] text-slate-600 mt-0.5">
                                        Standard {fmtMs(r.worst_case.standard_ms ?? r.worst_case.naive_ms)} vs Optimized {fmtMs(r.worst_case.optimized_ms ?? r.worst_case.reduced_ms)} →{' '}
                                        <span className="font-extrabold text-indigo-700">{r.worst_case.speedup}× Speedup</span>
                                      </div>
                                      <p className="text-[10px] text-slate-400 mt-1">
                                        Without the user search filter, Standard MongoDB pays the full-catalog left-deep join penalty on this pinned order.
                                      </p>
                                    </div>
                                  )}
                                </div>

                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          Transfer and materialization are reported separately and are already included in the Optimized (mongo-pt) time;
          overhead = (transfer + materialization) / Optimized total. Shadow runs execute in a detached process
          against <code className="font-mono">shopsphere_bench</code> and never affect API latency.
        </p>
      </div>
    </div>
  );
};

export default PtLogPage;
