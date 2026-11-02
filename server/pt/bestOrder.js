'use strict';
/**
 * Dynamic best-order picker (Step 7c).
 *
 * Pure function — no DB access. Pass relation sizes (e.g. from
 * transfer.computeSizes) and it greedily walks the join graph starting from
 * the SMALLEST relation, always taking the smallest connected neighbor.
 * It is the selection-driven mirror image of the pinned worst case
 * `p>cat>oi>v>o` (biggest first, unfiltered), used as the SECOND timing line
 * in the shadow log: "what would a filter-aware order buy the naive side?"
 *
 * Validity is NOT assumed: the caller must check the result against
 * execute.validJoinOrders before timing it.
 */
const { buildJoinGraph } = require('./joinGraph');

function greedyBestOrder(spec, sizes = {}) {
  if (!spec || !Array.isArray(spec.relations) || spec.relations.length === 0) return null;
  const graph = buildJoinGraph(spec);
  const sizeOf = new Map(spec.relations.map((r) => [r.alias, sizes[r.alias] || 0]));
  const start = [...sizeOf.entries()].sort((a, b) => a[1] - b[1])[0][0];
  const order = [start];
  const remaining = new Set([...sizeOf.keys()].filter((a) => a !== start));
  while (remaining.size > 0) {
    const neighbors = new Set();
    for (const o of order) {
      for (const n of graph.adj.get(o) || []) if (remaining.has(n)) neighbors.add(n);
    }
    if (neighbors.size === 0) return null; // dead end — caller falls back
    const next = [...neighbors].sort((a, b) => sizeOf.get(a) - sizeOf.get(b))[0];
    order.push(next);
    remaining.delete(next);
  }
  return order;
}

module.exports = { greedyBestOrder };
