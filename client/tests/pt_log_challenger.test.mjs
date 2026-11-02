import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.resolve(__dirname, '..');

let ptBundle;

before(async () => {
  const { build } = await import(pathToFileURL(path.join(CLIENT_DIR, 'node_modules/vite/dist/node/index.js')).href);
  const res = await build({
    root: CLIENT_DIR,
    build: {
      ssr: true,
      write: false,
      rollupOptions: {
        input: path.join(CLIENT_DIR, 'src/pages/PtLogPage.jsx')
      }
    }
  });

  const bundleFile = path.join(CLIENT_DIR, 'tests', '.tmp_bundle.mjs');
  fs.mkdirSync(path.dirname(bundleFile), { recursive: true });
  fs.writeFileSync(bundleFile, res.output[0].code, 'utf8');

  try {
    ptBundle = await import(pathToFileURL(bundleFile).href);
  } finally {
    try { fs.unlinkSync(bundleFile); } catch (_) {}
  }
});

// Helper to render JSX element to normalized HTML string (stripping React SSR comment markers)
function render(element) {
  return ReactDOMServer.renderToString(element).replace(/<!--.*?-->/g, '');
}

describe('Challenger M3-1: Static & Terminology Stress Tests', () => {
  test('1.1 Zero user-facing occurrences of "naive" or "reduced" in PtLogPage.jsx', () => {
    const code = fs.readFileSync(path.join(CLIENT_DIR, 'src/pages/PtLogPage.jsx'), 'utf8');
    // Check that any occurrence of naive or reduced is strictly a data property accessor (.naive, .reduced)
    const lines = code.split('\n');
    const violations = [];
    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      if (lower.includes('naive') || lower.includes('reduced')) {
        // Allow fallback reads like .naive_ms, .reduced_ms, runStatus.naive, runStatus.reduced
        const isFallbackRead = line.includes('.naive') || line.includes('.reduced') ||
          line.includes('throughputNaive') || line.includes('throughputReduced') ||
          line.includes('avgNaiveMs') || line.includes('avgReducedMs') ||
          line.includes('medNaiveMs') || line.includes('medReducedMs') ||
          line.includes('reduced-motion') || line.includes('motion-safe');
        if (!isFallbackRead) {
          violations.push({ line: idx + 1, content: line.trim() });
        }
      }
    });
    assert.deepEqual(violations, [], `Found user-facing deprecated terminology: ${JSON.stringify(violations)}`);
  });

  test('1.2 Zero user-facing occurrences of "naive" or "reduced" in ProductDiscoveryPage.jsx', () => {
    const code = fs.readFileSync(path.join(CLIENT_DIR, 'src/pages/ProductDiscoveryPage.jsx'), 'utf8');
    const lines = code.split('\n');
    const violations = [];
    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      if (lower.includes('naive') || lower.includes('reduced')) {
        const isFallbackRead = line.includes('.naive') || line.includes('.reduced') || line.includes('reduced-motion');
        if (!isFallbackRead) {
          violations.push({ line: idx + 1, content: line.trim() });
        }
      }
    });
    assert.deepEqual(violations, [], `Found user-facing deprecated terminology in ProductDiscoveryPage: ${JSON.stringify(violations)}`);
  });
});

