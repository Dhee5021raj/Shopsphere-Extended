'use strict';
/**
 * Step 6 — build docs/results.md, docs/results.csv, docs/results-chart.csv and
 * docs/results-chart.html from a JSONL log (default server/logs/pt-log.jsonl;
 * override with PT_LOG / PT_REPORT_SUFFIX).
 *
 * Timed-out runs are DNF (lower bound = timeout) and the robustness gap is
 * printed as ">= X" whenever a DNF is involved.
 */
const fs = require('fs');
const path = require('path');

const LOG = process.env.PT_LOG || path.join(__dirname, '..', 'logs', 'pt-log.jsonl');
const SUFFIX = process.env.PT_REPORT_SUFFIX || '';
const DOCS = path.join(__dirname, '..', '..', 'docs');

const MODES = ['naive', 'exact', 'adaptive', 'bloom'];

function readLog() { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
function f(x) { return x == null ? '-' : Math.round(x); }

function envHeader(env) {
  if (!env) return '> Environment: unknown\n';
  return [
    '> **Environment**',
    `> mongod ${env.mongod_version} | ${env.cpu_count}-core ${env.cpu_model} | ${env.total_mem_gb} GB RAM (${env.free_mem_gb} GB free) | ${env.platform} | Node ${env.node_version}`,
    `> label=${env.label} scale=${env.scale} runs=${env.runs} caps=[${(env.caps || []).join(', ')}] timeout=${env.timeout_ms}ms edge_ratio=${env.edge_ratio} mat_ratio=${env.mat_ratio} bloom=${env.bloom_enabled}`,
    `> other heavy processes: ${(env.heavy_processes || []).join('; ') || 'none > 500MB'}`,
    ''
  ].join('\n');
}

function gap(s) { if (!s || s.ratio == null) return '-'; return `${s.censored ? '>=' : ''}${s.ratio}${s.dnf ? ' (' + s.dnf + ' DNF)' : ''}`; }
function cell(s) { if (!s) return '-'; if (s.median == null && s.dnf) return `DNF(>=${s.lowerBound})`; return `${f(s.median)}${s.dnf ? '+' : ''}`; }

function md(s, env) {
  const summaries = s.filter((r) => r.kind === 'summary');
  const orders = s.filter((r) => r.kind === 'order');
  const caps = s.filter((r) => r.kind === 'cap');
  const specs = s.filter((r) => r.kind === 'spec');

  let out = '# mongo-pt robustness results\n\n' + envHeader(env);
  out += `Generated ${new Date().toISOString()} from \`${path.relative(path.join(DOCS, '..'), LOG).replace(/\\/g, '/')}\`.\n\n`;
  if (env && env.label === 'smoke') {
    out += '> ⚠️ **SMOKE TEST run** (reduced scale/runs). Use it to check the harness, not to draw performance claims.\n\n';
  }
  out += 'Legend: `DNF` = timed out (censored, lower bound = timeout, never dropped); a gap shown as `>= X` involves a DNF.\n\n';

  out += '## Per-query summary\n\n';
  out += '| spec | orders | naive med | naive gap | exact med | exact gap | adaptive med | adaptive gap | transfer ms | mat ms | DNF n/e/a/b |\n';
  out += '|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const sm of summaries) {
    const n = sm.modes.naive || {}, e = sm.modes.exact || {}, a = sm.modes.adaptive || {}, b = sm.modes.bloom || {};
    const t = sm.transfer_ms_by_cap ? sm.transfer_ms_by_cap[Object.keys(sm.transfer_ms_by_cap)[0]] : '-';
    const m = sm.materialization_ms_by_cap ? sm.materialization_ms_by_cap[Object.keys(sm.materialization_ms_by_cap)[0]] : '-';
    out += `| ${sm.spec} | ${sm.orders} | ${cell(n)} | ${gap(n)} | ${cell(e)} | ${gap(e)} | ${cell(a)} | ${gap(a)} | ${t} | ${m} | ` +
      `${n.dnf || 0}/${e.dnf || 0}/${a.dnf || 0}/${b.dnf || 0} |\n`;
  }

  out += '\n## Cap sweep + adaptive decisions (which transfer edges are skipped)\n\n';
  out += '| spec | mode | cap | transfer ms | mat ms | skipped edges |\n|---|---|---|---|---|---|\n';
  for (const c of caps) {
    out += `| ${c.spec} | ${c.mode} | ${c.cap} | ${c.transfer_ms ?? '-'} | ${c.materialization_ms ?? '-'} | ${c.skipped ? (c.skipped.join(', ') || '(none)') : (c.error || '-')} |\n`;
  }

  // adaptive decisions detail
  const adapt = caps.filter((c) => c.mode === 'adaptive' && c.decisions);
  if (adapt.length) {
    out += '\n### Adaptive decisions\n\n| spec | decision | alias | ratio | threshold | detail |\n|---|---|---|---|---|---|\n';
    for (const c of adapt) {
      for (const d of c.decisions) {
        const where = d.alias || `${d.target}<-${d.filterBy}`;
        const detail = (d.type === 'mat-skip' || d.type === 'materialize')
          ? `${d.reduced}/${d.original} rows`
          : `${d.keysIn} keys / ${d.targetRows ?? '?'} rows${d.why ? ' (' + d.why + ')' : ''}`;
        out += `| ${c.spec} | ${d.type}${d.why ? '/' + d.why : ''} | ${where} | ${d.ratio ?? '-'} | ${d.threshold ?? '-'} | ${detail} |\n`;
      }
    }
  }

  out += '\n## Where it did NOT help\n\n';
  let any = false;
  for (const sm of summaries) {
    const n = sm.modes.naive || {}, e = sm.modes.exact || {}, a = sm.modes.adaptive || {};
    const overhead = (sm.transfer_ms_by_cap ? sm.transfer_ms_by_cap[Object.keys(sm.transfer_ms_by_cap)[0]] : 0)
      + (sm.materialization_ms_by_cap ? sm.materialization_ms_by_cap[Object.keys(sm.materialization_ms_by_cap)[0]] : 0);
    for (const [name, mode] of [['exact', e], ['adaptive', a]]) {
      if (mode.median == null) continue;
      if (n.median == null && n.dnf) {
        any = true;
        out += `- **${sm.spec} (${name})**: naive was censored (all sampled orders DNF ≥ ${n.lowerBound} ms), so no speedup is claimed; reduced ${name} median ${f(mode.median)} ms + ${Math.round(overhead)} ms overhead.\n`;
      } else if (n.median != null && mode.median + overhead >= n.median) {
        any = true;
        out += `- **${sm.spec} (${name})**: reduced total ${Math.round(mode.median + overhead)} ms >= naive ${f(n.median)} ms (transfer+mat overhead ${Math.round(overhead)} ms, reported separately).\n`;
      }
    }
  }
  if (!any) out += '_No spec failed to improve in this run._\n';

  out += '\n## Per-join-order detail\n\n';
  out += '| spec | order | naive med | exact med | adaptive med | bloom med | transfer | mat | total | equal |\n';
  out += '|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of orders) {
    out += `| ${r.spec} | \`${r.order}\` | ${cell(r.naive)} | ${cell(r.exact)} | ${r.adaptive ? cell(r.adaptive) : '-'} | ${r.bloom ? cell(r.bloom) : '-'} | ${r.transfer_ms} | ${r.materialization_ms} | ${f(r.total_median_ms)} | ${r.equal === null ? 'n/v' : r.equal ? 'ok' : 'FAIL'} |\n`;
  }

  out += '\n## Specs\n\n';
  for (const sp of specs) out += `- **${sp.spec}** — ${sp.valid_orders} valid orders, tested ${sp.tested_orders}; sizes ${JSON.stringify(sp.sizes)}\n`;
  return out;
}

