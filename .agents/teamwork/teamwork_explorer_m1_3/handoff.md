# Query Speedup Verification and PT Test Suite Analysis (M1)

## 1. Observation

### 1.1 Architecture & Database State
- **Mongod Process**: Verified active on port 27018 (`running (pid 2680, port 27018)`).
- **Scaled Benchmark Database (`shopsphere_bench`)**:
  - `products`: 50,000 documents (9,213 KB)
  - `orders`: 100,000 documents (10,889 KB)
  - `order_items`: 400,692 documents (62,999 KB)
  - `users`: 20,000 documents (2,029 KB)
  - `reviews`: 100,000 documents (12,793 KB)
  - `vendors`: 100 documents (8 KB)
  - `categories`: 30 documents (2 KB)
  - Total size on disk: ~50.9 MB with snappy compression.
  - Skew: Rare Collectibles (`is_rare: true`) represents 0.5% of products; orders in last 7 days represent 1,872 of 100,000 orders (1.9%).

### 1.2 Multi-Relation Benchmark Query: `rare_category_revenue_7d`
Defined in `server/pt/specs/index.js` (lines 12-35):
- **Description**: "Revenue per vendor for the rare category over the last 7 days (selective)."
- **Relations (5 total)**:
  - `cat`: `categories` with `localFilter: { is_rare: true }`
  - `p`: `products` with `localFilter: {}`
  - `oi`: `order_items` with `localFilter: {}`
  - `o`: `orders` with `localFilter: { created_at: { $gte: '@now-7d' } }`
  - `v`: `vendors` with `localFilter: {}`
- **Edges**:
  - `p.category_id` = `cat._id`
  - `oi.product_id` = `p._id`
  - `oi.order_id` = `o._id`
  - `oi.vendor_id` = `v._id`
- **Aggregation**: Group by `vendor_id`, `vendor_name`, summing `oi.line_total` as `revenue`, sorted by `revenue DESC`, limit 50.
- **Join Orders**: 29 valid connected prefix join orders (`validJoinOrders(spec)`).

### 1.3 `server/scripts/ptExecute.js` Execution Mechanics
`server/scripts/ptExecute.js` (lines 25-81):
1. **CLI Arguments**:
   - `[specName ...]`: e.g. `rare_category_revenue_7d` (defaults to first two specs if omitted).
   - `--orders=N`: number of sampled join orders (default 6).
   - `--bloom`: optional Bloom filter reduction.
2. **Deterministic Sampling**:
   - Uses `mulberry32` PRNG with seed `12345`.
   - When `--orders=1`: samples `['oi>o>p>v>cat']`.
   - When `--orders=2`: samples `['oi>o>p>v>cat', 'p>oi>o>cat>v']`.
3. **Optimized (mongo-pt) Preparation (`prepareReduced`)**:
   - Calls `runTransfer` (`server/pt/transfer.js`):
     - Computes Yannakakis LargestRoot Prim MST.
     - **Forward Pass** (post-order):
       - Evaluates `cat.is_rare: true` -> 1 category ID.
       - Transfers to `products`: `p.category_id in [1 catId]` -> filters 50,000 products to **20 surviving products**.
       - Evaluates `o.created_at >= @now-7d` -> 1,872 order IDs.
       - Transfers to `order_items`: `product_id in [20 p_ids]` AND `order_id in [1872 o_ids]` -> filters 400,692 items down to **22 surviving order items**.
     - **Backward Pass** (pre-order):
       - Transfers join keys back: `orders` reduced to **22 surviving orders**, `vendors` reduced to **12 surviving vendors**.
       - Dangling tuple elimination: **0 dangling tuples** (every surviving document participates in the final join).
     - Measured Transfer Duration: **~795 ms**.
   - Calls `materialize` (`server/pt/execute.js:179-220`):
     - Writes surviving documents to temporary collections (`tmp_pt_<runId>_cat`, `tmp_pt_<runId>_p`, `tmp_pt_<runId>_oi`, `tmp_pt_<runId>_o`, `tmp_pt_<runId>_v`).
     - Builds indexes on all join keys (`order_id`, `product_id`, `vendor_id`, `category_id`).
     - Measured Materialization Duration: **~181 ms**.
4. **Execution and Comparison Loop**:
   - **Standard MongoDB (`runNaive`)**:
     - Executes `$lookup` pipeline on full collections starting with `order_items` (400,692 documents).
     - Evaluates 400k documents with nested `$lookup` operations before applying the 7-day and rare-category predicates at the end.
     - Measured Latency: **74,249 ms** (~74.25 seconds).
   - **Optimized (mongo-pt) (`joinReduced`)**:
     - Executes `$lookup` pipeline on temporary collections starting with `tmp_pt_<runId>_oi` (only 22 documents).
     - Measured Join Latency: **15 ms**.
   - **Total Latency Comparison**:
     - Standard MongoDB: **74,249 ms**
     - Optimized mongo-pt Total (Transfer 795ms + Materialization 181ms + Join 15ms): **991 ms**
     - **Total Speedup Factor**: **74.92×**
     - **Join-Phase Speedup Factor**: **4,949.9×**
