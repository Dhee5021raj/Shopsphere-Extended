const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Order = require('../models/Order');
const inventoryService = require('../services/inventoryService');
const { byName: specByName } = require('../pt/specs');

// @desc    Get all users
// @route   GET /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle block/unblock user
// @route   PUT /api/admin/users/:id/block
const toggleBlockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot block Admin users' });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({ message: `User status updated to ${user.isBlocked ? 'Blocked' : 'Active'}`, isBlocked: user.isBlocked });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all vendors with approval status
// @route   GET /api/admin/vendors
const getAllVendorsAdmin = async (req, res) => {
  try {
    const vendors = await Vendor.find()
      .populate('user', 'name email avatar isBlocked')
      .sort({ createdAt: -1 });
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update vendor approval status (approved / rejected)
// @route   PUT /api/admin/vendors/:id/status
const updateVendorStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    vendor.status = status;
    await vendor.save();

    res.json({ message: `Vendor store '${vendor.storeName}' status set to ${status}`, vendor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all orders for admin
// @route   GET /api/admin/orders
const getAllOrdersAdmin = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('customer', 'name email')
      .populate('items.vendor', 'storeName')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update overall order status by admin
// @route   PUT /api/admin/orders/:id/status
const updateOrderStatusAdmin = async (req, res) => {
  try {
    const { orderStatus } = req.body;
    const orderId = req.params.id;

    if (orderStatus === 'Cancelled') {
      const result = await inventoryService.cancelAdminOrder({ orderId });
      return res.json({
        message: 'Order status updated successfully',
        order: result.order,
        executionMode: result.executionMode
      });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.orderStatus === 'Cancelled') {
      return res.status(400).json({ message: 'Cannot change status of an order that is already Cancelled' });
    }

    order.orderStatus = orderStatus;
    if (orderStatus === 'Delivered') {
      order.paymentStatus = 'Paid';
      order.items.forEach(item => {
        if (item.status !== 'Cancelled') {
          item.status = 'Delivered';
        }
      });
    }

    await order.save();
    res.json({ message: 'Order status updated successfully', order });
  } catch (error) {
    const status = error.statusCode || error.status || 500;
    res.status(status).json({ message: error.message });
  }
};

const mapLogRecord = (r) => {
  if (!r || typeof r !== 'object') return r;
  const standard_ms = r.standard_ms != null ? r.standard_ms : (r.naive_ms != null ? r.naive_ms : null);
  const naive_ms = r.naive_ms != null ? r.naive_ms : (r.standard_ms != null ? r.standard_ms : null);
  const optimized_ms = r.optimized_ms != null ? r.optimized_ms : (r.reduced_ms != null ? r.reduced_ms : (r.total_ms != null ? r.total_ms : null));
  const reduced_ms = r.reduced_ms != null ? r.reduced_ms : (r.optimized_ms != null ? r.optimized_ms : (r.total_ms != null ? r.total_ms : null));

  const best = r.best && typeof r.best === 'object' ? {
    ...r.best,
    standard_ms: r.best.standard_ms != null ? r.best.standard_ms : (r.best.naive_ms != null ? r.best.naive_ms : null),
    naive_ms: r.best.naive_ms != null ? r.best.naive_ms : (r.best.standard_ms != null ? r.best.standard_ms : null),
    optimized_ms: r.best.optimized_ms != null ? r.best.optimized_ms : (r.best.reduced_ms != null ? r.best.reduced_ms : (r.best.total_ms != null ? r.best.total_ms : null)),
    reduced_ms: r.best.reduced_ms != null ? r.best.reduced_ms : (r.best.optimized_ms != null ? r.best.optimized_ms : (r.best.total_ms != null ? r.best.total_ms : null)),
  } : r.best;

  const worst_case = r.worst_case && typeof r.worst_case === 'object' ? {
    ...r.worst_case,
    standard_ms: r.worst_case.standard_ms != null ? r.worst_case.standard_ms : (r.worst_case.naive_ms != null ? r.worst_case.naive_ms : null),
    naive_ms: r.worst_case.naive_ms != null ? r.worst_case.naive_ms : (r.worst_case.standard_ms != null ? r.worst_case.standard_ms : null),
    optimized_ms: r.worst_case.optimized_ms != null ? r.worst_case.optimized_ms : (r.worst_case.reduced_ms != null ? r.worst_case.reduced_ms : (r.worst_case.total_ms != null ? r.worst_case.total_ms : null)),
    reduced_ms: r.worst_case.reduced_ms != null ? r.worst_case.reduced_ms : (r.worst_case.optimized_ms != null ? r.worst_case.optimized_ms : (r.worst_case.total_ms != null ? r.worst_case.total_ms : null)),
  } : r.worst_case;

  const desc = r.description || (r.spec && specByName && specByName[r.spec] ? specByName[r.spec].description : '');

  return {
    ...r,
    standard_ms,
    optimized_ms,
    naive_ms,
    reduced_ms,
    best,
    worst_case,
    ...(desc ? { description: desc } : {})
  };
};

// @desc    Get the last 100 mongo-pt records (shadow + benchmark log)
// @route   GET /api/admin/pt-log
const getPtLog = async (req, res) => {
  try {
    const logFile = process.env.PT_LOG || path.join(__dirname, '..', 'logs', 'pt-log.jsonl');
    if (!fs.existsSync(logFile)) return res.json([]);
    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    const records = [];
    for (const line of lines.slice(-100)) {
      try {
        const raw = JSON.parse(line);
        records.push(mapLogRecord(raw));
      } catch (_) { /* skip malformed */ }
    }
    res.json(records.reverse()); // newest first
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Is a mongo-pt measurement running right now, and which phase?
// @route   GET /api/admin/pt-status
//
// The shadow child writes `.pt-shadow-status.json` with per-phase progress
// (optimized runs first, then standard) and its pid, so the UI can show
// "OPTIMIZED FINISHED" while the standard side is still measuring. Liveness is
// verified via `process.kill(pid, 0)` and the file's updatedAt, so a crashed
// child can never keep the indicator running forever (the old bug that stuck
// "MEASUREMENT RUNNING · Ns elapsed" on screen for minutes).
const getPtStatus = async (req, res) => {
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    const statusFile = path.join(logDir, '.pt-shadow-status.json');
    const STALE_MS = 15 * 60 * 1000; // hard cap: a phantom run is never shown past this

    const isAlive = (pid) => {
      try { process.kill(pid, 0); return true; } catch (_) { return false; }
    };
    const shape = (p) => p ? {
      phase: p.phase || (p.running ? 'running' : p.done ? 'done' : 'idle'),
      running: p.phase === 'running' || p.running === true,
      done: p.phase === 'done' || p.done === true,
      startedAt: p.startedAt || null,
      finishedAt: p.finishedAt || null,
      ms: p.ms != null ? p.ms : null
    } : null;

    // 1) Preferred source: the live status file written by scripts/ptShadow.js.
    let rawStatus = null;
    let statusUnreadable = false; // exists but empty/torn JSON (child mid-write or crashed write)
    try {
      rawStatus = fs.readFileSync(statusFile, 'utf8');
    } catch (e) {
      if (e && e.code !== 'ENOENT') statusUnreadable = true; // exists but unreadable
    }
    let rec = null;
    if (rawStatus !== null) {
      try { rec = JSON.parse(rawStatus); } catch (_) { statusUnreadable = true; }
    }

    if (statusUnreadable) {
      // Do NOT fall through to the lock-file fallback here. A live child keeps
      // a fresh lock for its whole run (including post-run housekeeping), so a
      // torn/partial status read racing the child's writeFileSync would flip
      // the response to "running: true" from the lock — restarting the UI's
      // elapsed timer even though both comparisons were already done. One idle
      // poll until the file is readable again is harmless; a ticking timer is
      // the bug. (1s max: the child writes ~300 bytes per phase transition.)
      return res.json({
        running: false,
        startedAt: null,
        standard: null,
        optimized: null,
        naive: null,
        reduced: null,
        staleAfterMin: STALE_MS / 60000,
        typicalRunSeconds: 60
      });
    }

    if (rec) {
      const updatedAtMs = new Date(rec.updatedAt || rec.startedAt).getTime();
      const fresh = Date.now() - updatedAtMs < STALE_MS && isAlive(rec.pid);

      const std = shape(rec.standard || rec.naive);
      const opt = shape(rec.optimized || rec.reduced);
      const naive = shape(rec.naive || rec.standard);
      const reduced = shape(rec.reduced || rec.optimized);

      const phases = {
        standard: std,
        optimized: opt,
        naive: naive,
        reduced: reduced
      };

      // A phase belongs to a live run only if the whole record is fresh:
      // gate every phase's `running` on it so a dead child cannot expose a
      // phantom "RUNNING" phase even when the overall flag is false.
      if (!fresh) {
        for (const k of ['standard', 'optimized', 'naive', 'reduced']) {
          if (phases[k]) {
            phases[k].running = false;
            if (phases[k].phase === 'running') phases[k].phase = 'idle';
          }
        }
      }
      // A run is only "running" while its phases are NOT all finished. The
      // previous check (`p.running || p.done`) also counted DONE phases, so
      // between the child's last `endPhase` and its file cleanup (which on the
      // full dataset includes several minutes of extra timing lines) the UI
      // kept "MEASUREMENT RUNNING · Ns elapsed" ticking even though both
      // comparisons had already completed.
      const allDone = [std, opt].every((p) => !p || p.done);
      const isRunning = fresh && !allDone;
      return res.json({
        running: isRunning,
        startedAt: rec.startedAt || null,
        ...phases,
        staleAfterMin: STALE_MS / 60000,
        typicalRunSeconds: 60
      });
    }
    // (fall through when there is no status file at all)

    // 2) Legacy fallback (older shadow child without a status file): the lock.
    // The lock may carry the child's pid (written by the middleware after
    // spawn): when that pid is dead — a child killed before its cleanup — the
    // run must report idle instead of leaving "running" (and the UI's elapsed
    // timer) ticking for the full STALE_MS window.
    let running = false;
    let startedAt = null;
    try {
      const lockPath = path.join(logDir, '.pt-shadow.lock');
      const stat = fs.statSync(lockPath);
      const fresh = Date.now() - stat.mtimeMs < STALE_MS;
      let lockPid = null;
      let lockT = null;
      try {
        const raw = fs.readFileSync(lockPath, 'utf8').trim();
        if (raw.startsWith('{')) {
          const j = JSON.parse(raw);
          if (j && j.pid != null) lockPid = Number(j.pid);
          if (j && j.t != null && !Number.isNaN(new Date(j.t).getTime())) lockT = j.t;
        }
      } catch (_) { /* plain-text timestamp lock (legacy shape) */ }
      const pidDead = lockPid != null && !isAlive(lockPid);
      if (fresh && !pidDead) {
        running = true;
        startedAt = lockT != null ? new Date(lockT).toISOString() : new Date(stat.mtimeMs).toISOString();
      }
    } catch (_) { /* no lock file → idle */ }
    res.json({
      running,
      startedAt,
      standard: null,
      optimized: null,
      naive: null,
      reduced: null,
      staleAfterMin: STALE_MS / 60000,
      typicalRunSeconds: 60
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Compute aggregate performance metrics from the pt-log for the dashboard
// @route   GET /api/admin/pt-metrics
//
// Metrics derived from ALL shadow records (live standard-vs-optimized comparisons):
//   - avgStandardMs / avgOptimizedMs     : mean latency per side (ms)
//   - throughputStandard / throughputOptimized : queries per second (1000 / avgMs)
//   - avgSpeedup / maxSpeedup / minSpeedup : speedup factor distribution
//   - robustnessGap               : max_standard_ms / min_standard_ms (order-sensitivity)
//   - winRate                     : % of runs where PT was faster (speedup > 1)
//   - avgOverheadPct              : mean transfer+mat overhead as % of optimized time
//   - avgTransferMs / avgMatMs    : mean transfer and materialisation costs
//   - perSpecStats                : per-spec breakdown with description & metrics
//   - totalRuns                   : total shadow records counted
const getPtMetrics = async (req, res) => {
  try {
    const logFile = process.env.PT_LOG || path.join(__dirname, '..', 'logs', 'pt-log.jsonl');
    if (!fs.existsSync(logFile)) return res.json({ totalRuns: 0, noData: true });

    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    const shadows = [];
    for (const line of lines) {
      try {
        const r = JSON.parse(line);
        // Only count shadow records that have both timing sides measured (supporting standard/optimized and naive/reduced)
        const hasStd = r.standard_ms != null || r.naive_ms != null;
        const hasOpt = r.optimized_ms != null || r.reduced_ms != null || r.total_ms != null;
        if (r.kind === 'shadow' && hasStd && hasOpt) {
          shadows.push(r);
        }
      } catch (_) { /* skip malformed */ }
    }

    if (shadows.length === 0) return res.json({ totalRuns: 0, noData: true });

    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const median = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
    };

    const standardTimes = shadows.map((r) => r.naive_ms != null ? r.naive_ms : r.standard_ms);
    const optimizedTimes = shadows.map((r) => r.reduced_ms != null ? r.reduced_ms : (r.optimized_ms ?? r.total_ms));
    const speedups      = shadows.filter((r) => r.speedup != null).map((r) => r.speedup);
    const overheads     = shadows.filter((r) => r.transfer_overhead_pct != null).map((r) => r.transfer_overhead_pct);
    const transfers     = shadows.filter((r) => r.transfer_ms != null).map((r) => r.transfer_ms);
    const mats          = shadows.filter((r) => r.materialization_ms != null).map((r) => r.materialization_ms);

    const avgStandardMs   = avg(standardTimes);
    const avgOptimizedMs = avg(optimizedTimes);
    const medStandardMs   = median(standardTimes);
    const medOptimizedMs = median(optimizedTimes);

    // Throughput = how many such queries can be executed per second
    const throughputStandard  = avgStandardMs  > 0 ? parseFloat((1000 / avgStandardMs).toFixed(4))  : null;
    const throughputOptimized = avgOptimizedMs > 0 ? parseFloat((1000 / avgOptimizedMs).toFixed(4)) : null;

    // Backward-compatible aliases
    const avgNaiveMs   = avgStandardMs;
    const avgReducedMs = avgOptimizedMs;
    const medNaiveMs   = medStandardMs;
    const medReducedMs = medOptimizedMs;
    const throughputNaive   = throughputStandard;
    const throughputReduced = throughputOptimized;

    // Robustness gap: measures how sensitive standard/naive is to join order (max/min standard time)
    const robustnessGap = standardTimes.length >= 2 && Math.min(...standardTimes) > 0
      ? parseFloat((Math.max(...standardTimes) / Math.min(...standardTimes)).toFixed(2))
      : null;

    // Win rate: fraction of runs where PT reduced latency
    const wins    = shadows.filter((r) => (r.speedup ?? 0) > 1).length;
    const winRate = parseFloat(((wins / shadows.length) * 100).toFixed(1));

    // Per-spec breakdown
    const specMap = {};
    for (const r of shadows) {
      const s = r.spec || 'unknown';
      if (!specMap[s]) {
        specMap[s] = {
          descriptions: [],
          standardTimes: [],
          optimizedTimes: [],
          speedups: [],
          overheads: [],
          transfers: [],
          mats: [],
          timeline: []
        };
      }
      if (r.description) specMap[s].descriptions.push(r.description);
      const std = r.naive_ms != null ? r.naive_ms : r.standard_ms;
      const opt = r.reduced_ms != null ? r.reduced_ms : (r.optimized_ms ?? r.total_ms);
      specMap[s].standardTimes.push(std);
      specMap[s].optimizedTimes.push(opt);
      if (r.speedup != null) specMap[s].speedups.push(r.speedup);
      if (r.transfer_overhead_pct != null) specMap[s].overheads.push(r.transfer_overhead_pct);
      if (r.transfer_ms != null) specMap[s].transfers.push(r.transfer_ms);
      if (r.materialization_ms != null) specMap[s].mats.push(r.materialization_ms);
      specMap[s].timeline.push({
        ts: r.ts,
        t: r.ts,
        spec: r.spec,
        standard_ms: std,
        optimized_ms: opt,
        naive_ms: std,
        reduced_ms: opt,
        speedup: r.speedup,
        transfer_ms: r.transfer_ms,
        materialization_ms: r.materialization_ms
      });
    }

    const perSpecStats = Object.entries(specMap).map(([spec, d]) => {
      const specWins = d.speedups.filter((sp) => sp > 1).length;
      const specWinRate = d.speedups.length > 0 ? parseFloat(((specWins / d.speedups.length) * 100).toFixed(1)) : 0;
      const specGap = d.standardTimes.length >= 2 && Math.min(...d.standardTimes) > 0
        ? parseFloat((Math.max(...d.standardTimes) / Math.min(...d.standardTimes)).toFixed(2))
        : null;

      const avgStd = avg(d.standardTimes);
      const avgOpt = avg(d.optimizedTimes);
      const medStd = median(d.standardTimes);
      const medOpt = median(d.optimizedTimes);
      const tpStd = avgStd > 0 ? parseFloat((1000 / avgStd).toFixed(4)) : null;
      const tpOpt = avgOpt > 0 ? parseFloat((1000 / avgOpt).toFixed(4)) : null;

      const description = (specByName && specByName[spec]?.description)
        || d.descriptions.find(Boolean)
        || (spec.startsWith('live_search') ? `Live search query (${spec.replace(/^live_search_/, '')})` : `Benchmark query spec ${spec}`);

      return {
        spec,
        description,
        runs: d.standardTimes.length,
        wins: specWins,
        winRate: specWinRate,
        // Updated terminology
        avgStandardMs: parseFloat(avgStd.toFixed(1)),
        avgOptimizedMs: parseFloat(avgOpt.toFixed(1)),
        medStandardMs: parseFloat(medStd.toFixed(1)),
        medOptimizedMs: parseFloat(medOpt.toFixed(1)),
        throughputStandard: tpStd,
        throughputOptimized: tpOpt,
        // Legacy aliases
        avgNaiveMs: parseFloat(avgStd.toFixed(1)),
        medNaiveMs: parseFloat(medStd.toFixed(1)),
        avgReducedMs: parseFloat(avgOpt.toFixed(1)),
        medReducedMs: parseFloat(medOpt.toFixed(1)),
        throughputNaive: tpStd,
        throughputReduced: tpOpt,
        avgSpeedup: d.speedups.length ? parseFloat(avg(d.speedups).toFixed(2)) : null,
        maxSpeedup: d.speedups.length ? parseFloat(Math.max(...d.speedups).toFixed(2)) : null,
        minSpeedup: d.speedups.length ? parseFloat(Math.min(...d.speedups).toFixed(2)) : null,
        robustnessGap: specGap,
        avgOverheadPct: d.overheads.length ? parseFloat(avg(d.overheads).toFixed(1)) : null,
        avgTransferMs: d.transfers.length ? parseFloat(avg(d.transfers).toFixed(1)) : null,
        avgMatMs: d.mats.length ? parseFloat(avg(d.mats).toFixed(1)) : null,
        timeline: d.timeline.slice(-20)
      };
    });

    // Timeline for the chart: last 20 shadow runs, oldest→newest
    const timeline = shadows.slice(-20).map((r) => {
      const std = r.naive_ms != null ? r.naive_ms : r.standard_ms;
      const opt = r.reduced_ms != null ? r.reduced_ms : (r.optimized_ms ?? r.total_ms);
      return {
        ts:           r.ts,
        t:            r.ts,
        spec:         r.spec,
        standard_ms:  std,
        optimized_ms: opt,
        naive_ms:     std,
        reduced_ms:   opt,
        speedup:      r.speedup,
        transfer_ms:  r.transfer_ms,
        materialization_ms: r.materialization_ms,
      };
    });

    res.json({
      totalRuns:          shadows.length,
      wins,
      winRate,
      // Updated terminology
      avgStandardMs:      parseFloat(avgStandardMs.toFixed(1)),
      avgOptimizedMs:     parseFloat(avgOptimizedMs.toFixed(1)),
      medStandardMs:      parseFloat(medStandardMs.toFixed(1)),
      medOptimizedMs:     parseFloat(medOptimizedMs.toFixed(1)),
      throughputStandard,
      throughputOptimized,
      // Legacy aliases
      avgNaiveMs:         parseFloat(avgNaiveMs.toFixed(1)),
      avgReducedMs:       parseFloat(avgReducedMs.toFixed(1)),
      medNaiveMs:         parseFloat(medNaiveMs.toFixed(1)),
      medReducedMs:       parseFloat(medReducedMs.toFixed(1)),
      throughputNaive,
      throughputReduced,
      avgSpeedup:         speedups.length ? parseFloat(avg(speedups).toFixed(2)) : null,
      maxSpeedup:         speedups.length ? parseFloat(Math.max(...speedups).toFixed(2)) : null,
      minSpeedup:         speedups.length ? parseFloat(Math.min(...speedups).toFixed(2)) : null,
      robustnessGap,
      avgOverheadPct:     overheads.length ? parseFloat(avg(overheads).toFixed(1)) : null,
      avgTransferMs:      transfers.length ? parseFloat(avg(transfers).toFixed(1)) : null,
      avgMatMs:           mats.length      ? parseFloat(avg(mats).toFixed(1))      : null,
      perSpecStats,
      timeline,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllUsers,
  toggleBlockUser,
  getAllVendorsAdmin,
  updateVendorStatus,
  getAllOrdersAdmin,
  updateOrderStatusAdmin,
  getPtLog,
  getPtStatus,
  getPtMetrics,
};
