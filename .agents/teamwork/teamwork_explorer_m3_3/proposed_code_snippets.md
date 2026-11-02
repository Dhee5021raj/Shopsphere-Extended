# Proposed Code Changes for `client/src/pages/PtLogPage.jsx`

This document details the exact before → after code replacements to achieve:
1. Complete terminology update ("Standard MongoDB" vs "Optimized (mongo-pt)").
2. Prominent per-query descriptions from `perSpecStats` and `r.description`.
3. Decoupling user search triggers from canonical relational query computations.
4. Comprehensive comparative metrics:
   - Latency: Standard MongoDB vs Optimized (mongo-pt)
   - Throughput: Queries per second (q/s) for both engines
   - Speedup factor with acceleration badge (>1.0x)
   - Transfer overhead (%) and Materialization time (ms)
   - Result verification badge (`Equal (ok)`, polynomial checksum, tuple count).
5. Accessible table semantics adhering to modern web guidance (`responsive-table`, sticky headers, `role="region"`, `tabindex="0"`).

---

## 1. Import Enhancements (Lines 1-7)

### Before:
```jsx
import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, ArrowLeft, TrendingUp, Zap, BarChart2, Target, AlertTriangle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
```

### After:
```jsx
import React, { useEffect, useState } from 'react';
import {
  Activity, RefreshCw, ArrowLeft, TrendingUp, Zap, BarChart2, Target,
  AlertTriangle, CheckCircle, ShieldCheck, Database, Layers, Search, Compass
} from 'lucide-react';
import { Link } from 'react-router-dom';
```

---

## 2. Canonical Spec Metadata Registry & Helpers (Lines 25-86)

### Before:
```jsx
const SPEC_INFO = {
  rare_category_revenue_7d: 'Revenue per vendor for a RARE category over the last 7 days (cat▸p▸oi▸o▸v)...',
  ...
};
const queryDescription = (r) => SHORT_QUERY[r.spec] || r.description || SPEC_INFO[r.spec] || 'Benchmark query';
...
const queryCellText = (r) => {
  const action = r.kind === 'shadow' ? userAction(r.trigger) : null;
  return action || queryDescription(r);
};
```

### After:
```jsx
export const SPEC_METADATA = {
  rare_category_revenue_7d: {
    title: 'Rare Category Revenue (7-Day)',
    shortDesc: 'Sum of order-item line totals grouped by vendor for a rare category over 7 days.',
    computation: '5-relation join (cat ⋈ p ⋈ oi ⋈ o ⋈ v) summing order item line totals grouped by vendor for orders placed in the last 7 days — top 50 vendors by revenue.',
    joinOrder: 'categories ▸ products ▸ order items ▸ orders ▸ vendors',
    selectivity: 'High (~1 rare category row out of 100). Semi-join reduction eliminates >99% intermediate tuples.',
    relations: ['categories', 'products', 'order_items', 'orders', 'vendors'],
  },
  common_category_revenue_365d: {
    title: 'Common Category Revenue (365-Day)',
    shortDesc: 'Sum of order-item line totals grouped by vendor for a common category over 365 days.',
    computation: '5-relation join (cat ⋈ p ⋈ oi ⋈ o ⋈ v) summing line totals grouped by vendor for Category 1 over 365 days — top 50 vendors by revenue.',
    joinOrder: 'categories ▸ products ▸ order items ▸ orders ▸ vendors',
    selectivity: 'Low (unselective). High cardinality survives reducer; transfer overhead dominates (honest negative control).',
    relations: ['categories', 'products', 'order_items', 'orders', 'vendors'],
  },
  vendor_scoped_revenue_90d: {
    title: 'Vendor-Scoped Revenue (90-Day)',
    shortDesc: 'Sum of order-item line totals grouped by product for one large vendor over 90 days.',
    computation: '4-relation join (v ⋈ oi ⋈ o ⋈ p) summing line totals grouped by product, restricted to Vendor 0 over 90 days — top 50 products by revenue.',
    joinOrder: 'vendors ▸ order items ▸ orders ▸ products',
    selectivity: 'Medium-High. Demonstrates partition pruning via semi-join reducer.',
    relations: ['vendors', 'order_items', 'orders', 'products'],
  },
  user_scoped_spend_30d: {
    title: 'User-Scoped Spend (30-Day)',
    shortDesc: 'Sum of order-item line totals grouped by product for orders placed by a single user in 30 days.',
    computation: '4-relation join (u ⋈ o ⋈ oi ⋈ p) summing order item line totals grouped by product for orders placed by one user in the last 30 days — top 50 products by spend.',
    joinOrder: 'users ▸ orders ▸ order items ▸ products',
    selectivity: 'Extremely high (single user needle in 100k orders). Fast reduction.',
    relations: ['users', 'orders', 'order_items', 'products'],
  },
  low_rating_reviews_by_category: {
    title: 'Low Rating Reviews by Category',
    shortDesc: 'Count of 1–2★ reviews with average rating, grouped by category.',
    computation: '4-relation join (r ⋈ p ⋈ c ⋈ v) counting 1–2★ reviews and calculating average rating per category — top 50 categories by review count.',
    joinOrder: 'reviews ▸ products ▸ categories ▸ vendors',
    selectivity: 'Medium. Branching join tree where reviews filter does not strongly prune products.',
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
    shortDesc: 'Spend per (vendor × category) for a single user over 30 days (6-relation join tree).',
    computation: '6-relation join (u ⋈ o ⋈ oi ⋈ p ⋈ v ⋈ c) summing spend per (vendor × category) pair for one user over 30 days — top 50 pairs by spend.',
    joinOrder: 'users ▸ orders ▸ order items ▸ products ▸ vendors ▸ categories',
    selectivity: 'Heaviest join tree (6 relations). Transfer + materialization dominate at small scales.',
    relations: ['users', 'orders', 'order_items', 'products', 'vendors', 'categories'],
  }
};

export const getCanonicalQueryInfo = (recordOrSpec) => {
  const spec = typeof recordOrSpec === 'string' ? recordOrSpec : recordOrSpec?.spec;
  const description = typeof recordOrSpec === 'object' ? recordOrSpec?.description : null;

  if (SPEC_METADATA[spec]) return SPEC_METADATA[spec];

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
```

