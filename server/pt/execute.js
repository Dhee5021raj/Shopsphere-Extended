'use strict';
/**
 * Join phase execution.
 *
 * A query is executed by a left-deep $lookup pipeline over an explicit join
 * order (a permutation of aliases whose every prefix is connected — no
 * Cartesian products). The SAME pipeline builder is used for every mode, only
 * the source collections differ:
 *
 *   naive          -> full collections, local filters applied
 *   exact-reduced  -> temp collections holding the exact-set reduced relations
 *   bloom-reduced  -> temp collections holding the Bloom-filter reduced relations
 *
 * Phases are always reported separately: transfer, materialization, join, total.
 */
const mongoose = require('mongoose');
const { buildJoinGraph } = require('./joinGraph');
const { parseRef, resolveLocalFilter, modelForCollection } = require('./querySpec');
const { runTransfer, computeSizes, constraintsToMatch } = require('./transfer');

// ── field bookkeeping ─────────────────────────────────────────
function collectNeededFields(spec) {
  const need = new Map(spec.relations.map((r) => [r.alias, new Set()]));
  const add = (ref) => {
    const { alias, field } = parseRef(ref);
    if (!need.has(alias)) throw new Error(`Spec references unknown alias '${alias}'`);
    need.get(alias).add(field);
  };
  for (const e of spec.edges || []) { add(e.left); add(e.right); }
  for (const k of spec.group.keys) add(k.expr);
  for (const a of spec.group.aggregates || []) if (a.expr) add(a.expr);
  return need;
}

function findJoinEdge(spec, joinedSet, Y) {
  for (const e of spec.edges) {
    const { alias: la, field: lf } = parseRef(e.left);
    const { alias: ra, field: rf } = parseRef(e.right);
    if (la === Y && joinedSet.has(ra)) return { foreignField: lf, localAlias: ra, localField: rf };
    if (ra === Y && joinedSet.has(la)) return { foreignField: rf, localAlias: la, localField: lf };
  }
  throw new Error(`Join order is not a connected prefix: '${Y}' has no edge to the joined set`);
}

function prefixFilter(alias, f) {
  if (!f) return {};
  if (Array.isArray(f.$and)) return { $and: f.$and.map((x) => prefixFilter(alias, x)) };
  if (Array.isArray(f.$or)) return { $or: f.$or.map((x) => prefixFilter(alias, x)) };
  const o = {};
  for (const [k, v] of Object.entries(f)) { if (k === '$and' || k === '$or') continue; o[`${alias}.${k}`] = v; }
  return o;
}

function buildPipeline(spec, joinOrder, opts) {
  const { collectionOf, now } = opts;
  const needed = opts.needed || collectNeededFields(spec);
  const localFilterOf = (alias) => resolveLocalFilter(spec.relations.find((r) => r.alias === alias).localFilter || {}, now);
  // per-alias filter applied when the alias is introduced (adaptive mode supplies
  // a filter for relations that were NOT materialised)
  const filterOf = opts.filterOf || ((alias) => (opts.applyLocalFilters ? localFilterOf(alias) : {}));

  const pipeline = [];
  const first = joinOrder[0];
  {
    const lf = filterOf(first);
    if (lf && Object.keys(lf).length) pipeline.push({ $match: lf });
  }
  // Nest the first relation under its alias so every reference is uniformly
  // `$alias.field` (matches the $lookup outputs).
  const firstProj = {};
  for (const f of needed.get(first)) firstProj[f] = `$${f}`;
  if (needed.get(first).has('_id') || opts.rawJoin) firstProj._id = '$_id';
  pipeline.push({ $project: { _id: 0, [first]: firstProj } });

  const joined = new Set([first]);
  for (let i = 1; i < joinOrder.length; i++) {
    const Y = joinOrder[i];
    const je = findJoinEdge(spec, joined, Y);
    // Indexed equality join: localField/foreignField uses the index on the
    // foreign key (an $expr $lookup would force a scan per input document).
    pipeline.push({
      $lookup: {
        from: collectionOf(Y),
        localField: `${je.localAlias}.${je.localField}`,
        foreignField: je.foreignField,
        as: Y
      }
    });
    pipeline.push({ $unwind: `$${Y}` });
    {
      const lf = filterOf(Y);
      if (lf && Object.keys(lf).length) pipeline.push({ $match: prefixFilter(Y, lf) });
    }
    joined.add(Y);
  }

  if (opts.rawJoin) {
    const idProj = { _id: 0 };
    for (const a of joinOrder) idProj[`${a}__id`] = `$${a}._id`;
    pipeline.push({ $project: idProj });
    return pipeline;
  }

  const groupId = {};
  spec.group.keys.forEach((k, i) => { groupId[`k${i}`] = `$${k.expr}`; });
  const g = { _id: groupId };
  for (const a of spec.group.aggregates || []) {
    if (a.op === 'count') g[a.as] = { $sum: 1 };
    else if (['sum', 'avg', 'min', 'max'].includes(a.op)) g[a.as] = { [`$${a.op}`]: `$${a.expr}` };
    else throw new Error(`Unknown aggregate op '${a.op}'`);
  }
  pipeline.push({ $group: g });

  const project = { _id: 0 };
  spec.group.keys.forEach((k, i) => { project[k.as] = `$_id.k${i}`; });
  for (const a of spec.group.aggregates || []) project[a.as] = `$${a.as}`;
  pipeline.push({ $project: project });

  if (spec.orderBy && spec.orderBy.length) {
    const sort = {};
    for (const o of spec.orderBy) sort[o.field] = o.dir;
    pipeline.push({ $sort: sort });
  }
  if (spec.limit) pipeline.push({ $limit: spec.limit });
  return pipeline;
}

