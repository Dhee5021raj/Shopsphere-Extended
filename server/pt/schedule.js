'use strict';
/**
 * Transfer schedule — the paper's LargestRoot algorithm (Algorithm 1).
 *
 * Prim's maximum-spanning-tree is started from the LARGEST relation R_max
 * (hence "LargestRoot"); edge weight = number of shared join attributes; ties
 * are broken by preferring the larger newly-added relation R so that big
 * relations are pulled toward the root and get filtered before building their
 * own sets. The resulting directed tree (edges point leaf -> root) plus the
 * Yannakakis forward (leaf->root) and backward (root->leaf) passes give a
 * complete semi-join reduction for acyclic queries.
 *
 * Returns:
 *   { root, parent: Map, children: Map, tree: [ {child,parent,weight,on} ],
 *     steps: [ { target, filterBy, direction, on:{targetField,filterField}, edgeWeight } ] }
 */
const { buildJoinGraph, assertAcyclic } = require('./joinGraph');
const { parseRef } = require('./querySpec');

function orientedPair(edge, targetAlias) {
  // edge.pairs entries look like { [a]: fieldA, [b]: fieldB }
  const other = edge.a === targetAlias ? edge.b : edge.a;
  for (const p of edge.pairs) {
    if (Object.prototype.hasOwnProperty.call(p, targetAlias) && Object.prototype.hasOwnProperty.call(p, other)) {
      return { targetField: p[targetAlias], filterField: p[other], otherAlias: other };
    }
  }
  throw new Error(`No join attribute pair found between '${targetAlias}' and '${other}'`);
}

function postorder(root, children, visit) {
  const walk = (n) => { for (const c of children.get(n)) walk(c); visit(n); };
  walk(root);
}
function preorder(root, children, visit) {
  visit(root);
  for (const c of children.get(root)) preorder(c, children, visit);
}

function buildSchedule(spec, sizes) {
  const graph = assertAcyclic(spec);
  const sizeOf = (a) => (sizes && sizes[a] != null ? sizes[a] : 1);

  if (!require('./joinGraph').isConnected(graph)) {
    throw new Error('Join graph is disconnected (Cartesian product) — not supported.');
  }

  // ── LargestRoot: Prim MST starting from the largest relation ──
  const rootHint = graph.aliases.reduce((best, a) => (sizeOf(a) > sizeOf(best) ? a : best), graph.aliases[0]);
  const selected = new Set([rootHint]);
  const parent = new Map();
  const children = new Map(graph.aliases.map((a) => [a, []]));
  const tree = [];

  while (selected.size < graph.aliases.length) {
    let best = null;
    for (const e of graph.edges) {
      for (const [R, S] of [[e.a, e.b], [e.b, e.a]]) {
        if (!selected.has(S) || selected.has(R)) continue;
        const cand = { R, S, weight: e.weight, size: sizeOf(R) };
        if (
          !best ||
          cand.weight > best.weight ||
          (cand.weight === best.weight && cand.size > best.size)
        ) best = cand;
      }
    }
    if (!best) break; // disconnected (already rejected)
    parent.set(best.R, best.S);
    children.get(best.S).push(best.R);
    const edge = graph.edges.find(
      (e) => (e.a === best.R && e.b === best.S) || (e.a === best.S && e.b === best.R)
    );
    tree.push({ child: best.R, parent: best.S, weight: best.weight, edge });
    selected.add(best.R);
  }

  // ── transfer steps: forward (post-order) then backward (pre-order) ──
  const steps = [];
  postorder(rootHint, children, (u) => {
    for (const c of children.get(u)) {
      const t = tree.find((x) => x.child === c && x.parent === u);
      const on = orientedPair(t.edge, u); // target = parent u
      steps.push({ target: u, filterBy: c, direction: 'forward', on: { targetField: on.targetField, filterField: on.filterField }, edgeWeight: t.weight });
    }
  });
  preorder(rootHint, children, (u) => {
    if (!parent.has(u)) return;
    const p = parent.get(u);
    const t = tree.find((x) => x.child === u && x.parent === p);
    const on = orientedPair(t.edge, u); // target = child u
    steps.push({ target: u, filterBy: p, direction: 'backward', on: { targetField: on.targetField, filterField: on.filterField }, edgeWeight: t.weight });
  });

  return { root: rootHint, parent, children, tree, steps, graph };
}

module.exports = { buildSchedule, orientedPair };
