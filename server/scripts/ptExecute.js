'use strict';
/**
 * Step 3 demo: run naive, exact-reduced and bloom-reduced (bloom only when
 * PT_BLOOM=1 or --bloom) for several join orders of the example specs, verify
 * identical results, and report transfer / materialization / join / total
 * separately.
 *
 * Usage: node scripts/ptExecute.js [specName ...] [--orders=6] [--bloom]
 */
const { connectBench, disconnectBench, benchUri } = require('../pt/benchDb');
const { specs, byName } = require('../pt/specs');
const { validJoinOrders, runNaive, prepareReduced, joinReduced, cleanupReduced, resultsEqual, checksum } = require('../pt/execute');
const { computeSizes } = require('../pt/transfer');
const { collectEnvInfo } = require('../pt/envInfo');

function sample(arr, n, seed = 12345) {
  if (arr.length <= n) return arr.slice();
  const a = arr.slice();
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

async function main() {
  const argv = process.argv.slice(2);
  const names = argv.filter((a) => !a.startsWith('--'));
  const ordersArg = (argv.find((a) => a.startsWith('--orders=')) || '--orders=6').split('=')[1];
  const maxOrders = parseInt(ordersArg, 10);
  const bloom = process.env.PT_BLOOM === '1' || argv.includes('--bloom');
  const selected = names.length ? names.map((n) => byName[n]) : [specs[0], specs[1]];

  await connectBench();
  const env = await collectEnvInfo({ uri: benchUri(), bloom_enabled: bloom, max_orders: maxOrders });
  console.log('[env]', JSON.stringify(env, null, 1));

  let failures = 0;
  for (const spec of selected) {
    const now = new Date();
    const sizes = await computeSizes(spec, now);
    const allOrders = validJoinOrders(spec);
    const orders = sample(allOrders, maxOrders);
    console.log(`\nSPEC ${spec.name}: ${allOrders.length} valid join orders, testing ${orders.length}`);

    const exact = await prepareReduced(spec, { setKind: 'exact', now, sizes });
    const bloomPrep = bloom ? await prepareReduced(spec, { setKind: 'bloom', now, sizes }) : null;

    console.log(`  transfer=${exact.transferMs}ms  materialization=${exact.materializationMs}ms  skipped=[${exact.skippedList.join(', ')}]`);
    if (bloomPrep) console.log(`  [bloom] transfer=${bloomPrep.transferMs}ms  materialization=${bloomPrep.materializationMs}ms  skipped=[${bloomPrep.skippedList.join(', ')}]`);

    for (const order of orders) {
      const naive = await runNaive(spec, order, { now });
      const er = await joinReduced(spec, order, exact, now);
      const row = {
        order: order.join('>'),
        naive_ms: naive.joinMs,
        exact_join_ms: er.joinMs,
        exact_total_ms: exact.transferMs + exact.materializationMs + er.joinMs,
        bloom_join_ms: null, bloom_total_ms: null,
        equal: 'ok', checksum: checksum(naive.result)
      };
      const eq = resultsEqual(naive.result, er.result);
      if (!eq.equal) { failures++; row.equal = `MISMATCH ${eq.reason}`; }
      if (bloomPrep) {
        const br = await joinReduced(spec, order, bloomPrep, now);
        row.bloom_join_ms = br.joinMs;
        row.bloom_total_ms = bloomPrep.transferMs + bloomPrep.materializationMs + br.joinMs;
        const beq = resultsEqual(naive.result, br.result);
        if (!beq.equal) { failures++; row.equal = `bloom MISMATCH ${beq.reason}`; }
      }
      console.log('  ', JSON.stringify(row));
    }

    await cleanupReduced(exact);
    if (bloomPrep) await cleanupReduced(bloomPrep);
  }

  console.log(`\n[ptExecute] equality failures: ${failures}`);
  await disconnectBench();
  if (failures > 0) process.exit(2);
}

main().catch((e) => { console.error('[ptExecute] FAILED:', e); process.exit(1); });