async function runPipeline(spec, joinOrder, opts) {
  const db = mongoose.connection.db;
  const first = joinOrder[0];
  const pipeline = buildPipeline(spec, joinOrder, opts);
  const aggOpts = { allowDiskUse: true };
  if (opts.maxTimeMs) aggOpts.maxTimeMS = opts.maxTimeMs;
  return db.collection(opts.collectionOf(first)).aggregate(pipeline, aggOpts).toArray();
}

// ── join orders ───────────────────────────────────────────────
function validJoinOrders(spec) {
  const graph = buildJoinGraph(spec);
  const aliases = graph.aliases;
  const out = [];
  const rec = (order, remaining) => {
    if (remaining.length === 0) { out.push([...order]); return; }
    for (const a of remaining) {
      const connectable = order.length === 0 || order.some((o) => graph.adj.get(o).has(a));
      if (connectable) rec([...order, a], remaining.filter((x) => x !== a));
    }
  };
  rec([], aliases);
  return out;
}

// ── execution modes ───────────────────────────────────────────
const fullCollectionOf = (spec) => (alias) => spec.relations.find((r) => r.alias === alias).collection;

async function runNaive(spec, joinOrder, ctx = {}) {
  const now = ctx.now || new Date();
  const t0 = Date.now();
  const result = await runPipeline(spec, joinOrder, {
    collectionOf: fullCollectionOf(spec), applyLocalFilters: true, now, maxTimeMs: ctx.maxTimeMs
  });
  return { result, joinMs: Date.now() - t0 };
}

let RUN_SEQ = 0;
function uniqueRunId() { return `${Date.now().toString(36)}${(RUN_SEQ++).toString(36)}`; }

/**
 * Materialise the reduced relations into temp collections.
 *
 * Adaptive mode additionally SKIPS materialisation for any relation whose
 * reduced size exceeds `adaptiveMatRatio` (default 0.5) of its local-filtered
 * size — scanning the original collection with the key-set filter inline is
 * cheaper than copying it. Each decision and its ratio is returned.
 *
 * Returns { temps, fallback, decisions }. `fallback` maps a non-materialised
 * alias to the filter that must be applied to its ORIGINAL collection.
 */
async function materialize(spec, transfer, runId, now, opts = {}) {
  const db = mongoose.connection.db;
  const needed = collectNeededFields(spec);
  const temps = new Map();
  const fallback = new Map();
  const decisions = [];
  const matRatio = opts.adaptive ? (opts.adaptiveMatRatio != null ? opts.adaptiveMatRatio : 0.5) : null;
  const edgeFieldsOf = (alias) => {
    const s = new Set();
    for (const e of spec.edges) {
      const { alias: la, field: lf } = parseRef(e.left);
      const { alias: ra, field: rf } = parseRef(e.right);
      if (la === alias) s.add(lf);
      if (ra === alias) s.add(rf);
    }
    return s;
  };
  for (const r of spec.relations) {
    const baseFilter = transfer.localFilters.get(r.alias);
    const reducedFilter = { $and: [baseFilter, constraintsToMatch(transfer.constraints.get(r.alias))] };
    if (opts.adaptive) {
      const Model = modelForCollection(r.collection);
      const original = await Model.countDocuments(baseFilter);
      const reduced = await Model.countDocuments(reducedFilter);
      const ratio = original > 0 ? reduced / original : 1;
      if (ratio > matRatio) {
        fallback.set(r.alias, reducedFilter);
        decisions.push({ type: 'mat-skip', alias: r.alias, original, reduced, ratio: +ratio.toFixed(4), threshold: matRatio });
        continue;
      }
      decisions.push({ type: 'materialize', alias: r.alias, original, reduced, ratio: +ratio.toFixed(4), threshold: matRatio });
    }
    const name = `tmp_pt_${runId}_${r.alias}`;
    const project = { _id: 0 };
    for (const f of needed.get(r.alias)) project[f] = 1;
    if (needed.get(r.alias).has('_id')) project._id = 1;
    await db.collection(r.collection).aggregate([{ $match: reducedFilter }, { $project: project }, { $out: name }]).toArray();
    for (const f of edgeFieldsOf(r.alias)) await db.collection(name).createIndex({ [f]: 1 });
    temps.set(r.alias, name);
  }
  return { temps, fallback, decisions };
}

function collectionResolver(spec, mat) {
  const full = fullCollectionOf(spec);
  return (alias) => mat.temps.get(alias) || full(alias);
}
function filterResolver(mat) {
  return (alias) => (mat.fallback.has(alias) ? mat.fallback.get(alias) : {});
}