5. **Result Equality Verification**:
   - `resultsEqual(naive.result, er.result)` (`server/pt/execute.js:323-329`):
     - Normalizes numeric floats to 2 decimal places (`Math.round(v * 100) / 100`).
     - Normalizes MongoDB ObjectIds to hex strings.
     - Lexicographically sorts serialized rows.
     - Verifies exact row count and character-by-character string equality.
   - Result: `equal: 'ok'`, checksum: `'12:c3797d6f'`, 0 failures.

### 1.4 Test Suite Execution (`npm run test:pt`)
Script defined in `server/package.json:19`: `"test:pt": "node --test tests/*.test.js"`.
Execution directly observed via `npm run test:pt`:
- **File 1: `tests/bloom.test.js`** (5 tests):
  1. `Bloom: 120k keys (mixed ObjectIds) have zero false negatives`: OK (0 false negatives).
  2. `Bloom: measured false-positive rate on 100k non-members`: OK (FPR = 1.138% < 5%).
  3. `ExactSet: dedupes and drops null/undefined keys`: OK.
  4. `ExactSet: values are distinct`: OK.
  5. `Bloom and Exact agree with server-side $function (zero false negatives)`: OK (3,000 members in `pt_test_bloom`, 0 FN).
- **File 2: `tests/pt.test.js`** (5 tests):
  6. `acyclicity: chain accepted`: OK (`isAcyclic === true`).
  7. `acyclicity: star accepted`: OK (`isAcyclic === true`).
  8. `acyclicity: triangle rejected with a clear error`: OK (throws `/cyclic/i`).
  9. `schedule: forward pass then backward pass, root is the largest relation`: OK (`root: 'b'`, forward precedes backward).
  10. `naive == reduced for every spec on a tiny dataset and 3 join orders`: OK.
      - Tested all 7 specs: `rare_category_revenue_7d`, `common_category_revenue_365d`, `vendor_scoped_revenue_90d`, `user_scoped_spend_30d`, `low_rating_reviews_by_category`, `vendor_category_revenue_365d`, `user_vendor_category_spend_30d`.
      - 3 join orders each (21 combinations tested).
      - All 21 assertions passed with `equal=ok`.
- **File 3: `tests/transfer.test.js`** (2 tests):
  11. `dangling tuples: reduced relations == projection of final join (selective spec)`: OK.
      - Tested against scaled `shopsphere_bench` database.
      - Asserted `surviving[r.alias] === inJoin[r.alias]` for all 5 relations:
        - `cat`: 1 survivors == 1 in final join
        - `p`: 20 survivors == 20 in final join
        - `oi`: 22 survivors == 22 in final join
        - `o`: 22 survivors == 22 in final join
        - `v`: 12 survivors == 12 in final join
      - Zero dangling tuples verified.
  12. `null join keys are dropped and sets are distinct (via distinct())`: OK.
- **Summary**: 12 tests executed, 12 passed, 0 failed, 0 skipped. Total duration: 7.83 seconds.

---

## 2. Logic Chain

1. **Why Standard MongoDB Degrades on Scaled Relational Collections**:
   - `Observation`: MongoDB lacks global semi-join reduction across multi-collection `$lookup` pipelines (`server/pt/execute.js:54-135`).
   - `Inference`: When a join starts from an unselective or fact collection (`order_items` with 400,692 rows), MongoDB performs nested lookups for all 400,692 rows across `orders` and `products`, only evaluating the date filter (`@now-7d`) and rare category filter (`is_rare: true`) downstream. This causes execution time to balloon to ~74 seconds.
2. **Why Optimized (mongo-pt) Yields 74.9× Total Speedup**:
   - `Observation`: Predicate Transfer computes join key constraints in two passes and materializes temporary indexed collections (`server/pt/execute.js:179-220`).
   - `Inference`: `order_items` is pruned from 400,692 rows to 22 rows, and `products` from 50,000 rows to 20 rows prior to the join.
   - `Inference`: The final join operates on 22 rows instead of 400k rows, completing in 15 ms. Total elapsed time (transfer 795ms + mat 181ms + join 15ms = 991ms) produces a net 74.9× speedup, far exceeding the >1× requirement.