---

## 3. Metrics Cards & Terminology in `MetricsPanel` (Lines 185-350)

### Before:
```jsx
const {
  totalRuns: overallRuns, wins: overallWins, winRate: overallWinRate,
  avgNaiveMs: overallAvgNaive, avgReducedMs: overallAvgRed,
  ...
  throughputNaive: overallTpNaive, throughputReduced: overallTpRed,
} = metrics;
...
<StatCard
  icon={Zap}
  label="Naive Throughput"
  value={fmtThroughput(displayData.throughputNaive)}
  sub={`Avg latency: ${fmtMs(displayData.avgNaiveMs)}`}
  color="rose"
/>
<StatCard
  icon={Zap}
  label="PT Throughput"
  value={fmtThroughput(displayData.throughputReduced)}
  sub={`Avg latency: ${fmtMs(displayData.avgReducedMs)}`}
  color="emerald"
/>
```

### After:
```jsx
const {
  totalRuns: overallRuns, wins: overallWins, winRate: overallWinRate,
  avgStandardMs: overallAvgStd = metrics.avgNaiveMs,
  avgOptimizedMs: overallAvgOpt = metrics.avgReducedMs,
  medStandardMs: overallMedStd = metrics.medNaiveMs,
  medOptimizedMs: overallMedOpt = metrics.medReducedMs,
  throughputStandard: overallTpStd = metrics.throughputNaive,
  throughputOptimized: overallTpOpt = metrics.throughputReduced,
  avgSpeedup: overallAvgSpeedup, maxSpeedup: overallMaxSpeedup, minSpeedup: overallMinSpeedup,
  robustnessGap: overallGap,
  avgOverheadPct: overallOverhead, avgTransferMs: overallTransfer, avgMatMs: overallMat,
  perSpecStats = [], timeline: overallTimeline = [],
} = metrics;

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

const tpImprove = displayData.throughputStandard && displayData.throughputOptimized
  ? (displayData.throughputOptimized / displayData.throughputStandard).toFixed(1)
  : null;
```

Updated StatCards Row 1:
```jsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
  <StatCard
    icon={Zap}
    label="Standard MongoDB Tput"
    value={fmtThroughput(displayData.throughputStandard)}
    sub={`Avg latency: ${fmtMs(displayData.avgStandardMs)}`}
    color="rose"
  />
  <StatCard
    icon={Zap}
    label="Optimized (mongo-pt) Tput"
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
    label="Standard Median"
    value={fmtMs(displayData.medStandardMs)}
    sub="Standard MongoDB (baseline)"
    color="amber"
  />
  <StatCard
    icon={Activity}
    label="Optimized Median"
    value={fmtMs(displayData.medOptimizedMs)}
    sub="Optimized (mongo-pt) side"
    color="violet"
  />
</div>
```