function csv(s) {
  const orders = s.filter((r) => r.kind === 'order');
  let out = 'spec,label,scale,order,naive_median_ms,naive_dnf,exact_median_ms,exact_dnf,adaptive_median_ms,adaptive_dnf,bloom_median_ms,bloom_dnf,transfer_ms,materialization_ms,total_ms,equal\n';
  for (const r of orders) {
    const g = (m) => (m ? [m.median ?? '', m.dnf ? 1 : 0] : ['', '']);
    out += [r.spec, r.label, r.scale, r.order, ...g(r.naive), ...g(r.exact), ...g(r.adaptive), ...g(r.bloom), r.transfer_ms, r.materialization_ms, r.total_median_ms ?? '', r.equal === null ? 'n/v' : r.equal].join(',') + '\n';
  }
  return out;
}

function chartCsv(s) {
  let out = 'spec,order,naive_ms,naive_dnf,exact_ms,adaptive_ms,bloom_ms\n';
  for (const r of s.filter((x) => x.kind === 'order')) {
    out += [r.spec, r.order, r.naive.median ?? '', r.naive.dnf ? 1 : 0, r.exact.median ?? '', r.adaptive ? (r.adaptive.median ?? '') : '', r.bloom ? (r.bloom.median ?? '') : ''].join(',') + '\n';
  }
  return out;
}

