'use strict';
/**
 * Pretty-print the mongo-pt JSONL log in the terminal.
 *
 * Usage:
 *   npm run pt:log                      # last 15 records, table view
 *   npm run pt:log -- --tail=50         # last 50 records
 *   npm run pt:log -- --shadow          # only kind:"shadow" rows (default)
 *   npm run pt:log -- --all             # include non-shadow kinds (env/spec/cap/order/summary)
 *   npm run pt:log -- --follow          # live-tail, printing new records as they land
 *   npm run pt:log -- --speedup=1       # hide rows whose speedup is below 1 (losses)
 *   npm run pt:log -- --verbose         # under each row: what the query computes
 *   npm run pt:log -- --raw             # one JSON per line, no table
 *
 * The same data powers the browser UI at /admin/pt-log — this is the terminal view.
 */
const fs = require('fs');
const path = require('path');
const { byName } = require('../pt/specs');

const LOG_FILE = process.env.PT_LOG || path.join(__dirname, '..', 'logs', 'pt-log.jsonl');

function arg(name, dflt) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
}
const flags = new Set(process.argv.slice(2));

const has = (f) => flags.has(`--${f}`);
const ANSI = process.stdout.isTTY;
const c = (code, s) => (ANSI ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = (s) => c(2, s);
const bold = (s) => c(1, s);
const green = (s) => c(32, s);
const red = (s) => c(31, s);
const yellow = (s) => c(33, s);

function parseLines() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return fs
    .readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch (_) { return { kind: 'malformed', raw: l.slice(0, 80) }; } });
}

