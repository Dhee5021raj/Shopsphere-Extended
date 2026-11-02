'use strict';
/**
 * Step 7 — shadow logging middleware (off by default).
 *
 * When PT_SHADOW=1, a request that finishes schedules a matching mongo-pt
 * measurement in a DETACHED child process. The response is already sent
 * (`res.on('finish')`), the child has its own bench connection, and any
 * failure is swallowed — the request is never delayed or broken.
 *
 * The endpoint -> spec mapping is a small static table (see SPEC_BY_ROUTE);
 * `null` means no matching spec in the current query set.
 *
 * The product-catalog route is gated by `requireQuery` so ordinary homepage /
 * pagination loads never fire a benchmark — only a real search or category
 * browse does. Its `order` pins the naive join order to one where the join is
 * expensive, which is what makes the predicate-transfer win visible live.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Vendor = require('../models/Vendor');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'ptShadow.js');
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOCK_FILE = path.join(LOG_DIR, '.pt-shadow.lock');
const LOCK_STALE_MS = 15 * 60 * 1000; // a crashed run must not block forever

// Longest-prefix match; keep in sync with the routes it is mounted on.
const SPEC_BY_ROUTE = [
  { route: '/api/analytics/vendor', spec: 'vendor_scoped_revenue_90d' },
  { route: '/api/analytics/admin', spec: 'user_vendor_category_spend_30d' },
  {
    route: '/api/products',
    spec: 'rare_category_revenue_7d',
    order: 'p>cat>oi>v>o',
    requireQuery: ['search', 'category']
  }
];

function matchShadow(rawUrl) {
  const [pathname, qs] = String(rawUrl || '').split('?');
  const params = new URLSearchParams(qs || '');
  let best = null;
  for (const r of SPEC_BY_ROUTE) {
    if (!pathname.startsWith(r.route)) continue;
    if (best && r.route.length <= best.route.length) continue;
    if (r.requireQuery && !r.requireQuery.some((k) => params.get(k))) continue;
    best = r;
  }
  // A real search term and the applied filters are passed through so
  // scripts/ptShadow.js can splice them into the benchmark spec (live-search
  // variant) — category browses keep the fixed catalog spec.
  return best ? {
    spec: best.spec,
    order: best.order || null,
    search: params.get('search') || null,
    minRating: params.get('minRating') || null,
    minPrice: params.get('minPrice') || null,
    maxPrice: params.get('maxPrice') || null,
    inStock: params.get('inStock') || null,
    featured: params.get('featured') || null,
    vendor: params.get('vendor') || null
  } : null;
}

function shadowBusy() {
  try {
    return Date.now() - fs.statSync(LOCK_FILE).mtimeMs < LOCK_STALE_MS;
  } catch (_) {
    return false;
  }
}

async function scheduleShadow(match, trigger) {
  if (process.env.PT_SHADOW !== '1' || !match) return null;
  // Single-flight: never let repeated searches pile up heavy benchmarks.
  if (shadowBusy()) return null;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOCK_FILE, String(Date.now())); // claim synchronously (no race)
  } catch (_) {
    return null;
  }
  // Map the demo vendor id the client filters by to a store NAME — the bench
  // DB shares no supplier ids with the demo DB, so the child script can only
  // emulate the vendor scope from a name (it hashes it to a bench `Vendor N`).
  let vendorName = null;
  if (match.vendor) {
    try {
      const v = await Vendor.findById(match.vendor).select('storeName').lean();
      vendorName = v ? (v.storeName || v.name || null) : null;
    } catch (_) { vendorName = null; }
  }
  const args = [SCRIPT, `--spec=${match.spec}`, `--trigger=${trigger}`];
  if (match.order) args.push(`--order=${match.order}`);
  if (match.search) args.push(`--search=${match.search}`);
  if (match.minRating) args.push(`--minRating=${match.minRating}`);
  if (match.minPrice) args.push(`--minPrice=${match.minPrice}`);
  if (match.maxPrice) args.push(`--maxPrice=${match.maxPrice}`);
  if (match.inStock) args.push(`--inStock=${match.inStock}`);
  if (match.featured) args.push(`--featured=${match.featured}`);
  if (vendorName) args.push(`--vendorName=${vendorName}`);
  let child;
  try {
    child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      env: process.env
    });
    // Record the child's pid in the lock so GET /api/admin/pt-status can
    // verify its liveness: a child killed before its own cleanup previously
    // left the fresh lock reporting "running" — and the UI's elapsed timer
    // ticking — until LOCK_STALE_MS (15 min) expired.
    try { fs.writeFileSync(LOCK_FILE, JSON.stringify({ t: Date.now(), pid: child.pid })); } catch (_) { /* claim already holds */ }
  } catch (e) {
    // Failed to even start the child -> release the single-flight lock NOW or
    // every future trigger is skipped for up to LOCK_STALE_MS.
    try { fs.unlinkSync(LOCK_FILE); } catch (_) { /* already gone */ }
    return null;
  }
  child.unref();
  return child.pid;
}

function ptShadow(req, res, next) {
  if (process.env.PT_SHADOW !== '1') return next();
  res.on('finish', () => {
    try {
      const match = matchShadow(req.originalUrl || req.url);
      if (match) {
        // Keep the full URL (incl. query) so the log shows WHAT the user did —
        // e.g. `/api/products?search=laptop` — not just that something fired.
        Promise.resolve(scheduleShadow(match, (req.originalUrl || req.url)))
          .catch((e) => console.error('[pt-shadow] schedule failed:', e.message));
      }
    } catch (e) {
      console.error('[pt-shadow] schedule failed:', e.message);
    }
  });
  return next();
}

module.exports = ptShadow;
module.exports.matchShadow = matchShadow;
module.exports.scheduleShadow = scheduleShadow;
module.exports.SPEC_BY_ROUTE = SPEC_BY_ROUTE;