---

## 4. Per-Spec Summary Table in `MetricsPanel` (Lines 480-550)

### Before:
```jsx
<table className="w-full text-left text-xs">
  <thead className="bg-slate-100 text-slate-500 uppercase tracking-wide">
    <tr>
      <th className="px-4 py-2.5 font-bold">Query Spec</th>
      <th className="px-4 py-2.5 font-bold text-right">Runs</th>
      <th className="px-4 py-2.5 font-bold text-right">Naive avg</th>
      <th className="px-4 py-2.5 font-bold text-right">PT avg</th>
      <th className="px-4 py-2.5 font-bold text-right">Naive tput</th>
      <th className="px-4 py-2.5 font-bold text-right">PT tput</th>
      <th className="px-4 py-2.5 font-bold text-right">Avg speedup</th>
      <th className="px-4 py-2.5 font-bold text-right">Max speedup</th>
      <th className="px-4 py-2.5 font-bold text-right">Win Rate</th>
      <th className="px-4 py-2.5 font-bold text-center">Action</th>
    </tr>
  </thead>
```

### After:
```jsx
<div
  tabIndex={0}
  role="region"
  aria-label="Query Performance Metrics Summary Table"
  className="overflow-x-auto rounded-2xl border border-slate-200 shadow-xs focus:outline-indigo-500"
>
  <table className="w-full text-left text-xs border-collapse">
    <thead className="bg-slate-100 text-slate-600 uppercase tracking-wide sticky top-0 z-10 border-b border-slate-200">
      <tr>
        <th scope="col" className="px-4 py-3 font-extrabold min-w-[240px]">Query Specification</th>
        <th scope="col" className="px-3 py-3 font-extrabold text-right">Runs</th>
        <th scope="col" className="px-4 py-3 font-extrabold text-right" title="Standard MongoDB average latency & throughput">
          Standard MongoDB
        </th>
        <th scope="col" className="px-4 py-3 font-extrabold text-right" title="Optimized (mongo-pt) average latency & throughput">
          Optimized (mongo-pt)
        </th>
        <th scope="col" className="px-3 py-3 font-extrabold text-center" title="Mean speedup factor (Standard latency ÷ Optimized latency)">
          Avg Speedup
        </th>
        <th scope="col" className="px-3 py-3 font-extrabold text-center" title="Peak speedup recorded in best run">
          Max Speedup
        </th>
        <th scope="col" className="px-4 py-3 font-extrabold text-right" title="Transfer and materialization overhead as % of total run time">
          Transfer &amp; Mat
        </th>
        <th scope="col" className="px-3 py-3 font-extrabold text-center" title="% of runs where mongo-pt was faster">
          Win Rate
        </th>
        <th scope="col" className="px-3 py-3 font-extrabold text-center">Action</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100">
      {perSpecStats.map((s) => {
        const isSelected = selectedSpec === s.spec;
        const info = getCanonicalQueryInfo(s);
        const stdMs = s.avgStandardMs ?? s.avgNaiveMs;
        const optMs = s.avgOptimizedMs ?? s.avgReducedMs;
        const stdTp = s.throughputStandard ?? s.throughputNaive;
        const optTp = s.throughputOptimized ?? s.throughputReduced;

        return (
          <tr
            key={s.spec}
            onClick={() => setSelectedSpec(isSelected ? 'all' : s.spec)}
            className={`cursor-pointer transition-colors ${
              isSelected ? 'bg-indigo-50/90 font-semibold' : 'hover:bg-slate-50'
            }`}
          >
            <td className="px-4 py-3">
              <div className="font-mono text-xs font-bold text-slate-800">
                {s.spec}
              </div>
              <div className="text-[11px] text-slate-500 font-normal leading-snug line-clamp-2 mt-0.5">
                {s.description || info.shortDesc}
              </div>
            </td>
            <td className="px-3 py-3 text-right font-medium text-slate-700">{s.runs}</td>
            <td className="px-4 py-3 text-right">
              <div className="font-bold text-rose-600 text-xs">{fmtMs(stdMs)}</div>
              <div className="text-[10px] text-slate-400 font-mono">{fmtThroughput(stdTp)}</div>
            </td>
            <td className="px-4 py-3 text-right">
              <div className="font-bold text-emerald-600 text-xs">{fmtMs(optMs)}</div>
              <div className="text-[10px] text-slate-400 font-mono">{fmtThroughput(optTp)}</div>
            </td>
            <td className="px-3 py-3 text-center">
              <SpeedupBadge speedup={s.avgSpeedup} />
            </td>
            <td className="px-3 py-3 text-center">
              <SpeedupBadge speedup={s.maxSpeedup} />
            </td>
            <td className="px-4 py-3">
              <OverheadCell
                transferMs={s.avgTransferMs}
                matMs={s.avgMatMs}
                overheadPct={s.avgOverheadPct}
                fmtMs={fmtMs}
                pct={pct}
              />
            </td>
            <td className="px-3 py-3 text-center">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                s.winRate >= 50 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}>
                {s.winRate}%
              </span>
            </td>
            <td className="px-3 py-3 text-center">
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border transition-all ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}>
                {isSelected ? 'Selected' : 'View'}
              </span>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>
```