function recordToRow(r) {
  const description = r.description || (byName[r.spec] && byName[r.spec].description) || '';
  const local = r.ts
    ? new Date(r.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  const rel = r.ts
    ? (() => {
        const m = Math.max(0, Math.round((Date.now() - new Date(r.ts)) / 60000));
        return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
      })()
    : '—';
  const time = `${local} (${rel})`;
  const kind = (r.kind || '—').slice(0, 7);
  const spec = (r.spec || (r.trigger || '—')).slice(0, 30);
  const order = (r.order || '—').slice(0, 14);
  const naive = r.naive_ms != null ? fmtInt(r.naive_ms) : '—';
  const reduced = r.reduced_ms != null ? fmtInt(r.reduced_ms) : r.total_ms != null ? fmtInt(r.total_ms) : '—';
  const speed = r.speedup != null ? r.speedup.toFixed(2) + 'x' : '—';
  const tfr = r.transfer_ms != null ? fmtInt(r.transfer_ms) : '—';
  const mat = r.materialization_ms != null ? fmtInt(r.materialization_ms) : '—';
  const eq = r.equal == null ? 'n/v' : r.equal ? 'ok' : 'FAIL';
  return { time, kind, spec, order, naive, reduced, speed, tfr, mat, eq, specFull: r.spec || '', description, trigger: r.trigger || '', runs: r.runs, rows: r.result_rows, checksum: r.checksum, rawOrder: r.order || '' };
}

// alias decode: p>cat>oi>v>o → products ▸ categories ▸ order items ▸ …
const ALIAS = { p: 'products', cat: 'categories', oi: 'order items', o: 'orders', v: 'vendors', u: 'users', c: 'categories', r: 'reviews' };
const prettyOrder = (oRaw, compact) => {
  if (!oRaw) return '';
  const parts = oRaw.split('>').map((s) => ALIAS[s.trim()] || s.trim());
  return (compact ? parts.join('▸') + '  (' + oRaw + ')' : parts.join(' ▸ ') + '   [aliased as: ' + oRaw + ']');
};
const fmtInt = (v) => {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 's';
  return Math.round(v) + 'ms';
};

function printTable(rows) {
  const headers = ['#', 'Time', 'Kind', 'Spec', 'Order', 'Naive', 'Reduced', 'Speed', 'Transfer', 'Mat', 'Equal'];
  const table = rows.map((x, i) => [String(i + 1), x.time, x.kind, x.spec, x.order, x.naive, x.reduced, x.speed, x.tfr, x.mat, x.eq]);
  const widths = headers.map((h, i) => Math.max(h.length, ...table.map((r) => r[i].length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ');
  console.log(bold(line(headers)));
  console.log(dim(line(widths.map((w) => '—'.repeat(w)))));
  table.forEach((r, i) => {
    let out = line(r);
    const orig = rows[i];
    if (orig.speed !== '—') {
      const g = parseFloat(rows[i].speed);
      const piece = g >= 1 ? green(`${g}x`) : red(`${g}x`);
      // replace the speedup cell text with a coloured one (same width)
      const spStart = widths.slice(0, 7).reduce((a, w) => a + w + 2, 0);
      out = out.slice(0, spStart) + piece.padEnd(widths[7]) + out.slice(spStart + widths[7]);
    }
    if (orig.eq === 'FAIL') out = out.replace(/FAIL$/, red('FAIL'));
    else if (orig.eq === 'ok') out = out.replace(/ok$/, green('ok'));
    console.log(out);
  });
}

function printAliases() {
  console.log(dim(`\nlog: ${LOG_FILE}`));
  console.log(dim(`browser view: http://localhost:3000/admin/pt-log  (admin login)\n`));
}

function main() {
  let records = parseLines();
  const minSpeed = parseFloat(arg('speedup', NaN));
  if (!has('all')) records = records.filter((r) => r.kind === 'shadow');
  if (!Number.isNaN(minSpeed)) records = records.filter((r) => r.speedup != null && r.speedup >= minSpeed);
  if (!records.length) {
    console.log(dim(`No ${has('all') ? '' : 'shadow '}records in ${LOG_FILE}`));
    console.log(dim('They appear after a search/category action on the site with PT_SHADOW=1,'));
    console.log(dim('or from `npm run repro` / `npm run bench`. Run `npm run pt:log -- --all` to include kinds.'));
    return;
  }
  const n = parseInt(arg('tail', '15'), 10);
  const slice = records.slice(-n);
  if (has('raw')) slice.forEach((r) => console.log(JSON.stringify(r)));
  else {
    printTable(slice.map(recordToRow));
    console.log(dim(`${slice.length} of ${records.length} records shown (newest last)`));
    if (has('verbose')) {
      console.log();
      for (const row of slice.map((r) => recordToRow(r))) {
        console.log(bold(row.spec || '—') + (row.time ? dim('   ' + row.time) : ''));
        if (row.description) console.log('   What it computes: ' + row.description);
        if (row.rawOrder) console.log('   Join order: ' + prettyOrder(row.rawOrder) + (row.trigger ? '   fired by: ' + row.trigger : ''));
        if (row.rows != null) console.log('   result rows: ' + row.rows + '   checksum: ' + (row.checksum || '-') + '   runs: ' + (row.runs || '-') + ' per side');
        console.log();
      }
    }
  }
  printAliases();
}

if (has('follow')) {
  console.log(dim(`Tailing ${LOG_FILE} — new shadow records print as they land. Ctrl+C to stop.\n`));
  let seen = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).length : 0;
  printTable(parseLines().filter((r) => !has('all') ? r.kind === 'shadow' : true).slice(-parseInt(arg('tail', '10'), 10)).map(recordToRow));
  console.log(dim('--- waiting for new records ---'));
  const timer = setInterval(() => {
    if (!fs.existsSync(LOG_FILE)) return;
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    if (lines.length > seen) {
      for (const l of lines.slice(seen)) {
        let r; try { r = JSON.parse(l); } catch (_) { continue; }
        if (!has('all') && r.kind !== 'shadow') continue;
        const minS = parseFloat(arg('speedup', NaN));
        if (!Number.isNaN(minS) && (r.speedup == null || r.speedup < minS)) continue;
        const row = recordToRow(r);
        const summary = [row.time, row.kind, row.spec, `naive ${row.naive}`, `reduced ${row.reduced}`, row.speed === '—' ? '' : row.speed, `equal ${row.eq}`].filter(Boolean).join(' | ');
        console.log(green('> ') + summary);
        if (row.description) console.log('    ' + dim('What it computes: ' + row.description));
      }
      seen = lines.length;
    }
  }, 2000);
  process.on('SIGINT', () => { clearInterval(timer); process.exit(0); });
} else {
  main();
}