3. **Execution Runtime Trade-Off for Worker Verification**:
   - `Observation`: `sample(allOrders, maxOrders)` picks order `oi>o>p>v>cat` as the first order (takes ~74s naive), and `p>oi>o>cat>v` as the second order (takes ~95s naive).
   - `Inference`: Running `node scripts/ptExecute.js rare_category_revenue_7d --orders=1` tests the primary selective speedup and takes ~1.5 minutes. Running `--orders=2` takes ~3 minutes. Running the default `--orders=6` would take >8 minutes. Worker should use `--orders=1` for rapid, deterministic verification.

---

## 3. Caveats

1. **Mongod Daemon Precondition**:
   - The benchmark database `shopsphere_bench` runs exclusively on port 27018. If the disk-backed `mongod` is not running, all commands will fail with `ECONNREFUSED`. Always verify with `pwsh -File server\scripts\mongod.ps1 status` first.
2. **Sampling Order Runtime**:
   - Because `oi>o>p>v>cat` deliberately forces Standard MongoDB to evaluate 400,692 rows, the command `node scripts/ptExecute.js rare_category_revenue_7d --orders=1` will appear to pause for ~74 seconds while the naive side runs. This is normal and expected behavior.
3. **Unselective Control Queries**:
   - In unselective specs like `common_category_revenue_365d`, Predicate Transfer intentionally skips transfer edges when distinct key count exceeds `PT_IN_CAP` (50,000). Semi-join speedup is not expected on unselective catalog scans (speedup ≤ 1.0×). Speedup verification must use selective queries like `rare_category_revenue_7d`.

---

## 4. Conclusion

1. **Dataset Scaling Verified**: `shopsphere_bench` contains 50,000 products, 400,692 order items, 100,000 orders, and 20,000 users.
2. **Speedup Verification Confirmed**: On `rare_category_revenue_7d`, Optimized (mongo-pt) achieves:
   - **74.92× end-to-end speedup** (991 ms vs 74,249 ms).
   - **4,949.9× join-phase speedup** (15 ms vs 74,249 ms).
   - **100% result equivalence** (`equal: ok`, checksum match, 0 dangling tuples).
3. **PT Test Suite Status**: `npm run test:pt` passes all **12/12 tests** cleanly in under 8 seconds.
4. **Readiness for Worker Execution**: The exact execution commands and expected outputs are formulated and verified.

---

## 5. Verification Method

### Recommended Worker Execution Sequence

#### Step 1: Verify mongod Daemon Status
```powershell
pwsh -File server\scripts\mongod.ps1 status
```
*Expected Output*:
```
running (pid <PID>, port 27018)
```
*(If not running, start it with `pwsh -File server\scripts\mongod.ps1 start`)*.

#### Step 2: Verify Scaled Dataset Counts
```powershell
cd server
node scripts/showDb.js
```
*Expected Output*:
- `shopsphere_bench`:
  - `products`: 50,000 docs
  - `orders`: 100,000 docs
  - `order_items`: ~400,692 docs
  - `users`: 20,000 docs
  - `reviews`: 100,000 docs
  - `vendors`: 100 docs
  - `categories`: 30 docs
  - Storage size: ~50.9 MB

#### Step 3: Verify PT Test Suite (12/12 Passing)
```powershell
cd server
npm run test:pt
```
*Expected Output*:
- TAP output with 12 subtests.
- `# pass 12`, `# fail 0`, `# cancelled 0`.
- Execution duration: ~7-8 seconds.

#### Step 4: Verify Multi-Relation Query Speedup (>1×) and Result Parity
```powershell
cd server
node scripts/ptExecute.js rare_category_revenue_7d --orders=1
```
*Expected Output*:
```
SPEC rare_category_revenue_7d: 29 valid join orders, testing 1
  transfer=~795ms  materialization=~181ms  skipped=[]
   {"order":"oi>o>p>v>cat","naive_ms":~74000,"exact_join_ms":~15,"exact_total_ms":~990,"bloom_join_ms":null,"bloom_total_ms":null,"equal":"ok","checksum":"12:c3797d6f"}

[ptExecute] equality failures: 0
```
*Speedup Calculation*:
- Total Speedup = `naive_ms / exact_total_ms` ≈ `74,000 / 990` ≈ **~74×** (exceeds >1× requirement).
- Join Speedup = `naive_ms / exact_join_ms` ≈ `74,000 / 15` ≈ **~4,900×**.
- Result Equality = `"equal": "ok"`, `equality failures: 0`.

### Invalidation Conditions
- Any failure in `npm run test:pt` (less than 12/12 passing).
- `equal` reporting mismatch or `failures > 0` in `ptExecute.js`.
- Total speedup factor on `rare_category_revenue_7d` falling below 1.0×.
- Missing documents in `shopsphere_bench` (products < 50k, order_items < 400k).