describe('Challenger M3-1: Canonical Query Metadata & Description Oracle', () => {
  test('2.1 All 7 canonical specs exist in SPEC_METADATA with scholarly fields', () => {
    const { SPEC_METADATA } = ptBundle;
    const requiredSpecs = [
      'rare_category_revenue_7d',
      'common_category_revenue_365d',
      'vendor_scoped_revenue_90d',
      'user_scoped_spend_30d',
      'low_rating_reviews_by_category',
      'vendor_category_revenue_365d',
      'user_vendor_category_spend_30d'
    ];

    for (const spec of requiredSpecs) {
      assert.ok(SPEC_METADATA[spec], `SPEC_METADATA missing spec ${spec}`);
      assert.ok(SPEC_METADATA[spec].title, `SPEC_METADATA.${spec} missing title`);
      assert.ok(SPEC_METADATA[spec].shortDesc, `SPEC_METADATA.${spec} missing shortDesc`);
      assert.ok(SPEC_METADATA[spec].computation, `SPEC_METADATA.${spec} missing computation`);
      assert.ok(SPEC_METADATA[spec].joinOrder, `SPEC_METADATA.${spec} missing joinOrder`);
      assert.ok(SPEC_METADATA[spec].selectivity, `SPEC_METADATA.${spec} missing selectivity`);
      assert.ok(Array.isArray(SPEC_METADATA[spec].relations), `SPEC_METADATA.${spec} relations must be an array`);
      assert.ok(SPEC_METADATA[spec].relations.length >= 4, `SPEC_METADATA.${spec} relations must have at least 4 items`);
    }
  });

  test('2.2 getCanonicalQueryInfo handles dynamic live search specs', () => {
    const { getCanonicalQueryInfo } = ptBundle;
    const info = getCanonicalQueryInfo('live_search_laptop');
    assert.equal(info.title, 'Live Search Query (Rare Category Revenue)');
    assert.equal(info.isLiveVariant, true);
    assert.ok(info.computation.includes('cat ⋈ p ⋈ oi ⋈ o ⋈ v'));
    assert.ok(info.shortDesc.includes('rare category products'));
  });

  test('2.3 getCanonicalQueryInfo handles null, undefined, unknown specs without throwing', () => {
    const { getCanonicalQueryInfo } = ptBundle;
    const nullInfo = getCanonicalQueryInfo(null);
    assert.equal(nullInfo.title, 'Benchmark Query');
    assert.ok(nullInfo.shortDesc.length > 0);

    const undefInfo = getCanonicalQueryInfo(undefined);
    assert.equal(undefInfo.title, 'Benchmark Query');

    const unknownInfo = getCanonicalQueryInfo('custom_ad_hoc_spec_123');
    assert.equal(unknownInfo.title, 'custom_ad_hoc_spec_123');

    const objWithDesc = getCanonicalQueryInfo({ spec: 'custom_spec', description: 'Explicit computation description' });
    assert.equal(objWithDesc.shortDesc, 'Explicit computation description');
    assert.equal(objWithDesc.computation, 'Explicit computation description');
  });
});

describe('Challenger M3-1: Trigger Context Decoupling', () => {
  test('3.1 Parses product search trigger', () => {
    const { getTriggerContext } = ptBundle;
    const ctx = getTriggerContext({
      kind: 'shadow',
      trigger: '/api/products?search=gaming+mouse&category=Accessories'
    });
    assert.equal(ctx.label, 'Product Search');
    assert.equal(ctx.action, 'Searched for "gaming mouse"');
    assert.equal(ctx.searchTerm, 'gaming mouse');
  });

  test('3.2 Parses category browse trigger', () => {
    const { getTriggerContext } = ptBundle;
    const ctx = getTriggerContext({
      kind: 'shadow',
      trigger: '/api/products?category=Electronics'
    });
    assert.equal(ctx.label, 'Category Browse');
    assert.equal(ctx.action, 'Browsed category "Electronics"');
  });

  test('3.3 Handles non-shadow benchmark records', () => {
    const { getTriggerContext } = ptBundle;
    const ctx = getTriggerContext({ kind: 'order', trigger: null });
    assert.equal(ctx.label, 'Benchmark (order)');
    assert.equal(ctx.action, 'Direct benchmark execution');
  });

  test('3.4 Adversarial trigger inputs (null, malformed string, number)', () => {
    const { getTriggerContext } = ptBundle;
    const nullCtx = getTriggerContext(null);
    assert.equal(nullCtx.kind, 'benchmark');

    const malformedCtx = getTriggerContext({ kind: 'shadow', trigger: 'not a valid url && !!??' });
    assert.equal(malformedCtx.kind, 'api');
  });
});

