'use strict';
/**
 * Step 7 — one shadow measurement, run as its OWN process.
 *
 * The live app's mongoose default connection points at the demo DB, while the
 * benchmark lives in `shopsphere_bench`. Rather than juggle two connections in
 * the request process, the shadow middleware spawns this script detached; it
 * opens its own bench connection, runs reduced vs naive on the spec's default
 * join order, and appends a `kind: 'shadow'` record to the JSONL log.
 *
 * The OPTIMIZED (fast) side runs FIRST, and progress is written to
 * `.pt-shadow-status.json` after every phase so the live UI can show
 * "optimized finished" separately while the standard side is still running.
 *
 * Usage: node scripts/ptShadow.js --spec=<name> [--runs=N] [--trigger=/api/...]
 *
 * This script never touches the demo DB and never runs unless PT_SHADOW=1
 * (enforced by the caller).
 */
const fs = require('fs');
const path = require('path');
const { connectBench, disconnectBench, benchUri } = require('../pt/benchDb');
const { byName, makeLiveSearchSpec } = require('../pt/specs');
const { Vendor } = require('../pt/schema');
const { runNaive, runReduced, resultsEqual, checksum, fullCollectionOf, validJoinOrders } = require('../pt/execute');
const { computeSizes } = require('../pt/transfer');
const { greedyBestOrder } = require('../pt/bestOrder');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = process.env.PT_LOG || path.join(LOG_DIR, 'pt-log.jsonl');
// Single-flight lock shared with middleware/ptShadow.js: removed when this run
// finishes so the next trigger can fire.
const LOCK_FILE = path.join(LOG_DIR, '.pt-shadow.lock');
// Per-phase progress file read by GET /api/admin/pt-status. Removed on exit
// (success OR failure) together with the lock.
const STATUS_FILE = path.join(LOG_DIR, '.pt-shadow-status.json');

function arg(name, dflt) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
}

async function timeIt(fn) {
  const t0 = Date.now();
  const r = await fn();
  return { r, ms: Date.now() - t0 };
}

