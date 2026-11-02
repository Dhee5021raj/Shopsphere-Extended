'use strict';
/**
 * The transfer pass. Executes an ordered schedule of semi-joins:
 *
 *   for each step (target <- filterBy on targetField/filterField):
 *     incoming = distinct values filterBy currently holds on filterField
 *     if |incoming| > cap -> SKIP the step and log it
 *     else apply `targetField IN incoming` as a constraint on target
 *     record keysIn, keysOut (per outgoing edge), docs examined, time
 *
 * `keysOut` (per outgoing edge of the target) is pure diagnostics — nothing
 * downstream reads it — and each outgoing distinct-set aggregation is another
 * full $group scan over whatever relation the target happens to be (order
 * items alone is 4M documents here). Running it inside the TIMED pass made
 * the transfer ~2x slower than the algorithm actually needs on this dataset.
 * Like docsExamined it is now OFF by default; set PT_KEYS_OUT=1 to re-enable.
 *
 * Using exact sets makes each step a true semi-join, which is what gives the
 * paper's full-reduction / robustness guarantee. The cap is the honest
 * trade-off documented in docs/pt-design.md.
 *
 * Returns { schedule, steps: [...stats], constraints, localFilters, sizes }.
 * `constraints` (alias -> [{field, set}]) defines the reduced relation that is
 * later materialised for the join phase.
 */
const { buildSchedule } = require('./schedule');
const { modelForCollection, resolveLocalFilter } = require('./querySpec');
const { makeSet } = require('./filters');