describe('Challenger M3-1: Component Rendering & Edge Cases', () => {
  test('4.1 LatencyThroughputCell: normal latency (500ms)', () => {
    const { LatencyThroughputCell } = ptBundle;
    const htmlStd = render(React.createElement(LatencyThroughputCell, { ms: 500, engine: 'standard' }));
    assert.ok(htmlStd.includes('500 ms'), 'Should display 500 ms');
    assert.ok(htmlStd.includes('2.00 q/s'), 'Should display 2.00 q/s (1000/500)');
    assert.ok(htmlStd.includes('text-rose-600'), 'Standard engine should use rose color');

    const htmlOpt = render(React.createElement(LatencyThroughputCell, { ms: 250, engine: 'optimized' }));
    assert.ok(htmlOpt.includes('250 ms'));
    assert.ok(htmlOpt.includes('4.00 q/s'));
    assert.ok(htmlOpt.includes('text-emerald-600'), 'Optimized engine should use emerald color');
  });

  test('4.2 LatencyThroughputCell: zero latency edge case (ms = 0) avoids division by zero', () => {
    const { LatencyThroughputCell } = ptBundle;
    const html = render(React.createElement(LatencyThroughputCell, { ms: 0, engine: 'standard' }));
    assert.ok(html.includes('0 ms'));
    assert.ok(!html.includes('Infinity'), 'Must NOT render Infinity q/s on 0ms');
    assert.ok(html.includes('—'), 'Throughput should fallback to —');
  });

  test('4.3 LatencyThroughputCell: null/undefined latency', () => {
    const { LatencyThroughputCell } = ptBundle;
    const htmlNull = render(React.createElement(LatencyThroughputCell, { ms: null }));
    assert.ok(!htmlNull.includes('NaN'));
    const htmlUndef = render(React.createElement(LatencyThroughputCell, { ms: undefined }));
    assert.ok(!htmlUndef.includes('NaN'));
  });

  test('4.4 SpeedupBadge: acceleration, parity, regression, and edge cases', () => {
    const { SpeedupBadge } = ptBundle;

    // Acceleration (>1.05x)
    const htmlAcc = render(React.createElement(SpeedupBadge, { speedup: 2.45 }));
    assert.ok(htmlAcc.includes('2.45×'));
    assert.ok(htmlAcc.includes('⚡'));
    assert.ok(htmlAcc.includes('bg-emerald-100'));

    // Parity (~1.0x)
    const htmlPar = render(React.createElement(SpeedupBadge, { speedup: 1.01 }));
    assert.ok(htmlPar.includes('~1.01×'));
    assert.ok(htmlPar.includes('bg-slate-100'));

    // Regression (<0.95x)
    const htmlReg = render(React.createElement(SpeedupBadge, { speedup: 0.82 }));
    assert.ok(htmlReg.includes('0.82×'));
    assert.ok(htmlReg.includes('🔻'));
    assert.ok(htmlReg.includes('bg-rose-100'));

    // Zero speedup
    const htmlZero = render(React.createElement(SpeedupBadge, { speedup: 0 }));
    assert.ok(htmlZero.includes('0.00×'));

    // Null / Undefined
    const htmlNull = render(React.createElement(SpeedupBadge, { speedup: null }));
    assert.ok(htmlNull.includes('—'));
    const htmlUndef = render(React.createElement(SpeedupBadge, { speedup: undefined }));
    assert.ok(htmlUndef.includes('—'));

    // String coercion
    const htmlStr = render(React.createElement(SpeedupBadge, { speedup: '1.75' }));
    assert.ok(htmlStr.includes('1.75×'));
  });

  test('4.5 VerificationBadge: equal with checksum, missing checksum, and mismatch', () => {
    const { VerificationBadge } = ptBundle;

    // Equal with CRC32 checksum
    const htmlEq = render(React.createElement(VerificationBadge, {
      equal: true,
      checksum: '0xA1B2C3D4',
      rows: 50
    }));
    assert.ok(htmlEq.includes('Equal (ok)'));
    assert.ok(htmlEq.includes('0xA1B2C3D4'));
    assert.ok(htmlEq.includes('bg-emerald-100'));

    // Equal missing checksum
    const htmlNoCrc = render(React.createElement(VerificationBadge, {
      equal: true,
      checksum: null,
      rows: 10
    }));
    assert.ok(htmlNoCrc.includes('Equal (ok)'));
    assert.ok(!htmlNoCrc.includes('0x'));

    // Mismatch
    const htmlMismatch = render(React.createElement(VerificationBadge, {
      equal: false,
      mismatch: 'Row count diff: 50 vs 48'
    }));
    assert.ok(htmlMismatch.includes('MISMATCH'));
    assert.ok(htmlMismatch.includes('Row count diff: 50 vs 48'));
    assert.ok(htmlMismatch.includes('bg-rose-100'));

    // Unevaluated protocol record
    const htmlNull = render(React.createElement(VerificationBadge, { equal: null }));
    assert.ok(htmlNull.includes('n/v'));
  });

  test('4.6 OverheadCell: percentage, breakdown, clamp, and null safety', () => {
    const { OverheadCell } = ptBundle;

    // Normal
    const htmlNorm = render(React.createElement(OverheadCell, {
      transferMs: 120,
      matMs: 45,
      overheadPct: 42.5
    }));
    assert.ok(htmlNorm.includes('43%'));
    assert.ok(htmlNorm.includes('T: 120 ms'));
    assert.ok(htmlNorm.includes('M: 45 ms'));

    // Zero
    const htmlZero = render(React.createElement(OverheadCell, {
      transferMs: 0,
      matMs: 0,
      overheadPct: 0
    }));
    assert.ok(htmlZero.includes('0%'));
    assert.ok(htmlZero.includes('T: 0 ms'));
    assert.ok(htmlZero.includes('M: 0 ms'));

    // Clamped over 100%
    const htmlOver = render(React.createElement(OverheadCell, {
      transferMs: 500,
      matMs: 500,
      overheadPct: 150
    }));
    assert.ok(htmlOver.includes('width:100%'));

    // Null safety
    const htmlNull = render(React.createElement(OverheadCell, {
      transferMs: null,
      matMs: null,
      overheadPct: null
    }));
    assert.ok(htmlNull.includes('T: —'));
    assert.ok(htmlNull.includes('M: —'));
  });
});