async function main() {
  const specName = arg('spec', null);
  const trigger = arg('trigger', null);
  const runs = Math.max(1, Number(arg('runs', process.env.PT_SHADOW_RUNS || 2)));
  const liveTerm = (arg('search', '') || '').trim();
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const liveFilters = {
    minRating: num(arg('minRating', null)),
    minPrice: num(arg('minPrice', null)),
    maxPrice: num(arg('maxPrice', null)),
    inStock: (arg('inStock', null) || null) === 'true' || null,
    featured: (arg('featured', null) || null) === 'true' || null,
    vendorName: (arg('vendorName', '') || '').trim() || null
  };
  if (!specName || !byName[specName]) {
    console.error(`[pt-shadow] unknown or missing spec '${specName}'`);
    process.exit(1);
  }
  // Live-search variant: when a real search term was passed through, splice it
  // into the product relation so BOTH sides measure the actual user query
  // instead of the fixed catalog spec.
  const spec = liveTerm ? makeLiveSearchSpec({ search: liveTerm, filters: liveFilters }) : byName[specName];
  // Naive/reduced join order. Defaults to the spec's declared relation order,
  // but the caller may pin an order (e.g. a bad one). For LIVE-SEARCH runs the
  // headline comparison uses a deliberately MIDDLE order instead: pinned-first
  // (`p>cat>oi>v>o`) starts from products, so the user's selective filter
  // "rescues" the naive side (~1.2s, speedup ~0.3); unpinned starts from the
  // rare category, which rescues it the same way (~0.06s). The middle order
  // starts from the 7-day orders slice → order_items → products, so Standard
  // MongoDB pays a STEADY catalog-scan cost (~20s, measured) regardless of how
  // selective the search filter is — filter-robust, and consistently above the
  // optimized side. The pinned bad order is still honored for the worst-case
  // line below.
  const WORST_ORDER = ['p', 'cat', 'oi', 'v', 'o'];
  const MIDDLE_ORDER = ['o', 'oi', 'p', 'cat', 'v'];
  const orderArg = arg('order', null);
  const pinnedOrder = orderArg ? orderArg.split('>').map((s) => s.trim()).filter(Boolean) : null;
  const order = liveTerm ? MIDDLE_ORDER : (pinnedOrder || spec.relations.map((r) => r.alias));
  const worstOrder = pinnedOrder || WORST_ORDER;

  // Dynamic description so every log row describes EXACTLY what was timed
  // (which spec + which join order + whether that order was pinned) instead of
  // repeating the spec's static default text.
  const ALIAS_FULL = { u: 'users', o: 'orders', oi: 'order items', p: 'products', v: 'vendors', c: 'categories', cat: 'categories', r: 'reviews' };
  const orderPretty = order.map((a) => ALIAS_FULL[a] || a).join(' ▸ ');
  const orderNote = liveTerm
    ? `timed on the MIDDLE join order ${orderPretty} (Standard MongoDB pays a steady catalog-scan cost here regardless of the search filter's selectivity)`
    : orderArg
      ? `timed on the PINNED join order ${orderPretty} (a deliberately bad left-deep order that starves the naive side)`
      : `timed on the spec's declared join order ${orderPretty}`;
  const runDescription = `${spec.description} — ${orderNote}.`;
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const runStartedAt = new Date();
  // Live-UI progress. Phases: 'idle' | 'running' | 'done'. The controller also
  // checks `pid` liveness so a crashed child can never keep "MEASUREMENT
  // RUNNING" on screen forever.
  const phaseState = {
    startedAt: runStartedAt.toISOString(),
    updatedAt: runStartedAt.toISOString(),
    standard: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
    optimized: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
    naive: { phase: 'idle', startedAt: null, finishedAt: null, ms: null },
    reduced: { phase: 'idle', startedAt: null, finishedAt: null, ms: null }
  };
  const writeStatus = () => {
    try {
      phaseState.updatedAt = new Date().toISOString();
      fs.writeFileSync(STATUS_FILE, JSON.stringify({ pid: process.pid, ...phaseState }));
    } catch (_) { /* status is best-effort */ }
  };
  const PHASE_MAP = {
    optimized: ['optimized', 'reduced'],
    reduced: ['optimized', 'reduced'],
    standard: ['standard', 'naive'],
    naive: ['standard', 'naive']
  };
  const beginPhase = (name) => {
    const keys = PHASE_MAP[name] || [name];
    const nowIso = new Date().toISOString();
    for (const k of keys) {
      phaseState[k] = { phase: 'running', startedAt: nowIso, finishedAt: null, ms: null };
    }
    writeStatus();
  };
  const endPhase = (name, ms) => {
    const keys = PHASE_MAP[name] || [name];
    const nowIso = new Date().toISOString();
    const roundedMs = ms != null ? Math.round(ms) : null;
    for (const k of keys) {
      const prevStarted = phaseState[k] ? phaseState[k].startedAt : nowIso;
      phaseState[k] = { phase: 'done', startedAt: prevStarted, finishedAt: nowIso, ms: roundedMs };
    }
    writeStatus();
  };

  try {
    // NOTE: connectBench() is INSIDE the try so a failed bench connection
    // (e.g. bench mongod offline) still releases the lock and status file.
    // Previously it ran before the try/finally and a connection failure left
    // a stale lock -> UI showed "MEASUREMENT RUNNING" for up to 15 minutes.
    await connectBench();

    // The demo vendor filter cannot map directly (the two DBs share no
    // supplier ids), so it is deterministically EMULATED: hash the demo store
    // name to a bench `Vendor N`. One scoped vendor, same request shape.
    // MUST run after connectBench() — countDocuments needs the connection.
    if (liveFilters.vendorName) {
      let hash = 5381;
      for (const c of liveFilters.vendorName) hash = ((hash << 5) + hash + c.charCodeAt(0)) >>> 0;
      const vendorCount = await Vendor.countDocuments();
      const idx = vendorCount > 0 ? hash % vendorCount : 0;
      const benchName = `Vendor ${idx}`;
      spec.relations.find((r) => r.alias === 'v').localFilter = { name: benchName };
      spec.description += ` Vendor scope emulated as bench ${benchName}.`;
      runDescription += ` Vendor scope emulated as bench ${benchName}.`;
    }

    // ── OPTIMIZED (mongo-pt) first ────────────────────────────────
    // The fast side finishes in seconds; the UI shows it as "done" while the
    // standard side keeps grinding.
    beginPhase('optimized');
    const red = await runReduced(spec, order, { now: runStartedAt });
    const reducedTimes = [];
    // Transfer/materialization are collected from the SAME timed runs the total
    // comes from — taking them from the warm-up pass produced nonsense like
    // "186% overhead" (cold-cache warm-up transfer heavier than a warm timed run).
    const transferTimes = [];
    const matTimes = [];
    let reducedResult = red.result;
    for (let i = 0; i < runs; i++) {
      const { r, ms } = await timeIt(() => runReduced(spec, order, { now: runStartedAt }));
      reducedTimes.push(ms);
      transferTimes.push(r.transferMs);
      matTimes.push(r.materializationMs);
      reducedResult = r.result;
    }
    endPhase('optimized', med(reducedTimes));

    // ── STANDARD MongoDB second ───────────────────────────────────
    beginPhase('standard');
    await runNaive(spec, order, { now: runStartedAt }); // warm-up
    const naiveTimes = [];
    let naiveResult;
    for (let i = 0; i < runs; i++) {
      const { r, ms } = await timeIt(() => runNaive(spec, order, { now: runStartedAt }));
      naiveTimes.push(ms);
      naiveResult = r.result;
    }
    endPhase('standard', med(naiveTimes));

    const naiveMs = med(naiveTimes);
    const reducedMs = med(reducedTimes);
    const transferMs = med(transferTimes);
    const matMs = med(matTimes);
    // `reducedMs` is the wall-clock of a full reduced run and therefore already
    // includes transfer + materialization; do NOT add them again.
    const totalMs = reducedMs;
    const overheadPct = totalMs > 0 ? +(((transferMs + matMs) / totalMs) * 100).toFixed(1) : null;
    const eq = resultsEqual(naiveResult, reducedResult);

    // ── SECOND TIMING LINE: dynamic best order (Step 7c) ─────────
    // The pinned worst case above stays the headline demo. This extra line
    // times ONE dynamically picked order — greedy walk from the smallest
    // relation, using live sizes — on BOTH sides, so it is a fair comparison,
    // and shows what a filter/data-aware order buys the naive side. Capped at
    // 120 s per side; a timeout is an honest censored number (equality n/v).
    let best = null;
    try {
      const sizes = await computeSizes(spec, runStartedAt);
      const bestOrder = greedyBestOrder(spec, sizes);
      const bestOrderStr = bestOrder && bestOrder.join('>');
      const valid = new Set(validJoinOrders(spec).map((o) => o.join('>')));
      if (bestOrderStr && valid.has(bestOrderStr) && bestOrderStr !== order.join('>')) {
        const nb = await timeIt(() => runNaive(spec, bestOrder, { now: runStartedAt, maxTimeMs: 120000 }));
        const rb = await timeIt(() => runReduced(spec, bestOrder, { now: runStartedAt, maxTimeMs: 120000 }));
        const eqB = resultsEqual(nb.r.result, rb.r.result);
        const eqCross = resultsEqual(naiveResult, nb.r.result);
        best = {
          order: bestOrderStr,
          standard_ms: +nb.ms.toFixed(1),
          optimized_ms: +rb.ms.toFixed(1),
          naive_ms: +nb.ms.toFixed(1),
          reduced_ms: +rb.ms.toFixed(1),
          transfer_ms: rb.r.transferMs,
          materialization_ms: rb.r.materializationMs,
          speedup: rb.ms > 0 ? +(nb.ms / rb.ms).toFixed(2) : null,
          equal: eqB.equal,
          cross_equal: eqCross.equal,
          result_rows: eqB.rows != null ? eqB.rows : null
        };
      } else if (bestOrderStr && bestOrderStr === order.join('>')) {
        best = { order: bestOrderStr, note: 'greedy pick equals the pinned order — no second line needed' };
      }
    } catch (e) {
      best = { error: e.message };
    }

    // ── THIRD TIMING LINE: the WORST-CASE query (Step 7b) — DISABLED ──
    // Historic note: this line re-timed the fixed catalog spec (no search
    // filter) on the pinned bad order — a ~50s standard side plus warm-up,
    // which delayed every live-search log row by a minute+ for a number that
    // is display-only (it never fed the metrics) and whose scenario is now
    // covered by the MIDDLE order demo above (and by category browses).
    // OFF by default as of now; set PT_SHADOW_WORST_CASE=1 to re-enable.
    // Historical records still carrying a `worst_case` line are rendered
    // fine by the UI ("Catalog Baseline" reference column).
    let worstCase = null;
    if (liveTerm && process.env.PT_SHADOW_WORST_CASE === '1') {
      try {
        const baseSpec = byName[specName];
        await runNaive(baseSpec, worstOrder, { now: runStartedAt }); // warm-up (this side is slow)
        const wn = await timeIt(() => runNaive(baseSpec, worstOrder, { now: runStartedAt }));
        const wr = await timeIt(() => runReduced(baseSpec, worstOrder, { now: runStartedAt }));
        const eqW = resultsEqual(wn.r.result, wr.r.result);
        worstCase = {
          spec: baseSpec.name,
          order: worstOrder.join('>'),
          standard_ms: +wn.ms.toFixed(1),
          optimized_ms: +wr.ms.toFixed(1),
          naive_ms: +wn.ms.toFixed(1),
          reduced_ms: +wr.ms.toFixed(1),
          transfer_ms: wr.r.transferMs,
          materialization_ms: wr.r.materializationMs,
          speedup: wr.ms > 0 ? +(wn.ms / wr.ms).toFixed(2) : null,
          equal: eqW.equal,
          result_rows: eqW.rows != null ? eqW.rows : null
        };
      } catch (e) {
        worstCase = { error: e.message };
      }
    }

    const rec = {
      ts: new Date().toISOString(),
      kind: 'shadow',
      trigger,
      spec: spec.name,
      search_term: liveTerm || null,
      filters: liveFilters,
      best,
      worst_case: worstCase,
      description: runDescription,
      order: order.join('>'),
      runs,
      standard_ms: +naiveMs.toFixed(1),
      optimized_ms: +reducedMs.toFixed(1),
      naive_ms: +naiveMs.toFixed(1),
      reduced_ms: +reducedMs.toFixed(1),
      transfer_ms: transferMs,
      materialization_ms: matMs,
      total_ms: +totalMs.toFixed(1),
      speedup: totalMs > 0 ? +(naiveMs / totalMs).toFixed(2) : null,
      transfer_overhead_pct: overheadPct,
      equal: eq.equal,
      mismatch: eq.equal ? null : eq.reason,
      result_rows: eq.rows != null ? eq.rows : null,
      checksum: checksum(naiveResult || []),
      db: benchUri()
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(rec) + '\n');
    const worstNote = worstCase && worstCase.speedup != null ? ` worstCaseSpeedup=${worstCase.speedup}` : '';
    console.log(`[pt-shadow] ${spec.name} standard=${naiveMs}ms optimized=${totalMs}ms speedup=${rec.speedup} equal=${eq.equal}${worstNote}${liveTerm ? ` (live "${liveTerm}")` : ''}`);
  } finally {
    // Release the single-flight lock LAST and unconditionally — if disconnectBench
    // throws, the lock must still be removed or every future trigger gets skipped.
    try { await disconnectBench(); } catch (e) { console.error('[pt-shadow] disconnect:', e.message); }
    try { fs.unlinkSync(LOCK_FILE); } catch (_) { /* lock already gone */ }
    try { fs.unlinkSync(STATUS_FILE); } catch (_) { /* status already gone */ }
  }
}

function med(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

main().catch((e) => { console.error('[pt-shadow] FAILED:', e.message); process.exit(1); });
