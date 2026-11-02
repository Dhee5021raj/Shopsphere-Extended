# ShopSphere + mongo-pt — Runbook (start → end)

Everything below was verified on the target machine (Windows, Git Bash, Node 22).
On a fresh machine run the same commands; the bundle self-provides the mongod binary.

## 0. Prerequisites (first time only)

```bash
node --version        # v18+ required (verified on v22)
```

- The **real mongod binary is already on disk** — `npm install` in `server/` fetched it
  via `mongodb-memory-server` (`server/node_modules/.cache/mongodb-memory-server/…`).
  You never install MongoDB itself; at runtime the real binary is used directly.
- If `node_modules` is missing:

  ```bash
  cd server && npm install
  cd client && npm install
  ```

## 1. Start the database engine (Terminal 1)

```bash
cd server
npm run mongod              # → "mongod up: pid …, port 27018"
```

Launches a real, disk-backed mongod on **port 27018** hosting BOTH databases:

- `shopsphere` — the demo app (embedded schema)
- `shopsphere_bench` — the predicate-transfer benchmark (referenced schema, skewed data)

Leave this terminal open. Stop later with `npm run mongod stop`.

## 2. Configure the server (first time only)

Create `server/.env` (gitignored):

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27018/shopsphere
JWT_SECRET=shopsphere_super_secret_jwt_key_2026
PT_SHADOW=1          # ← enables the live shadow benchmark logging
```

Notes:

- `PT_SHADOW=1` is what turns on the live comparison feature; without it the app runs
  normally and nothing is logged/logged-behind-the-scenes.
- If no MongoDB listens at `MONGODB_URI`, the server falls back to an in-memory
  replica set (works, but empty on every restart).

## 3. Seed the data (first time, or whenever you want a reset)

```bash
# bench DB — the skewed analytics dataset the comparison runs on:
npm run seed:bench -- --small --drop     # 3k products / 48k items — fast, mild live wins (~1-2×)

# medium scale for the visible wins (~8-14×), takes ~30 s:
npm run seed:bench -- --products=50000 --orders=100000 --items=400000 --users=20000 --reviews=100000 --drop

# demo shop data — auto-seeds itself on first server start (50 products).
# Optional: +240 more products so searches return full pages:
node scripts/addDemoProducts.js          # --drop-new reverses exactly what it added
```

## 4. Start the API server (Terminal 2)

```bash
cd server
npm run dev                 # → "[ShopSphere Server] Running on port 5000"
```

## 5. Start the web app (Terminal 3)

```bash
cd client
npm run dev                 # → http://localhost:3000 (proxies /api → :5000)
```

## 6. Use it — the live comparison

1. Open **http://localhost:3000**, log in: **admin@shopsphere.com / adminpassword123**
2. **Products** page → search **"laptop"** (instant results; the benchmark fires
   detached behind your request and never slows it)
3. Go to **`/admin/pt-log`** — the status chip shows:
   - 🟡 **MEASUREMENT RUNNING · Ns elapsed** while it measures
   - 🔘 **IDLE** when it landed (new row visible, log polls every 5 s)
4. **Click any row** → the full story: *"Your action that logged this record:
   searched for 'laptop'"*, what the bench query computes, naive vs reduced times,
   transfer/materialization overhead, and the `ok` result-equality checksum.

## 7. The same data from the terminal (browser optional)

```bash
npm run pt:log              # table of measurements; --follow for live; --verbose for query details
                            #   --tail=N · --speedup=5 (winners only) · --raw · --all
npm run db:show             # DB walkthrough: counts, deliberate skew, schema shapes, join indexes (viva-ready)
curl -s -H "Authorization: Bearer <adminJWT>" http://localhost:5000/api/admin/pt-status   # is it running?
```

Latest log files: `server/logs/` (`pt-log.jsonl` plus smoke/bloom variants — view any
with `PT_LOG=<path> npm run pt:log`).

## 8. Shut down cleanly

```bash
cd server && npm run mongod stop    # data persists in server/.mongo-bench-data/
# Ctrl+C the two dev servers; Ctrl+C exits pt:log --follow
```

Data survives restarts — re-seed only to change scale.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `PT_SHADOW=1` set but no log rows and status always idle | lock may be stuck (a crashed run) — delete `server/logs/.pt-shadow.lock`; stale locks (15 min) otherwise self-clear. The lock-unconditional-release fix removes the usual cause. |
| "no bench DB: connect ECONNREFUSED 127.0.0.1:27018" | Terminal 1 (`npm run mongod`) is not running — start it first |
| Shadow speedups look small (~1-2×) | bench DB was seeded `--small`; re-seed at medium scale (step 3) |
| Searches return few results | demo DB was auto-seeded with only 50 products; run `node scripts/addDemoProducts.js` |
| Ports 5000 / 3000 / 27018 busy | close the holding terminal, or change `PORT` in `.env`, `client/vite.config.js`, or `BENCH_MONGO_PORT` |
| Want the citable full-protocol numbers | `npm run repro -- --scale=medium` (full multi-order protocol), then `npm run bench:report` regenerates `docs/results.md` + charts |

## Quick reference — demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@shopsphere.com` | `adminpassword123` |
| Vendor | `nexus@vendors.com` | `password123` |
| Customer | `alex@gmail.com` | `password123` |