function incomingCap() {
  const v = parseInt(process.env.PT_IN_CAP || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 50000;
}

function constraintsToMatch(constraints) {
  const parts = constraints.map((c) => c.set.toMongoClause(c.field));
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

function outgoingFields(graph, alias) {
  const fields = [];
  for (const e of graph.edges) {
    if (e.a !== alias && e.b !== alias) continue;
    const other = e.a === alias ? e.b : e.a;
    for (const p of e.pairs) {
      if (Object.prototype.hasOwnProperty.call(p, alias) && Object.prototype.hasOwnProperty.call(p, other)) {
        fields.push({ field: p[alias], otherAlias: other });
      }
    }
  }
  return fields;
}

function keysOutEnabled() {
  return process.env.PT_KEYS_OUT === '1';
}

async function docsExamined(Model, match) {
  // explain('executionStats') EXECUTES the matched query to collect its stats,
  // so on large collections it costs a full extra scan per transfer step —
  // instrumentation inflating the measured transfer time on the very numbers
  // the benchmark reports. Off by default; set PT_DOCS_EXAMINED=1 to re-enable.
  if (process.env.PT_DOCS_EXAMINED !== '1') return null;
  try {
    const ex = await Model.find(match).explain('executionStats');
    const es = ex && (ex.executionStats || (ex[0] && ex[0].executionStats));
    return es ? es.totalDocsExamined : null;
  } catch (_) {
    return null;
  }
}

async function runTransfer(spec, options = {}) {
  const log = options.log || (() => {});
  const cap = options.cap || incomingCap();
  const now = options.now || new Date();
  const sizes = options.sizes || {};
  const setKind = options.setKind || null; // 'exact' | 'bloom' | null(=env)
  const schedule = buildSchedule(spec, sizes);

  const localFilters = new Map();
  for (const r of spec.relations) localFilters.set(r.alias, resolveLocalFilter(r.localFilter || {}, now));

  const adaptive = !!options.adaptive;
  const edgeRatio = options.adaptiveEdgeRatio != null ? options.adaptiveEdgeRatio : 0.3;
  const decisions = [];
  const constraints = new Map(spec.relations.map((r) => [r.alias, []]));
  const setCache = new Map(); // alias -> Map(field -> FilterSet)
  const rowCache = new Map(); // alias -> current row count under applied constraints
  const invalidate = (alias) => { setCache.delete(alias); rowCache.delete(alias); };

  async function rowCount(alias) {
    if (rowCache.has(alias)) return rowCache.get(alias);
    const Model = modelForCollection(spec.relations.find((r) => r.alias === alias).collection);
    const match = { $and: [localFilters.get(alias), constraintsToMatch(constraints.get(alias))] };
    const n = await Model.countDocuments(match);
    rowCache.set(alias, n);
    return n;
  }

  // Returns { size, set }. `set` is null when the distinct set exceeds the cap.
  // The size is derived from the SAME values pass, so the aggregation runs once
  // per (alias, field) instead of twice — on large relations the removed second
  // full $group scan previously dominated the transfer time.
  async function getSet(alias, field) {
    let perAlias = setCache.get(alias);
    if (!perAlias) { perAlias = new Map(); setCache.set(alias, perAlias); }
    if (perAlias.has(field)) return perAlias.get(field);
    const Model = modelForCollection(spec.relations.find((r) => r.alias === alias).collection);
    const match = { $and: [localFilters.get(alias), constraintsToMatch(constraints.get(alias))] };
    const docs = await Model.aggregate(
      [{ $match: match }, { $group: { _id: `$${field}` } }, { $project: { _id: 0, v: '$_id' } }],
      { allowDiskUse: true }
    );
    const values = docs.map((d) => d.v);
    const size = values.length;
    const entry = size > cap
      ? { size, values: null, set: null }
      : { size, values, set: makeSet(values, setKind) };
    perAlias.set(field, entry);
    return entry;
  }

  const stats = [];
  for (const step of schedule.steps) {
    const { target, filterBy, direction, on } = step;
    const started = Date.now();
    const incoming = await getSet(filterBy, on.filterField);
    const keysIn = incoming.size;

    if (keysIn > cap) {
      const skipped = {
        target, filterBy, direction,
        targetField: on.targetField, filterField: on.filterField,
        keysIn, keysOut: null, docsExamined: null,
        timeMs: Date.now() - started, skipped: true,
        reason: `incoming set ${keysIn} > cap ${cap}`
      };
      decisions.push({ type: 'edge-skip', why: 'cap', target, filterBy, keysIn, cap });
      stats.push(skipped);
      log(`  SKIP ${direction.padEnd(8)} ${target} <- ${filterBy} : |in|=${keysIn} > cap ${cap}`);
      continue;
    }

    if (adaptive) {
      const rows = await rowCount(target);
      const ratio = rows > 0 ? keysIn / rows : (keysIn > 0 ? Infinity : 0);
      if (ratio > edgeRatio) {
        decisions.push({ type: 'edge-skip', why: 'ratio', target, filterBy, keysIn, targetRows: rows, ratio: +ratio.toFixed(4), threshold: edgeRatio });
        stats.push({
          target, filterBy, direction, targetField: on.targetField, filterField: on.filterField,
          keysIn, keysOut: null, docsExamined: null, timeMs: Date.now() - started, skipped: true,
          reason: `adaptive ratio ${ratio.toFixed(3)} > ${edgeRatio}`
        });
        log(`  SKIP ${direction.padEnd(8)} ${target} <- ${filterBy} : ratio=${ratio.toFixed(3)} > ${edgeRatio}`);
        continue;
      }
      decisions.push({ type: 'edge-apply', target, filterBy, keysIn, targetRows: rows, ratio: +ratio.toFixed(4), threshold: edgeRatio });
    }

    constraints.get(target).push({ field: on.targetField, set: incoming.set });
    invalidate(target);

    const tModel = modelForCollection(spec.relations.find((r) => r.alias === target).collection);
    const tMatch = { $and: [localFilters.get(target), constraintsToMatch(constraints.get(target))] };
    const examined = await docsExamined(tModel, tMatch);

    // Diagnostics only (see header) — outside the algorithm's critical path.
    let keysOut = null;
    if (keysOutEnabled()) {
      keysOut = {};
      for (const of of outgoingFields(schedule.graph, target)) {
        const e = await getSet(target, of.field);
        keysOut[`${target}.${of.field}`] = e.size;
      }
    }

    stats.push({
      target, filterBy, direction,
      targetField: on.targetField, filterField: on.filterField,
      keysIn, keysOut, docsExamined: examined,
      timeMs: Date.now() - started, skipped: false
    });
    log(`  ${direction.padEnd(8)} ${target} <- ${filterBy} : |in|=${keysIn} docs=${examined} keysOut=${JSON.stringify(keysOut)} ${Date.now() - started}ms`);
  }

  return { schedule, stats, constraints, localFilters, sizes, decisions };
}

/** Estimate relation sizes for LargestRoot. */
async function computeSizes(spec, now = new Date()) {
  const sizes = {};
  for (const r of spec.relations) {
    const Model = modelForCollection(r.collection);
    const f = resolveLocalFilter(r.localFilter || {}, now);
    const hasFilter = f && Object.keys(f).length > 0;
    sizes[r.alias] = hasFilter ? await Model.countDocuments(f) : await Model.estimatedDocumentCount();
  }
  return sizes;
}

module.exports = { runTransfer, computeSizes, incomingCap, constraintsToMatch, outgoingFields };
