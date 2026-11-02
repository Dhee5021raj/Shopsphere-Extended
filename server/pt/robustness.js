'use strict';
/**
 * Step 4 — join-order robustness experiment.
 *
 * Modes: naive | exact-reduced | adaptive-reduced | bloom-reduced (optional).
 * `adaptive` skips a transfer edge when keysIn/targetRows > edgeRatio, and
 * skips materialisation when the reduced relation > matRatio of the original
 * (falling back to the key-set $in filter over the original collection).
 *
 * Timed-out runs are CENSORED: recorded as DNF with a lower bound (the timeout
 * value) and never dropped. The robustness gap is reported as ">= X" whenever a
 * DNF is involved.
 *
 * Every measurement goes to server/logs/pt-log.jsonl (one JSON object/line).
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectBench, disconnectBench, benchUri } = require('../pt/benchDb');
const { specs, byName } = require('../pt/specs');
const { validJoinOrders, runNaive, prepareReduced, joinReduced, cleanupReduced, resultsEqual, checksum } = require('../pt/execute');
const { computeSizes } = require('../pt/transfer');
const { collectEnvInfo } = require('../pt/envInfo');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = process.env.PT_LOG || path.join(LOG_DIR, 'pt-log.jsonl');

function parseArgs(argv) {
  const o = {
    specs: null, maxOrders: 24, runs: 5, caps: [10000, 50000, 200000],
    timeoutMs: 60000, bloom: process.env.PT_BLOOM === '1', seed: 12345,
    scaleLabel: process.env.PT_SCALE || 'custom', append: false, bestworstMax: 12,
    specBudgetMs: 600000, label: process.env.PT_LABEL || 'full',
    edgeRatio: 0.3, matRatio: 0.5, includeOrders: null
  };
  for (const a of argv.slice(2)) {
    if (a === '--bloom') o.bloom = true;
    else if (a === '--append') o.append = true;
    else { const m = /^--([A-Za-z]+)=(.+)$/.exec(a); if (!m) continue;
      const [, k, v] = m;
      if (k === 'specs') o.specs = v.split(',');
      else if (k === 'includeOrders') o.includeOrders = v.split(';').map((s) => s.split('>'));
      else if (k === 'caps') o.caps = v.split(',').map(Number);
      else if (k in o) o[k] = Number.isNaN(Number(v)) ? v : Number(v);
    }
  }
  return o;
}

function median(a) { const s = a.slice().sort((x, y) => x - y); const n = s.length; if (!n) return null; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
function seededSample(arr, n, seed) {
  if (arr.length <= n) return arr.slice();
  const a = arr.slice(); let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/** 1 warm-up + `runs` timed runs; a timeout censors the run (DNF, lower bound). */
async function measure(fn, runs, timeoutMs) {
  const times = [];
  let result = null, dnf = false;
  for (let i = 0; i <= runs; i++) {
    const t0 = Date.now();
    try {
      const r = await fn();
      if (i === 0) result = r && r.result !== undefined ? r.result : r;
      else times.push(r && r.ms != null ? r.ms : Date.now() - t0);
    } catch (e) {
      if (/time limit|MaxTimeMS/i.test(e.message)) { dnf = true; break; }
      throw e;
    }
  }
  return {
    result, times, dnf, lowerBound: dnf ? timeoutMs : null,
    median: times.length ? median(times) : null,
    min: times.length ? Math.min(...times) : null,
    max: times.length ? Math.max(...times) : null
  };
}

function stats(rows, timeoutMs) {
  const dnfCount = rows.filter((r) => r.dnf).length;
  const vals = rows.map((r) => (r.dnf ? r.lowerBound : r.median)).filter((x) => x != null && x > 0);
  if (!vals.length) return { min: null, median: null, max: null, ratio: null, censored: dnfCount > 0, dnf: dnfCount, values: vals };
  const mn = Math.min(...vals), mx = Math.max(...vals);
  return { min: mn, median: median(vals), max: mx, ratio: mn > 0 ? +(mx / mn).toFixed(2) : null, censored: dnfCount > 0, dnf: dnfCount, values: vals };
}

