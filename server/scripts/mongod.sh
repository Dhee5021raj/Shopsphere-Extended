#!/usr/bin/env bash
# Launch a persistent, disk-backed real mongod for the mongo-pt benchmark.
#
# We deliberately run the *real* mongod server binary as a standalone process.
# mongodb-memory-server is only used at `npm install` time to DOWNLOAD that
# binary; the library itself is never used at runtime for the benchmark.
#
# Resolution order for the binary:
#   1. $MONGOD_BIN
#   2. server/node_modules/.cache/mongodb-memory-server/mongod-*
#   3. `mongod` on PATH
#
# Usage:  bash server/scripts/mongod.sh start|stop|status
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # -> server/
PORT="${BENCH_MONGO_PORT:-27018}"
DBPATH="${BENCH_MONGO_DBPATH:-$HERE/.mongo-bench-data}"
PIDFILE="$DBPATH/mongod.pid"
LOGFILE="$DBPATH/mongod.log"

find_mongod() {
  if [ -n "${MONGOD_BIN:-}" ] && [ -x "$MONGOD_BIN" ]; then echo "$MONGOD_BIN"; return; fi
  local cached
  cached="$(ls "$HERE"/node_modules/.cache/mongodb-memory-server/mongod-* 2>/dev/null | head -1 || true)"
  if [ -n "$cached" ]; then echo "$cached"; return; fi
  if command -v mongod >/dev/null 2>&1; then command -v mongod; return; fi
  echo ""
}

case "${1:-start}" in
  start)
    BIN="$(find_mongod)"
    if [ -z "$BIN" ]; then
      echo "ERROR: no real mongod binary found." >&2
      echo "Set MONGOD_BIN=/path/to/mongod, or install MongoDB Community Server." >&2
      exit 1
    fi
    mkdir -p "$DBPATH"
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "mongod already running (pid $(cat "$PIDFILE")) on port $PORT"
      exit 0
    fi
    echo "Starting real mongod: $BIN"
    nohup "$BIN" --dbpath "$DBPATH" --port "$PORT" --bind_ip 127.0.0.1 \
      --wiredTigerCacheSizeGB 1 >"$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    sleep 3
    if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "mongod up: pid $(cat "$PIDFILE"), port $PORT, dbpath $DBPATH"
      echo "BENCH_URI=mongodb://127.0.0.1:$PORT/shopsphere_bench"
    else
      echo "mongod failed to start; last log lines:" >&2
      tail -20 "$LOGFILE" >&2 || true
      exit 1
    fi
    ;;
  stop)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      kill "$(cat "$PIDFILE")" && echo "stopped mongod pid $(cat "$PIDFILE")"
      rm -f "$PIDFILE"
    else
      echo "no running mongod pidfile"
    fi
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "running (pid $(cat "$PIDFILE"), port $PORT)"
    else
      echo "not running"
    fi
    ;;
  *)
    echo "usage: $0 start|stop|status" >&2; exit 1 ;;
esac