async function dropTemps(temps) {
  const db = mongoose.connection.db;
  const names = temps instanceof Map ? [...temps.values()] : [...(temps.temps ? temps.temps.values() : [])];
  await Promise.all(names.map((n) => db.collection(n).drop().catch(() => {})));
}

/**
 * Runs a fully reduced mode end-to-end (transfer + materialization + join).
 * `opts.transfer` may be passed pre-computed (join order independent) for reuse.
 */
async function runReduced(spec, joinOrder, opts = {}) {
  const now = opts.now || new Date();
  const setKind = opts.setKind || null; // 'exact' | 'bloom' | null(env)
  const runId = opts.runId || uniqueRunId();

  let transfer = opts.transfer;
  let transferMs = opts.transferMs != null ? opts.transferMs : 0;
  if (!transfer) {
    const sizes = opts.sizes || (await computeSizes(spec, now));
    const t0 = Date.now();
    transfer = await runTransfer(spec, { sizes, now, setKind, cap: opts.cap, log: () => {} });
    transferMs = Date.now() - t0;
  }

  const m0 = Date.now();
  const temps = await materialize(spec, transfer, runId, now);
  const materializationMs = Date.now() - m0;

  const j0 = Date.now();
  const result = await runPipeline(spec, joinOrder, { collectionOf: collectionResolver(spec, temps), filterOf: filterResolver(temps), applyLocalFilters: false, now, maxTimeMs: opts.maxTimeMs });
  const joinMs = Date.now() - j0;

  await dropTemps(temps);
  const skippedEdges = transfer.stats.filter((s) => s.skipped);
  return {
    result,
    transferMs,
    materializationMs,
    joinMs,
    totalMs: transferMs + materializationMs + joinMs,
    skippedEdges: skippedEdges.length,
    skippedList: skippedEdges.map((s) => `${s.target}<-${s.filterBy}`),
    transferStats: transfer.stats,
    decisions: temps.decisions
  };
}

/**
 * Prepare a reduced instance once (transfer + materialization) so many join
 * orders can reuse it. Transfer is join-order independent — that is the point
 * of predicate transfer.
 */
async function prepareReduced(spec, opts = {}) {
  const now = opts.now || new Date();
  const sizes = opts.sizes || (await computeSizes(spec, now));
  const runId = opts.runId || uniqueRunId();
  const t0 = Date.now();
  const transfer = await runTransfer(spec, { sizes, now, setKind: opts.setKind || null, cap: opts.cap, adaptive: opts.adaptive, adaptiveEdgeRatio: opts.adaptiveEdgeRatio, log: () => {} });
  const transferMs = Date.now() - t0;
  const m0 = Date.now();
  const mat = await materialize(spec, transfer, runId, now, { adaptive: opts.adaptive, adaptiveMatRatio: opts.adaptiveMatRatio });
  const materializationMs = Date.now() - m0;
  const skippedList = transfer.stats.filter((s) => s.skipped).map((s) => `${s.target}<-${s.filterBy}`);
  return { transfer, transferMs, materializationMs, mat, runId, setKind: opts.setKind || null, cap: opts.cap, sizes, skippedList, decisions: [...(transfer.decisions || []), ...mat.decisions] };
}

async function joinReduced(spec, joinOrder, prep, now) {
  const j0 = Date.now();
  const result = await runPipeline(spec, joinOrder, {
    collectionOf: collectionResolver(spec, prep.mat), filterOf: filterResolver(prep.mat),
    applyLocalFilters: false, now: now || new Date(), maxTimeMs: prep.maxTimeMs
  });
  return { result, joinMs: Date.now() - j0 };
}

async function cleanupReduced(prep) { await dropTemps(prep.mat.temps); }

// ── equality ──────────────────────────────────────────────────
function normalizeRows(rows) {
  return rows
    .map((r) => {
      const o = {};
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'number') o[k] = Math.round(v * 100) / 100;
        else if (typeof v === 'string' && /^[0-9a-f]{24}$/.test(v)) o[k] = v;
        else if (v && typeof v.toHexString === 'function') o[k] = v.toHexString();
        else o[k] = v;
      }
      return JSON.stringify(o);
    })
    .sort();
}

function resultsEqual(a, b) {
  const x = normalizeRows(a);
  const y = normalizeRows(b);
  if (x.length !== y.length) return { equal: false, reason: `row count ${x.length} != ${y.length}` };
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return { equal: false, reason: `row ${i}: ${x[i]} != ${y[i]}` };
  return { equal: true, rows: x.length };
}

function checksum(rows) {
  const x = normalizeRows(rows);
  let h = 0;
  const s = x.join('|');
  for (let i = 0; i < s.length; i++) { h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; }
  return `${x.length}:${(h >>> 0).toString(16)}`;
}

module.exports = {
  collectNeededFields, buildPipeline, runPipeline, validJoinOrders, prefixFilter,
  runNaive, runReduced, materialize, dropTemps, uniqueRunId,
  prepareReduced, joinReduced, cleanupReduced,
  normalizeRows, resultsEqual, checksum, fullCollectionOf
};