async function main() {
  const o = parseArgs(process.argv);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!o.append) fs.writeFileSync(LOG_FILE, '');
  const write = (rec) => fs.appendFileSync(LOG_FILE, JSON.stringify(rec) + '\n');

  await connectBench();
  const stale = await mongoose.connection.db.listCollections({ name: /^tmp_pt_/ }).toArray();
  for (const c of stale) await mongoose.connection.db.collection(c.name).drop().catch(() => {});
  if (stale.length) console.log(`[cleanup] dropped ${stale.length} stale temp collections`);

  const env = await collectEnvInfo({
    uri: benchUri(), bloom_enabled: o.bloom, scale: o.scaleLabel, label: o.label,
    caps: o.caps, runs: o.runs, max_orders: o.maxOrders, timeout_ms: o.timeoutMs,
    spec_budget_ms: o.specBudgetMs, edge_ratio: o.edgeRatio, mat_ratio: o.matRatio, modes: ['naive', 'exact', ...(o.bloom ? ['bloom'] : []), 'adaptive']
  });
  console.log('[env]', JSON.stringify(env));
  write({ ts: new Date().toISOString(), kind: 'env', ...env });

  const selected = o.specs ? o.specs.map((n) => byName[n]) : specs;

  for (const spec of selected) {
    const now = new Date();
    const sizes = await computeSizes(spec, now);
    const allOrders = validJoinOrders(spec);
    let orders = seededSample(allOrders, o.maxOrders, o.seed);
    let bestworstUsed = false;
    const remaining = allOrders.filter((ord) => !orders.some((x) => x.join() === ord.join()));
    if (remaining.length > 0 && remaining.length <= o.bestworstMax) {
      let best = null, worst = null;
      for (const ord of remaining) {
        try {
          const r = await runNaive(spec, ord, { now, maxTimeMs: Math.min(o.timeoutMs, 60000) });
          if (!best || r.joinMs < best.ms) best = { ord, ms: r.joinMs };
          if (!worst || r.joinMs > worst.ms) worst = { ord, ms: r.joinMs };
        } catch (_) { if (!worst) worst = { ord, ms: Infinity }; }
      }
      if (best) orders.push(best.ord);
      if (worst && (!best || worst.ord.join() !== best.ord.join())) orders.push(worst.ord);
      bestworstUsed = true;
    }
    // explicitly included orders (e.g. the measured worst/best), if their aliases fit this spec
    if (o.includeOrders) {
      const valid = new Set(allOrders.map((x) => x.join()));
      for (const ord of o.includeOrders) {
        if (valid.has(ord.join()) && !orders.some((x) => x.join() === ord.join())) orders.push(ord);
      }
    }

    console.log(`\n### SPEC ${spec.name}  (${allOrders.length} valid orders, testing ${orders.length}; best/worst=${bestworstUsed})`);
    write({ ts: new Date().toISOString(), kind: 'spec', spec: spec.name, sizes, valid_orders: allOrders.length, tested_orders: orders.length, bestworst: bestworstUsed, scale: o.scaleLabel, label: o.label });

    const exactPreps = new Map();
    for (const cap of o.caps) {
      const prep = await prepareReduced(spec, { setKind: 'exact', cap, now, sizes });
      exactPreps.set(cap, prep);
      console.log(`  [exact cap=${cap}] transfer=${prep.transferMs}ms mat=${prep.materializationMs}ms skipped=[${prep.skippedList.join(', ')}]`);
      write({ ts: new Date().toISOString(), kind: 'cap', spec: spec.name, mode: 'exact', cap, scale: o.scaleLabel, label: o.label, transfer_ms: prep.transferMs, materialization_ms: prep.materializationMs, skipped: prep.skippedList });
    }

    const defaultCap = o.caps[Math.min(1, o.caps.length - 1)];
    let adaptivePrep = null;
    try {
      adaptivePrep = await prepareReduced(spec, { setKind: 'exact', cap: defaultCap, now, sizes, adaptive: true, adaptiveEdgeRatio: o.edgeRatio, adaptiveMatRatio: o.matRatio });
      console.log(`  [adaptive cap=${defaultCap}] transfer=${adaptivePrep.transferMs}ms mat=${adaptivePrep.materializationMs}ms edge-skips=[${adaptivePrep.skippedList.join(', ')}] decisions=${adaptivePrep.decisions.length}`);
      write({ ts: new Date().toISOString(), kind: 'cap', spec: spec.name, mode: 'adaptive', cap: defaultCap, scale: o.scaleLabel, label: o.label, transfer_ms: adaptivePrep.transferMs, materialization_ms: adaptivePrep.materializationMs, skipped: adaptivePrep.skippedList, decisions: adaptivePrep.decisions });
    } catch (e) {
      console.log(`  [adaptive] FAILED: ${e.message}`);
      write({ ts: new Date().toISOString(), kind: 'cap', spec: spec.name, mode: 'adaptive', cap: defaultCap, scale: o.scaleLabel, label: o.label, error: e.message });
    }

    const bloomPreps = new Map();
    if (o.bloom) {
      for (const cap of o.caps) {
        try {
          const prep = await prepareReduced(spec, { setKind: 'bloom', cap, now, sizes });
          bloomPreps.set(cap, prep);
          console.log(`  [bloom cap=${cap}] transfer=${prep.transferMs}ms mat=${prep.materializationMs}ms skipped=[${prep.skippedList.join(', ')}]`);
          write({ ts: new Date().toISOString(), kind: 'cap', spec: spec.name, mode: 'bloom', cap, scale: o.scaleLabel, label: o.label, transfer_ms: prep.transferMs, materialization_ms: prep.materializationMs, skipped: prep.skippedList });
        } catch (e) {
          write({ ts: new Date().toISOString(), kind: 'cap', spec: spec.name, mode: 'bloom', cap, scale: o.scaleLabel, label: o.label, error: e.message });
        }
      }
    }

    const results = { naive: [], exact: [], adaptive: [], bloom: [] };
    const specStart = Date.now();
    for (let oi = 0; oi < orders.length; oi++) {
      if (Date.now() - specStart > o.specBudgetMs) {
        console.log(`  (spec budget ${o.specBudgetMs}ms exceeded; ${orders.length - oi} orders skipped)`);
        write({ ts: new Date().toISOString(), kind: 'skipped', spec: spec.name, scale: o.scaleLabel, label: o.label, remaining: orders.length - oi, reason: 'spec budget' });
        break;
      }
      const order = orders[oi];
      const naiveFn = () => runNaive(spec, order, { now, maxTimeMs: o.timeoutMs }).then((r) => ({ result: r.result, ms: r.joinMs }));
      const exactFn = () => joinReduced(spec, order, exactPreps.get(o.caps[0]), now).then((r) => ({ result: r.result, ms: r.joinMs }));
      const adaptiveFn = adaptivePrep ? () => joinReduced(spec, order, adaptivePrep, now).then((r) => ({ result: r.result, ms: r.joinMs })) : null;

      // alternate which mode runs first
      const first = oi % 2 === 0;
      let n, ex, ad;
      if (first) {
        n = await measure(naiveFn, o.runs, o.timeoutMs);
        ex = await measure(exactFn, o.runs, o.timeoutMs);
        ad = adaptiveFn ? await measure(adaptiveFn, o.runs, o.timeoutMs) : null;
      } else {
        ex = await measure(exactFn, o.runs, o.timeoutMs);
        ad = adaptiveFn ? await measure(adaptiveFn, o.runs, o.timeoutMs) : null;
        n = await measure(naiveFn, o.runs, o.timeoutMs);
      }

      const rec = {
        ts: new Date().toISOString(), kind: 'order', spec: spec.name, order: order.join('>'), scale: o.scaleLabel, label: o.label,
        naive: snap(n), exact: snap(ex), total_median_ms: ex.median == null ? null : exactPreps.get(o.caps[0]).transferMs + exactPreps.get(o.caps[0]).materializationMs + ex.median,
        transfer_ms: exactPreps.get(o.caps[0]).transferMs, materialization_ms: exactPreps.get(o.caps[0]).materializationMs,
        checksum: n.result ? checksum(n.result) : (ex.result ? checksum(ex.result) : null)
      };
      if (ad) rec.adaptive = snap(ad);

      // equality (cannot be verified when the naive side is censored)
      const eqChecks = [];
      if (!n.dnf) {
        if (!ex.dnf) { const r = resultsEqual(n.result || [], ex.result || []); eqChecks.push({ mode: 'exact', ...r }); if (!r.equal) throw new Error(`EQUALITY MISMATCH exact ${spec.name} ${order.join('>')}: ${r.reason}`); }
        if (ad && !ad.dnf) { const r = resultsEqual(n.result || [], ad.result || []); eqChecks.push({ mode: 'adaptive', ...r }); if (!r.equal) throw new Error(`EQUALITY MISMATCH adaptive ${spec.name} ${order.join('>')}: ${r.reason}`); }
      }
      rec.equal = eqChecks.length ? eqChecks.every((c) => c.equal) : null;

      if (o.bloom && bloomPreps.get(defaultCap)) {
        const bp = bloomPreps.get(defaultCap);
        const bm = await measure(() => joinReduced(spec, order, bp, now).then((r) => ({ result: r.result, ms: r.joinMs })), o.runs, o.timeoutMs);
        rec.bloom = snap(bm);
        if (!n.dnf && !bm.dnf) {
          const r = resultsEqual(n.result || [], bm.result || []);
          if (!r.equal) throw new Error(`EQUALITY MISMATCH bloom ${spec.name} ${order.join('>')}: ${r.reason}`);
        }
      }

      results.naive.push(n); results.exact.push(ex); if (ad) results.adaptive.push(ad);
      if (rec.bloom) results.bloom.push(rec.bloom);
      console.log(`  order ${order.join('>')}: naive=${disp(n, o.timeoutMs)} exact=${disp(ex, o.timeoutMs)}${ad ? ' adaptive=' + disp(ad, o.timeoutMs) : ''}${rec.bloom ? ' bloom=' + disp(rec.bloom, o.timeoutMs) : ''} eq=${rec.equal}`);
      write(rec);
    }

    const modes = { naive: stats(results.naive, o.timeoutMs), exact: stats(results.exact, o.timeoutMs) };
    if (results.adaptive.length) modes.adaptive = stats(results.adaptive, o.timeoutMs);
    if (results.bloom.length) modes.bloom = stats(results.bloom, o.timeoutMs);
    const summ = {
      ts: new Date().toISOString(), kind: 'summary', spec: spec.name, scale: o.scaleLabel, label: o.label,
      orders: orders.length, modes,
      cap_skips: Object.fromEntries([...exactPreps].map(([c, p]) => [c, p.skippedList])),
      transfer_ms_by_cap: Object.fromEntries([...exactPreps].map(([c, p]) => [c, p.transferMs])),
      materialization_ms_by_cap: Object.fromEntries([...exactPreps].map(([c, p]) => [c, p.materializationMs]))
    };
    console.log(`  summary: naive gap=${gapStr(modes.naive)} exact gap=${gapStr(modes.exact)}${modes.adaptive ? ' adaptive gap=' + gapStr(modes.adaptive) : ''}`);
    write(summ);

    for (const cap of o.caps) await cleanupReduced(exactPreps.get(cap));
    if (adaptivePrep) await cleanupReduced(adaptivePrep);
    for (const [, p] of bloomPreps) await cleanupReduced(p);
  }

  await disconnectBench();
  console.log('\n[robustness] wrote', LOG_FILE);
}

function snap(m) { return { median: m.median, min: m.min, max: m.max, times: m.times, dnf: m.dnf, lowerBound: m.lowerBound }; }
function disp(m, timeoutMs) { return m.dnf ? `DNF(>=${timeoutMs})` : `${Math.round(m.median)}ms`; }
function gapStr(s) { if (s.ratio == null) return 'n/a'; return `${s.censored ? '>=' : ''}${s.ratio}${s.dnf ? ' (DNF ' + s.dnf + ')' : ''}`; }

main().catch((e) => { console.error('[robustness] FAILED:', e); process.exit(1); });
