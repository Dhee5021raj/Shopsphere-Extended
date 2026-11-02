'use strict';
/**
 * Join graph + acyclicity check.
 *
 * Vertices are relations (aliases); an undirected edge exists between two
 * relations when they are equi-joined. The edge WEIGHT is the number of shared
 * join attributes between the pair (Lemma 3.2 in the paper): parallel edges
 * (composite-key joins) collapse into one connection with weight > 1.
 *
 * Acyclicity (alpha-acyclicity for binary equality joins) is detected with
 * ear removal: repeatedly strip a vertex whose remaining degree is <= 1; the
 * graph is acyclic iff everything is stripped. This is the GYO reduction
 * specialised to a simple join graph, and it is what rejects cyclic specs.
 */
const { parseRef } = require('./querySpec');

function buildJoinGraph(spec) {
  if (!spec || !Array.isArray(spec.relations) || spec.relations.length === 0) {
    throw new Error('Spec has no relations');
  }
  const aliases = spec.relations.map((r) => r.alias);
  const aliasSet = new Set(aliases);
  if (aliasSet.size !== aliases.length) throw new Error('Duplicate relation alias in spec');

  for (const [name, collection] of spec.relations.map((r) => [r.alias, r.collection])) {
    if (!collection) throw new Error(`Relation '${name}' has no collection`);
  }

  const byPair = new Map();
  for (const e of spec.edges || []) {
    const { alias: a, field: af } = parseRef(e.left);
    const { alias: b, field: bf } = parseRef(e.right);
    if (!aliasSet.has(a)) throw new Error(`Edge references unknown alias '${a}'`);
    if (!aliasSet.has(b)) throw new Error(`Edge references unknown alias '${b}'`);
    if (a === b) throw new Error(`Self-join edge on '${a}' is not supported`);
    const key = [a, b].sort().join('\u0000');
    if (!byPair.has(key)) byPair.set(key, { a: a < b ? a : b, b: a < b ? b : a, pairs: [] });
    byPair.get(key).pairs.push({ [a]: af, [b]: bf });
  }

  const edges = [...byPair.values()].map((e) => ({
    a: e.a,
    b: e.b,
    weight: e.pairs.length,
    pairs: e.pairs
  }));

  const adj = new Map(aliases.map((a) => [a, new Set()]));
  for (const e of edges) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a); }

  return { aliases, aliasSet, edges, adj };
}

function isAcyclic(graph) {
  const remaining = new Set(graph.aliases);
  let changed = true;
  while (changed && remaining.size > 0) {
    changed = false;
    for (const n of [...remaining]) {
      let deg = 0;
      for (const m of graph.adj.get(n)) if (remaining.has(m)) deg++;
      if (deg <= 1) { remaining.delete(n); changed = true; }
    }
  }
  return remaining.size === 0;
}

function assertAcyclic(spec, graph) {
  const g = graph || buildJoinGraph(spec);
  if (!isAcyclic(g)) {
    const cyc = g.edges.filter((e) => g.adj.get(e.a).has(e.b)).map((e) => `${e.a}=${e.b}`);
    throw new Error(
      `Join graph is cyclic — mongo-pt supports only acyclic (join-tree) queries. ` +
      `Edges: ${cyc.join(', ')}. Add a filter to break the cycle or split the query.`
    );
  }
  return g;
}

function isConnected(graph) {
  if (graph.aliases.length === 0) return true;
  const seen = new Set([graph.aliases[0]]);
  const stack = [graph.aliases[0]];
  while (stack.length) {
    const n = stack.pop();
    for (const m of graph.adj.get(n)) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }
  return seen.size === graph.aliases.length;
}

module.exports = { buildJoinGraph, isAcyclic, assertAcyclic, isConnected };