describe('Challenger M3-1: Accessibility & W3C ARIA Standards', () => {
  test('5.1 RealTimeStatusCard exposes accessible role="status", aria-live="polite", and aria-atomic="true"', () => {
    const { RealTimeStatusCard } = ptBundle;
    const html = render(React.createElement(RealTimeStatusCard, {
      runStatus: { running: false },
      latestRecord: { speedup: 1.85, checksum: '0x1234' }
    }));

    assert.ok(html.includes('role="status"'), 'Must have role="status"');
    assert.ok(html.includes('aria-live="polite"'), 'Must have aria-live="polite"');
    assert.ok(html.includes('aria-atomic="true"'), 'Must have aria-atomic="true"');
    assert.ok(html.includes('class="sr-only"'), 'Must have screen-reader summary');
    assert.ok(html.includes('System Idle — Ready'), 'Idle label present');
  });

  test('5.2 RealTimeStatusCard stepped 3-phase progression layout and terminology', () => {
    const { RealTimeStatusCard } = ptBundle;
    const html = render(React.createElement(RealTimeStatusCard, {
      runStatus: {
        running: true,
        startedAt: new Date(Date.now() - 2500).toISOString(),
        optimized: { running: false, done: true, ms: 140 },
        standard: { running: true, startedAt: new Date(Date.now() - 1000).toISOString() }
      },
      nowTick: Date.now()
    }));

    // Check 3 stepped phases
    assert.ok(html.includes('Phase 1: Optimized (mongo-pt)'));
    assert.ok(html.includes('Phase 2: Standard MongoDB'));
    assert.ok(html.includes('Phase 3: Verification &amp; Parity') || html.includes('Phase 3: Verification & Parity'));

    // Phase 1 is done
    assert.ok(html.includes('Done · 140 ms'));
    // Phase 2 is running
    assert.ok(html.includes('Running ·'));
    // Active status header
    assert.ok(html.includes('Real-Time Query Optimization In Progress'));
    assert.ok(html.includes('Execution Active'));
  });

  test('5.3 RealTimeStatusCard supports legacy backend keys (reduced, naive)', () => {
    const { RealTimeStatusCard } = ptBundle;
    const html = render(React.createElement(RealTimeStatusCard, {
      runStatus: {
        running: true,
        startedAt: new Date().toISOString(),
        reduced: { done: true, ms: 110 },
        naive: { running: true, startedAt: new Date().toISOString() }
      }
    }));

    assert.ok(html.includes('Phase 1: Optimized (mongo-pt)'));
    assert.ok(html.includes('Done · 110 ms'));
    assert.ok(html.includes('Phase 2: Standard MongoDB'));
  });

  test('5.4 Motion safety check: animations respect prefers-reduced-motion', () => {
    const code = fs.readFileSync(path.join(CLIENT_DIR, 'src/pages/PtLogPage.jsx'), 'utf8');
    const animationMatches = code.match(/animate-(pulse|ping|spin)/g) || [];
    assert.ok(animationMatches.length > 0, 'Animations must exist');

    // Verify motion-safe prefix is used
    const motionSafeMatches = code.match(/motion-safe:animate-(pulse|ping|spin)/g) || [];
    assert.ok(motionSafeMatches.length >= 6, `Expected at least 6 motion-safe animation classes, found ${motionSafeMatches.length}`);
  });

  test('5.5 Table keyboard accessibility: wrappers have tabIndex={0}, role="region", and aria-label', () => {
    const code = fs.readFileSync(path.join(CLIENT_DIR, 'src/pages/PtLogPage.jsx'), 'utf8');

    // Summary table wrapper check
    assert.ok(code.includes('aria-label="Query Performance Metrics Summary Table"'), 'Summary table must have accessible aria-label');
    assert.ok(code.includes('aria-label="mongo-pt Execution Log Table"'), 'Log table must have accessible aria-label');

    const tabIndexMatches = code.match(/tabIndex=\{0\}/g) || [];
    assert.equal(tabIndexMatches.length, 2, 'Both scrollable table containers must have tabIndex={0}');

    const roleRegionMatches = code.match(/role="region"/g) || [];
    assert.equal(roleRegionMatches.length, 2, 'Both scrollable table containers must have role="region"');
  });
});

