'use strict';
/**
 * Print the LargestRoot transfer schedule (tree + forward/backward steps) and
 * run the transfer pass, reporting per-step stats.
 *
 * Usage: node scripts/ptSchedule.js [specName ...]
 *        (default: rare_category_revenue_7d common_category_revenue_365d)
 */
const { connectBench, disconnectBench, benchUri } = require('../pt/benchDb');
const { specs, byName } = require('../pt/specs');
const { buildSchedule } = require('../pt/schedule');
const { runTransfer, computeSizes, incomingCap } = require('../pt/transfer');
const { buildJoinGraph, isAcyclic } = require('../pt/joinGraph');
const { probeBloomSupport } = require('../pt/filters');
const mongoose = require('mongoose');

function fmt(n) { return n == null ? '-' : n.toLocaleString('en-US'); }

async function main() {
  const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const selected = names.length ? names.map((n) => byName[n] || (() => { throw new Error(`Unknown spec: ${n}`); })()) : [specs[0], specs[1]];

  await connectBench();
  console.log(`[pt] uri=${benchUri()} PT_BLOOM=${process.env.PT_BLOOM || '0'} cap=${incomingCap()}`);

  if (process.env.PT_BLOOM === '1') {
    const probe = await probeBloomSupport(mongoose.connection.db);
    console.log(`[pt] BloomFilterSet ($function) support: ${JSON.stringify(probe)}`);
  }

  for (const spec of selected) {
    const graph = buildJoinGraph(spec);
    console.log('\n' + '='.repeat(78));
    console.log(`SPEC ${spec.name} — ${spec.description}`);
    console.log(`relations: ${spec.relations.map((r) => `${r.alias}:${r.collection}`).join(', ')}`);
    console.log(`join graph edges: ${graph.edges.map((e) => `${e.a}-${e.b}(w${e.weight})`).join(', ')}`);
    console.log(`acyclic: ${isAcyclic(graph)}`);

    const now = new Date();
    const sizes = await computeSizes(spec, now);
    const schedule = buildSchedule(spec, sizes);
    console.log(`relation sizes: ${JSON.stringify(sizes)}`);
    console.log(`LargestRoot = ${schedule.root}`);
    console.log('join tree (child -> parent): ' +
      schedule.tree.map((t) => `${t.child}->${t.parent}`).join(', '));
    console.log(`schedule: ${schedule.steps.length} transfer steps (forward then backward)`);

    console.log('\nper-step stats:');
    const res = await runTransfer(spec, { sizes, now, log: (m) => console.log(m) });

    const totalKeysIn = res.stats.reduce((a, s) => a + (s.keysIn || 0), 0);
    const skipped = res.stats.filter((s) => s.skipped).length;
    const totalMs = res.stats.reduce((a, s) => a + s.timeMs, 0);
    console.log(`\nsummary: steps=${res.stats.length} skipped=${skipped} sum(keysIn)=${fmt(totalKeysIn)} transferTime=${totalMs}ms`);
    const reduced = {};
    for (const r of spec.relations) {
      const c = res.constraints.get(r.alias).length;
      reduced[r.alias] = `${c} constraints`;
    }
    console.log(`constraints applied: ${JSON.stringify(reduced)}`);
  }

  await disconnectBench();
}

main().catch((e) => { console.error('[pt] FAILED:', e); process.exit(1); });
