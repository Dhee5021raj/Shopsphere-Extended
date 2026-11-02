'use strict';
/** Environment metadata printed at the top of every results file. */
const os = require('os');
const { execSync } = require('child_process');
const mongoose = require('mongoose');

function gb(bytes) { return +(bytes / (1024 ** 3)).toFixed(2); }

async function mongodVersion() {
  try {
    const info = await mongoose.connection.db.admin().command({ buildInfo: 1 });
    return { version: info.version, storageEngine: 'wiredTiger' };
  } catch (e) {
    return { version: 'unknown', error: e.message };
  }
}

/** Best-effort list of other processes using > 500 MB (Windows tasklist / POSIX ps). */
function heavyProcesses() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', timeout: 8000 });
      const rows = out.split(/\r?\n/).map((l) => l.split('","').map((s) => s.replace(/"/g, '')));
      return rows
        .map((r) => ({ name: r[0], memKB: parseInt((r[4] || '0').replace(/[^0-9]/g, ''), 10) }))
        .filter((r) => Number.isFinite(r.memKB) && r.memKB > 500 * 1024)
        .map((r) => `${r.name} (${(r.memKB / 1024 / 1024).toFixed(2)} GB)`);
    }
    const out = execSync('ps -eo rss,comm --sort=-rss | head -n 15', { encoding: 'utf8', timeout: 8000 });
    return out.split('\n').slice(1)
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => p.length >= 2 && Number(p[0]) > 500 * 1024)
      .map((p) => `${p.slice(1).join(' ')} (${(Number(p[0]) / 1024 / 1024).toFixed(2)} GB)`);
  } catch (e) {
    return [`unavailable: ${e.message}`];
  }
}

async function collectEnvInfo(extra = {}) {
  const mongo = await mongodVersion();
  return {
    timestamp: new Date().toISOString(),
    mongod_version: mongo.version,
    cpu_count: os.cpus().length,
    cpu_model: (os.cpus()[0] || {}).model,
    total_mem_gb: gb(os.totalmem()),
    free_mem_gb: gb(os.freemem()),
    loadavg: os.loadavg(),
    platform: `${process.platform} ${os.release()}`,
    node_version: process.version,
    heavy_processes: heavyProcesses(),
    ...extra
  };
}

module.exports = { collectEnvInfo, heavyProcesses };