describe('Challenger M3-1: Full Component Tree & Rendering Edge Cases', () => {
  test('6.1 RealTimeStatusCard with null runStatus and null latestRecord renders default idle state', () => {
    const { RealTimeStatusCard } = ptBundle;
    const html = render(React.createElement(RealTimeStatusCard, {
      runStatus: null,
      latestRecord: null
    }));
    assert.ok(html.includes('System Idle — Ready'));
    assert.ok(html.includes('Queued'));
  });

  test('6.2 RealTimeStatusCard with latestRecord missing checksum falls back to "Parity Verified"', () => {
    const { RealTimeStatusCard } = ptBundle;
    const html = render(React.createElement(RealTimeStatusCard, {
      runStatus: { running: false },
      latestRecord: { speedup: 2.1, checksum: null, optimized_ms: 100, standard_ms: 210 }
    }));
    assert.ok(html.includes('Parity Verified'));
    assert.ok(!html.includes('Parity ok · null'));
  });

  test('6.3 RealTimeStatusCard with active runStatus but invalid startedAt date string', () => {
    const { RealTimeStatusCard } = ptBundle;
    const html = render(React.createElement(RealTimeStatusCard, {
      runStatus: {
        running: true,
        startedAt: 'not-a-valid-date',
        optimized: { running: true }
      }
    }));
    assert.ok(html.includes('Real-Time Query Optimization In Progress'));
    // Does not crash
  });

  test('6.4 Full PtLogPage renders cleanly wrapped in MemoryRouter', async () => {
    const { MemoryRouter } = await import('react-router-dom');
    const PtLogPage = ptBundle.default;
    assert.ok(typeof PtLogPage === 'function', 'PtLogPage must be exported as default component');

    const html = render(
      React.createElement(MemoryRouter, null,
        React.createElement(PtLogPage, { onToast: () => {} })
      )
    );

    // Initial render shows header, status card, loading spinners
    assert.ok(html.includes('mongo-pt Shadow Log'));
    assert.ok(html.includes('Academic showcase for semi-join reduction query optimization on MongoDB.'));
    assert.ok(html.includes('Query Optimization Engine Status'));
    assert.ok(html.includes('Computing performance metrics…'));
  });
});

