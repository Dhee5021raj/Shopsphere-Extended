# mongo-pt: predicate transfer for MongoDB

Implementation of **Robust Predicate Transfer** from *"Debunking the Myth of Join
Ordering: Toward Robust SQL Analytics"* (SIGMOD 2025, arXiv:2502.15181), on top of
a referenced MongoDB benchmark schema.

The paper's claim: if you push the effect of every predicate through the whole
join graph **before** joining, in either direction, then the runtime of the join
no longer depends on the join order. mongo-pt reproduces that experiment in
MongoDB and measures the join-order robustness gap.

- Design notes and the schedule algorithm in our own words: [`pt-design.md`](pt-design.md)
- ER model and collection mapping: [`er-and-schema.md`](er-and-schema.md)
- Measured results: [`results.md`](results.md) / [`results.csv`](results.csv)

## 1. The idea

A join query over relations `R1..Rn` with local filters and equality edges.
Instead of joining the full collections:

1. **Build the join graph** (vertices = relations/aliases, edges = equi-joins,
   edge weight = number of shared join attributes).
2. **Check acyclicity** (GYO/ear-removal). Cyclic and disconnected specs are
   rejected with a clear error.
3. **Schedule** with the paper's **LargestRoot** algorithm: a maximum-spanning
   Prim tree rooted at the *largest* relation, so big relations are pulled
   toward the root and filtered before they build their own key sets.
4. **Forward pass** (leaves → root) then **backward pass** (root → leaves) of
   semi-join reductions. Each step queries the target relation with
   `localFilter AND keyField $in (incoming key set)`, projects only the keys
   needed for its other edges, and computes the distinct outgoing key set.
5. **Join** the reduced instances in *any* valid (connected-prefix) order.

The reduction is join-order independent: it is computed once and reused for every
join order, which is exactly what removes the order sensitivity.

## 2. Filter interface

`server/pt/filters/` exposes a common interface:

```
FilterSet { add(key), has(key), size(), toMongoClause(field) }
```

- **`ExactSet`** (default): a hash set of distinct keys; the Mongo clause is an
  exact `{ field: { $in: [...] } }`, **batched** to keep the command under the
  16 MB BSON limit.
- **`BloomFilterSet`** (experimental, `PT_BLOOM=1`): a client-side Bloom filter
  whose `toMongoClause` is a server-side `$function`. It is **correct** (zero
  false negatives, verified by `tests/bloom.test.js`) but **slower** than an
  exact set — see the negative result below.

When an outgoing set exceeds the **in-list cap** (configurable, default 50k), the
transfer edge is **skipped** and logged; the join still runs correctly, just with
less reduction.

## 3. How to run

```bash
cd server
npm run mongod                 # real, disk-backed mongod on 127.0.0.1:27018
npm run seed:bench -- --small --drop   # tiny dataset for tests/dev
npm run seed:bench -- --medium         # medium benchmark dataset (used for the results)
npm run bench -- --specs=rare_category_revenue_7d,common_category_revenue_365d
npm run bench:report           # docs/results.md + results.csv + chart html/csv
npm run test:pt                # Step 8 tests (needs the real mongod)
```

`npm run repro` chains seed + benchmark + report at the default scale. Set
`PT_LABEL=smoke` to label a run as a smoke test so it is never used for
performance claims.

### Shadow logging in the live app (Step 7)

`PT_SHADOW=1` makes the analytics endpoints schedule a matching mongo-pt run:

- `GET /api/analytics/vendor` → `vendor_scoped_revenue_90d`
- `GET /api/analytics/admin` → `user_vendor_category_spend_30d`

The request is **never delayed or broken**: the hook fires on `res.on('finish')`
and spawns a **detached** child process (`server/scripts/ptShadow.js`) that opens
its own connection to `shopsphere_bench`, measures naive vs reduced on the default
join order, and appends to the log. It is off by default.

`GET /api/admin/pt-log` (existing `protect` + admin `authorizeRoles`) returns the
last 100 records; the React page at `/admin/pt-log` shows them with **speedup**
and **transfer-overhead %** columns.

## 4. How to read the log

`server/logs/pt-log.jsonl` is one JSON object per line:

| kind | meaning |
|---|---|
| `env` | machine/mongod/run configuration |
| `spec` | query, graph sizes, number of valid/tested join orders |
| `cap` | per-cap transfer + materialization time, skipped edges, adaptive decisions |
| `order` | one join order: naive/exact/adaptive/bloom medians, transfer, materialization, total, checksum, equality |
| `summary` | per-spec min/median/max and the robustness gap (max/min) |
| `shadow` | a live-app background measurement (Step 7) |

Timed-out runs are **censored** (`DNF`, lower bound = timeout) and never dropped;
any gap involving a DNF is printed as `>= X`.

## 5. Differences from the paper (honest)

1. **Bloom filters cannot be applied inside a Mongo query.** The default filter
   type is therefore an **exact key set** pushed as `{field: {$in: [...]}}`. The
   experimental `$function` Bloom filter is kept behind `PT_BLOOM=1`; it is
   correct but **slower**, so it is reported as a negative result
   (`docs/results-bloom.md`).
2. **Orchestration runs in Node, not inside a database optimizer.** There is no
   cost model; the schedule is the paper's topology-only rule (LargestRoot).
3. **`SafeSubjoin` is skipped.** All query specs here are gamma-acyclic join
   trees where every joined pair shares exactly one attribute, so every connected
   join order is enumeration-safe and the paper's extra check is unnecessary.
4. **Equality joins only.** Range/inequality joins and cyclic graphs are rejected.

## 6. Limits

- Exact sets (not Bloom) as the default; in-list batching capped at 50k.
- Materialization cost: reduced instances are written to `tmp_pt_<runid>_*`
  collections with indexes on their join keys, then dropped. This cost is
  reported separately and **never hidden** inside the reduced total.
- App-side orchestration: no native optimizer/cost integration.
- Only acyclic equality joins; the "adaptive" mode may skip edge transfers and
  materializations that would not pay off, falling back to key-set `$in` filters.
- The unselective case can still lose: when a filter removes almost nothing, the
  transfer passes and materialization are pure overhead.

## 7. Where it helped and where it did not (medium scale)

From the last full run (`label=full scale=medium runs=5`, timeout 120 s):

- **Helped:** `rare_category_revenue_7d` (rare category + 7-day window). Naive was
  strongly order-sensitive (median ~55 s, max ≈ 102 s across orders, gap ≈ 13.5×);
  the reduced run is ~17 ms plus ≈ 0.95 s of transfer + materialization, and the
  per-order gap collapses to ≈ 1.2×. This is the paper's core claim reproduced.
- **Did not clearly help:** `common_category_revenue_365d` (common category,
  365-day window). Its local filters remove little, several transfer edges hit
  the in-list cap and are skipped (`oi<-o`, `o<-oi`), and the reduced run is
  dominated by transfer + materialization. On the one order that completed, the
  naive side was **DNF** (≥120 s), so the reduced total ≈ 58 s is a partial win at
  best and no robustness claim is made — its naive row is marked `n/v`
  (equality unverifiable because the naive run was censored).

### Caveats

- The medium **full-protocol** run is **partial**: `rare_category_revenue_7d`
  completed, `common_category_revenue_365d` completed one order before the session
  budget ended. The 7-spec table in `docs/results-smoke.md` is **smoke-only**
  (`runs=2`) and must not be used for performance claims.
- The slowest naive order (`p>oi>o>cat>v`) is above the ~60 s target.
- DNF orders cannot have equality verified and are marked `n/v`; the equality
  check is otherwise enforced (a mismatch aborts).