function svgChart(s, env) {
  const orders = s.filter((r) => r.kind === 'order');
  const bySpec = {};
  for (const r of orders) (bySpec[r.spec] = bySpec[r.spec] || []).push(r);
  const pick = Object.keys(bySpec).map((k) => {
    const rs = bySpec[k];
    const vals = rs.map((x) => (x.naive.dnf ? x.naive.lowerBound : x.naive.median)).filter((x) => x != null);
    const gapv = vals.length ? Math.max(...vals) / Math.max(1, Math.min(...vals)) : 0;
    return { k, gap: gapv, rs };
  }).sort((a, b) => b.gap - a.gap).slice(0, 2);

  let html = `<html><head><meta charset="utf-8"><title>mongo-pt: time per join order</title></head><body>\n`;
  html += `<h1>mongo-pt — time per join order (naive vs exact vs adaptive)</h1>\n`;
  html += envHeader(env).replace(/^> ?/gm, '').replace(/\*\*/g, '') + '\n';
  for (const { k, rs } of pick) {
    const W = 960, rowH = 30, pad = 60;
    const H = pad + rs.length * rowH + 20;
    const val = (m) => (m ? (m.dnf ? m.lowerBound : m.median) : 0);
    const maxV = Math.max(...rs.flatMap((r) => [val(r.naive), val(r.exact), val(r.adaptive), val(r.bloom)]), 1);
    html += `<h2>${k}</h2><svg width="${W}" height="${H}" font-family="sans-serif" font-size="11">`;
    rs.forEach((r, i) => {
      const y = pad + i * rowH;
      const w = (m) => (val(m) / maxV) * (W - 420);
      html += `<text x="4" y="${y + 12}">${r.order}${r.naive.dnf ? ' [DNF]' : ''}</text>`;
      html += `<rect x="260" y="${y}" width="${w(r.naive)}" height="7" fill="#c0392b"/>`;
      html += `<rect x="260" y="${y + 8}" width="${w(r.exact)}" height="7" fill="#27ae60"/>`;
      if (r.adaptive) html += `<rect x="260" y="${y + 16}" width="${w(r.adaptive)}" height="7" fill="#8e44ad"/>`;
      if (r.bloom) html += `<rect x="260" y="${y + 24}" width="${w(r.bloom)}" height="4" fill="#2980b9"/>`;
      html += `<text x="${264 + Math.max(w(r.naive), w(r.exact))}" y="${y + 12}">n=${r.naive.dnf ? 'DNF' : f(r.naive.median)} e=${f(r.exact.median)}${r.adaptive ? ' a=' + f(r.adaptive.median) : ''}</text>`;
    });
    html += `</svg>\n`;
  }
  html += `<p>red = naive, green = exact-reduced, purple = adaptive-reduced, blue = bloom-reduced. Bars scaled per spec; DNF bars use the timeout lower bound.</p></body></html>\n`;
  return html;
}

function main() {
  if (!fs.existsSync(LOG)) { console.error('no log file', LOG); process.exit(1); }
  const s = readLog();
  const env = s.find((r) => r.kind === 'env');
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(path.join(DOCS, `results${SUFFIX}.md`), md(s, env));
  fs.writeFileSync(path.join(DOCS, `results${SUFFIX}.csv`), envHeader(env).replace(/^> ?/gm, '# ') + csv(s));
  fs.writeFileSync(path.join(DOCS, `results-chart${SUFFIX}.csv`), chartCsv(s));
  fs.writeFileSync(path.join(DOCS, `results-chart${SUFFIX}.html`), svgChart(s, env));
  console.log(`wrote docs/results${SUFFIX}.md, results${SUFFIX}.csv, results-chart${SUFFIX}.csv, results-chart${SUFFIX}.html`);
}
main();