---

## 5. Main Execution Log Table Header & Rows (Lines 710-850)

### Before:
```jsx
<thead className="bg-slate-100 text-slate-500 uppercase tracking-wide">
  <tr>
    <th className="px-4 py-3 font-bold">Time</th>
    <th className="px-4 py-3 font-bold">Kind</th>
    <th className="px-4 py-3 font-bold">Query</th>
    <th className="px-4 py-3 font-bold">Order</th>
    <th className="px-4 py-3 font-bold text-right">Naive</th>
    <th className="px-4 py-3 font-bold text-right">Reduced</th>
    <th className="px-4 py-3 font-bold text-right">Speedup</th>
    <th className="px-4 py-3 font-bold text-right">Worst case</th>
    <th className="px-4 py-3 font-bold text-right">Transfer</th>
    <th className="px-4 py-3 font-bold text-right">Mat</th>
    <th className="px-4 py-3 font-bold text-right">Overhead</th>
    <th className="px-4 py-3 font-bold text-center">Equal</th>
  </tr>
</thead>
```

### After:
```jsx
<div
  tabIndex={0}
  role="region"
  aria-label="mongo-pt Execution Log Table"
  className="overflow-x-auto rounded-3xl border border-slate-200 shadow-sm focus:outline-indigo-500"
>
  <table className="w-full text-left text-xs border-collapse">
    <thead className="bg-slate-100 text-slate-600 uppercase tracking-wide sticky top-0 z-10 border-b border-slate-200">
      <tr>
        <th scope="col" className="px-4 py-3 font-extrabold">Time</th>
        <th scope="col" className="px-3 py-3 font-extrabold">Kind</th>
        <th scope="col" className="px-4 py-3 font-extrabold min-w-[280px]">Query &amp; Trigger</th>
        <th scope="col" className="px-3 py-3 font-extrabold">Join Order</th>
        <th scope="col" className="px-4 py-3 font-extrabold text-right" title="Standard MongoDB left-deep $lookup latency and throughput">
          Standard MongoDB
        </th>
        <th scope="col" className="px-4 py-3 font-extrabold text-right" title="Optimized (mongo-pt) semi-join reduction latency and throughput">
          Optimized (mongo-pt)
        </th>
        <th scope="col" className="px-3 py-3 font-extrabold text-center" title="Acceleration factor (Standard latency ÷ Optimized latency)">
          Speedup
        </th>
        <th scope="col" className="px-4 py-3 font-extrabold text-right" title="Semi-join transfer ($in) + temporary collection materialization">
          Transfer &amp; Mat
        </th>
        <th scope="col" className="px-3 py-3 font-extrabold text-center" title="Polynomial rolling checksum and result equality check">
          Verification
        </th>
        <th scope="col" className="px-3 py-3 font-extrabold text-right" title="Reference worst-case speedup without search filter">
          Catalog Baseline
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100">
      ...
      <tr className="hover:bg-slate-50/80 cursor-pointer transition-colors" onClick={toggle}>
        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
          {fmtTime(r.ts)} {isOpen ? '▾' : '▸'}
        </td>
        <td className="px-3 py-3">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            r.kind === 'shadow' ? 'bg-indigo-100 text-indigo-700'
              : r.kind === 'summary' ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-100 text-slate-600'
          }`}>
            {r.kind || '—'}
          </span>
        </td>
        {/* Decoupled Query Computation & Trigger Context */}
        <td className="px-4 py-3">
          {(() => {
            const info = getCanonicalQueryInfo(r);
            const trigger = getTriggerContext(r);
            return (
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
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                      term: &quot;{r.search_term}&quot;
                    </span>
                  )}
                  {filterChips(r.filters).map((label, k) => (
                    <span key={k} className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-semibold">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </td>
        <td className="px-3 py-3 font-mono text-[11px] text-slate-500 max-w-[180px] truncate" title={prettyOrder(r.order)}>
          {r.order || '—'}
        </td>
        <td className="px-4 py-3">
          <LatencyThroughputCell ms={r.standard_ms ?? r.naive_ms} engine="standard" fmtMs={fmtMs} fmtThroughput={fmtThroughput} />
        </td>
        <td className="px-4 py-3">
          <LatencyThroughputCell ms={r.optimized_ms ?? r.reduced_ms ?? r.total_ms} engine="optimized" fmtMs={fmtMs} fmtThroughput={fmtThroughput} />
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
        <td className="px-3 py-3 text-right font-bold">
          {r.worst_case && r.worst_case.speedup != null ? (
            <span className={r.worst_case.speedup >= 1 ? 'text-indigo-600' : 'text-rose-600'}>
              {r.worst_case.speedup}×
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
      </tr>
      ...
    </tbody>
  </table>
</div>
```

---

## 6. Expanded Row Drawer Structure (3-Column Diagnostic Layout)

In the expanded accordion `<tr className="bg-slate-50/70">`:
```jsx
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
            {getCanonicalQueryInfo(r).computation}
          </p>
          <p>
            <span className="font-extrabold text-slate-800">Application Trigger:</span>{' '}
            {getTriggerContext(r).action}{' '}
            <code className="font-mono text-[10px] text-slate-500 block truncate mt-0.5">{r.trigger || 'CLI / benchmark'}</code>
          </p>
          {r.search_term && (
            <p>
              <span className="font-extrabold text-amber-700">Live Search Spliced:</span>{' '}
              Filter <code className="font-mono text-amber-800">&quot;{r.search_term}&quot;</code> pushed into products relation on BOTH sides.
            </p>
          )}
          <p>
            <span className="font-extrabold text-slate-800">Join Order:</span>{' '}
            <span className="font-mono text-[11px] text-indigo-700">{prettyOrder(r.order)}</span>
          </p>
        </div>

        {/* Column 2: Comparative Performance Metrics */}
        <div className="space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-slate-900 border-b pb-2">
            <Zap size={15} className="text-amber-600" />
            <span>Comparative Performance</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center py-1">
            <div className="bg-rose-50 border border-rose-200 p-2 rounded-xl">
              <div className="text-[10px] font-bold text-rose-700 uppercase">Standard MongoDB</div>
              <div className="text-base font-extrabold text-rose-800">{fmtMs(r.standard_ms ?? r.naive_ms)}</div>
              <div className="text-[10px] font-mono text-rose-600">{fmtThroughput(1000 / (r.standard_ms ?? r.naive_ms))}</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl">
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Optimized (mongo-pt)</div>
              <div className="text-base font-extrabold text-emerald-800">{fmtMs(r.optimized_ms ?? r.reduced_ms ?? r.total_ms)}</div>
              <div className="text-[10px] font-mono text-emerald-600">{fmtThroughput(1000 / (r.optimized_ms ?? r.reduced_ms ?? r.total_ms))}</div>
            </div>
          </div>
          <p>
            <span className="font-extrabold text-slate-800">Transfer Time ($in keys):</span> {fmtMs(r.transfer_ms)}
          </p>
          <p>
            <span className="font-extrabold text-slate-800">Materialization Time:</span> {fmtMs(r.materialization_ms)}
          </p>
          <p>
            <span className="font-extrabold text-slate-800">Total Overhead:</span> {pct(r.transfer_overhead_pct)} of optimized time
          </p>
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
              <span className="font-bold text-slate-800">Catalog Query Reference (Unfiltered):</span>
              <div className="text-[11px] text-slate-600 mt-0.5">
                Standard {fmtMs(r.worst_case.standard_ms ?? r.worst_case.naive_ms)} vs Optimized {fmtMs(r.worst_case.optimized_ms ?? r.worst_case.reduced_ms)} →{' '}
                <span className="font-extrabold text-indigo-700">{r.worst_case.speedup}× Speedup</span>
              </div>
            </div>
          )}
        </div>

      </div>
    </td>
  </tr>
)}
```
