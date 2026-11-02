'use strict';
/**
 * One command to reproduce the benchmark: seed -> Step 4 -> report.
 *
 * Usage:
 *   npm run repro                       # default scale (200k/1M/4M), full sweep
 *   npm run repro -- --scale=medium     # faster local run
 *   npm run repro -- --scale=small --maxOrders=6 --runs=3 --bloom
 *   npm run repro -- --no-seed          # reuse the existing bench data
 *
 * Extra flags after `--` are forwarded to pt/robustness.js.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const HERE = __dirname;
const SCALES = {
  small: ['--small'],
  medium: ['--products=50000', '--orders=100000', '--items=400000', '--vendors=100', '--categories=30', '--users=20000', '--reviews=100000'],
  default: []
};

function run(cmd, args, env) {
  console.log(`\n$ ${cmd} ${args.join(' ')}\n`);
  execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
}

function main() {
  const argv = process.argv.slice(2);
  const scaleArg = (argv.find((a) => a.startsWith('--scale=')) || '--scale=default').split('=')[1];
  const noSeed = argv.includes('--no-seed');
  const passthrough = argv.filter((a) => !a.startsWith('--scale=') && a !== '--no-seed');
  const scaleFlags = SCALES[scaleArg] || [];
  // timed-out runs are censored, so use the long ceiling from the brief
  if (!argv.some((a) => a.startsWith('--timeoutMs='))) passthrough.push('--timeoutMs=120000');
  const label = (argv.find((a) => a.startsWith('--label=')) || `--label=${scaleArg === 'small' ? 'smoke' : 'full'}`).split('=')[1];
  passthrough.push(`--label=${label}`);
  const env = { PT_SCALE: scaleArg, PT_LABEL: label };
  if (argv.includes('--bloom')) env.PT_BLOOM = '1';

  const t0 = Date.now();
  if (!noSeed) run('node', [path.join(HERE, 'seedBench.js'), '--drop', ...scaleFlags], env);
  const seedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[repro] seeding (${scaleArg}) took ${seedSec}s`);

  run('node', [path.join(HERE, '..', 'pt', 'robustness.js'), ...passthrough], env);
  run('node', [path.join(HERE, '..', 'benchmarks', 'report.js')], env);
  console.log('\n[repro] done. See docs/results.md, docs/results.csv, docs/results-chart.html');
}

main();
