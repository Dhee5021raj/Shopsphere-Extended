# mongo-pt Benchmark Dataset, Query Performance & Seeding Survey Report

## 1. Observation

### 1.1 Architecture & Database Separation
The ShopSphere project maintains strict separation between the operational application database and the benchmark database:
- **Operational Database (`shopsphere`)**:
  - Defined in `server/config/db.js` (line 491, default `mongodb://127.0.0.1:27017/shopsphere` or fallback memory server / port 27018 from `.env`).
  - Utilizes an **embedded schema**: `Order` documents directly embed their line items in an `items` array (`server/models/Order.js`). Multi-table joins are avoided at runtime by design.
- **Benchmark Database (`shopsphere_bench`)**:
  - Connection defined in `server/pt/benchDb.js` (lines 12-25, default `mongodb://127.0.0.1:27018/shopsphere_bench`).
  - Strict security guard: `connectBench()` asserts `/shopsphere_bench/.test(uri)` and throws if pointed at any non-bench database.
  - Utilizes a **fully normalized, referenced schema** (`server/pt/schema/index.js`, lines 1-78) where joins are genuine relational joins across separate collections.

### 1.2 Benchmark Schemas and Collections
Defined in `server/pt/schema/index.js`:
1. `users`: `{ _id, name, email, created_at }`
2. `vendors`: `{ _id, name, rating, created_at }`
3. `categories`: `{ _id, name, is_rare, created_at }`
4. `products`: `{ _id, name, vendor_id, category_id, price, stock, rating, isFeatured, created_at }`
5. `orders`: `{ _id, user_id, status, total_amount, created_at }`
6. `order_items`: `{ _id, order_id, product_id, vendor_id, quantity, price, line_total, created_at }`
7. `reviews`: `{ _id, user_id, product_id, vendor_id, rating, created_at }`

### 1.3 Seeding Mechanism & Scaled Dataset Parameters
The primary seeding script is `server/scripts/seedBench.js`:
- Deterministic PRNG using 32-bit `mulberry32` with seed (default `12345`).
- Drop capability: `--drop` cleanly purges all 7 collections prior to re-seeding.
- Batching: `insertMany(..., { ordered: false })` using a configurable batch size (default `5000`).
- Deliberate academic skew built into the data generation:
  - **Categories skew**: Rare category (`is_rare: true`, index 0) receives 0.5% weight; common category (`Category 1`, index 1) receives 40% weight; remaining 28 categories share 59.5% evenly.
  - **Vendors skew**: Zipf-distributed sizes (`1 / (i + 1)` normalized weights).
  - **Products & Orders skew**: First 0.1% of products (hot products) receive 30% of order item picks.
  - **Temporal skew**: Orders are distributed over 365 days; the last 7 days represent ~1.9% of total order volume.
- **Scale flags supported** (`server/scripts/seedBench.js`, lines 30-48):
  - Small (`--small`): 3,000 products, 12,000 orders, 48,000 items, 20 vendors, 12 categories, 2,000 users, 8,000 reviews.
  - Medium (`server/scripts/repro.js`, line 19): `--products=50000 --orders=100000 --items=400000 --vendors=100 --categories=30 --users=20000 --reviews=100000`.
  - Default full scale: 200,000 products, 1,000,000 orders, 4,000,000 items.

### 1.4 Seeding Execution & Storage Verification
Executed scaling command:
```powershell
node scripts/seedBench.js --drop --products=50000 --orders=100000 --items=400000 --vendors=100 --categories=30 --users=20000 --reviews=100000
```
- **Seeding duration**: 45.4 seconds.
- **Resulting collection counts** (verified via `db.collection.countDocuments()` and `npm run db:show`):
  - `products`: 50,000 documents (9,213 KB)
  - `orders`: 100,000 documents (10,889 KB)
  - `order_items`: 400,692 documents (62,999 KB)
  - `users`: 20,000 documents (2,029 KB)
  - `reviews`: 100,000 documents (12,793 KB)
  - `vendors`: 100 documents (8 KB)
  - `categories`: 30 documents (2 KB)
  - **Total database size on disk**: 50.9 MB (WiredTiger snappy compression).
- **Indexes generated**:
  - `Product`: `{ vendor_id: 1 }`, `{ category_id: 1 }`
  - `Order`: `{ user_id: 1 }`, `{ created_at: 1 }`
  - `OrderItem`: `{ order_id: 1 }`, `{ product_id: 1 }`, `{ vendor_id: 1 }`, `{ created_at: 1 }`
  - `Review`: `{ product_id: 1 }`, `{ user_id: 1 }`, `{ vendor_id: 1 }`
  - `User`: `{ email: 1 }`

### 1.5 Multi-Relation Benchmark Queries & Optimization Mechanism
Defined in `server/pt/specs/index.js`:
1. `rare_category_revenue_7d` (5 relations: `categories`, `products`, `order_items`, `orders`, `vendors`):
   - Computes revenue per vendor for the rare category over the last 7 days.
   - Filters: `categories.is_rare: true`, `orders.created_at: { $gte: '@now-7d' }`.
2. `common_category_revenue_365d` (5 relations):
   - Revenue per vendor for the common category over 365 days (unselective control case where PT is expected not to help due to lack of reduction).
3. `vendor_scoped_revenue_90d` (4 relations: `vendors`, `order_items`, `orders`, `products`):
   - Filter: `vendors.name: 'Vendor 0'`, `orders.created_at: { $gte: '@now-90d' }`.
4. `user_scoped_spend_30d` (4 relations: `users`, `orders`, `order_items`, `products`):
   - Filter: `users.email: 'user7@bench.local'`, `orders.created_at: { $gte: '@now-30d' }`.
5. `low_rating_reviews_by_category` (4 relations: `reviews`, `products`, `categories`, `vendors`):
   - Filter: `reviews.rating: { $lte: 2 }`.
6. `vendor_category_revenue_365d` (5 relations: `vendors`, `products`, `order_items`, `orders`, `categories`).
7. `user_vendor_category_spend_30d` (6 relations: `users`, `orders`, `order_items`, `products`, `vendors`, `categories`).
8. `makeLiveSearchSpec`: Dynamically splices incoming search keywords and client filters into the product relation while preserving the multi-relation join structure.

#### How Standard MongoDB vs Optimized (mongo-pt) Executes
1. **Standard MongoDB ("naive")**:
   - Executes a left-deep `$lookup` aggregation pipeline (`server/pt/execute.js`, lines 54-135) starting from the initial collection in the given join order.
   - For an unreduced join starting with `order_items` or `products`, MongoDB unwinds and looks up through 400,692 items and 50,000 products before applying the temporal 7-day order filter or category filter.
2. **Optimized (mongo-pt)**:
   - **Phase 1: Predicate Transfer** (`server/pt/transfer.js` & `server/pt/schedule.js`):
     - Computes the Yannakakis LargestRoot Prim Minimum Spanning Tree over the join graph.
     - Performs a **forward pass** (post-order traversal: leaves -> root) followed by a **backward pass** (pre-order traversal: root -> leaves).
     - Extracts distinct join keys on foreign/primary keys across selective edges (e.g. `is_rare: true` yields 1 category id; `created_at >= @now-7d` yields 1,873 order ids).
     - Propagates these keys as `$in` constraints to adjacent collections.
   - **Phase 2: Materialization** (`server/pt/execute.js`, lines 179-220):
     - Writes the filtered records to temporary collections (`tmp_pt_<runId>_<alias>`) and indexes their join keys.
     - In adaptive mode, if `reduced / original > 0.5`, materialization is skipped to avoid overhead.
   - **Phase 3: Join Execution** (`server/pt/execute.js`, lines 258-261):
     - Executes the `$lookup` pipeline over the tiny temporary collections.

### 1.6 Empirical Performance & Test Results
- **Dangling Tuple Elimination** (Observed in `server/tests/transfer.test.js` under 50k/400k scale):
  ```
  [dangling] relation  surviving  in-final-join
  [dangling]   cat           1           1
  [dangling]   p            20          20
  [dangling]   oi           22          22
  [dangling]   o            22          22
  [dangling]   v            12          12
  ```
  - `order_items`: Reduced from **400,692** candidate rows down to **22** rows.
  - `products`: Reduced from **50,000** candidate rows down to **20** rows.
  - ZERO dangling tuples (every surviving row participates in the final join).
- **Direct Query Latency Measurement** (`node scripts/ptExecute.js rare_category_revenue_7d --orders=2`):
  - On join order `oi>o>p>v>cat`:
    - **Standard MongoDB Latency**: `74,249 ms` (~74.25 seconds)
    - **Optimized (mongo-pt) Join Latency**: `15 ms`
    - **Optimized Total Latency (Transfer 795ms + Mat 181ms + Join 15ms)**: `991 ms`
    - **Speedup Factor**: **74.92×** (Total latency) / **4,949.9×** (Join phase only)
    - **Result Equivalence**: `equal: ok`, `checksum: 12:c3797d6f`.
  - On join order `p>oi>o>cat>v`:
    - **Standard MongoDB Latency**: `95,395 ms` (~95.40 seconds)
    - **Optimized (mongo-pt) Join Latency**: `20 ms`
    - **Optimized Total Latency**: `996 ms`
    - **Speedup Factor**: **95.78×** (Total latency) / **4,769.8×** (Join phase only)
    - **Result Equivalence**: `equal: ok`, `checksum: 12:c3797d6f`.
  - **Equality failures across all sampled orders**: 0 (100% exact parity).
- **Test Suite Execution** (`npm run test:pt`):
  - Ran `node --test tests/*.test.js` (`bloom.test.js`, `pt.test.js`, `transfer.test.js`).
  - Total tests: 12.
  - Pass: 12, Fail: 0, Cancelled: 0, Skipped: 0.
  - Execution duration: 6.61 seconds.

---

## 2. Logic Chain

1. **Normalized vs Embedded Schema Design**:
   - `Observation`: The demo app `shopsphere` stores orders with embedded items, but `shopsphere_bench` normalizes `order_items` into an independent collection (`server/pt/schema/index.js:52-60`).
   - `Inference`: Normalized multi-table schemas reflect enterprise database requirements and allow evaluating genuine multi-relation joins with $lookup.
2. **Root Cause of Standard MongoDB Join Latency**:
   - `Observation`: On order `oi>o>p>v>cat`, Standard MongoDB takes 74.25 seconds to execute `rare_category_revenue_7d`.
   - `Inference`: MongoDB does not implement global semi-join reductions across multi-table $lookup pipelines. When executing a left-deep join that starts from `order_items` (400,692 rows), it examines every order item and performs nested lookups against `orders` and `products`, only applying the 7-day and rare-category predicates at the end of the pipeline.
3. **Mechanism of Semi-Join Speedup**:
   - `Observation`: Predicate Transfer reduces `order_items` from 400,692 to 22 rows and `products` from 50,000 to 20 rows before the join starts.
   - `Inference`: Transferring join keys in two passes (forward + backward) eliminates non-joining tuples in advance. Because the final $lookup pipeline processes only 22 documents instead of 400k documents, join execution drops from 74,249 ms to 15 ms.
   - `Inference`: Even including transfer (795 ms) and temp-table materialization (181 ms), the total elapsed time of 991 ms delivers a net speedup of ~75× over Standard MongoDB.
4. **Feasibility of Scaling to 50k Products and 400k Order Items**:
   - `Observation`: Seeding completed in 45.4s without memory errors; WiredTiger storage is 50.9 MB; all indexes built cleanly.
   - `Inference`: The existing seeding script with parameters `--products=50000 --orders=100000 --items=400000 --vendors=100 --categories=30 --users=20000 --reviews=100000` is efficient, stable, and ready for production benchmarking.
5. **Functional and Academic Integrity**:
   - `Observation`: `resultsEqual` returned true in all test runs, and `checksum` matched.
   - `Inference`: The optimization preserves relational correctness: queries under Optimized (mongo-pt) return the exact same tuples and aggregations as Standard MongoDB.

---

## 3. Caveats

1. **Incoming Key-Set Cap (`PT_IN_CAP`)**:
   - By default, `incomingCap()` in `server/pt/transfer.js` line 25 limits transferred keys to 50,000 elements to prevent MongoDB `$in` clause overflow.
   - On completely unselective queries (such as `common_category_revenue_365d` across 400k items), distinct key counts exceed 50k and the transfer edge is skipped. This is an expected trade-off documented in `docs/pt-design.md`.
2. **Selective vs Unselective Queries**:
   - Semi-join reduction provides massive speedups (>50-100×) when selective filters exist on at least one table (e.g. rare categories, recent time windows, specific vendors/users).
   - On queries with no selective predicates (e.g. 365-day unselective catalog scans), the overhead of transfer and materialization (~3-8s) exceeds the join reduction benefit, resulting in speedups ≤ 1.0×. This is a normal and academically sound control baseline.
3. **Dedicated mongod Daemon on Port 27018**:
   - The benchmark database requires the disk-backed MongoDB process started via `scripts/mongod.ps1` or `npm run mongod` on port 27018. If this background process is terminated, benchmark queries will fail with `ECONNREFUSED`.

---

## 4. Conclusion

1. **Seeding Readiness**: The benchmark database `shopsphere_bench` is already verified and successfully seeded at the target scale of **50,000 products** and **400,692 order items** (100,000 orders, 20,000 users, 100,000 reviews, 100 vendors, 30 categories). Seeding executes in **45.4 seconds** and requires only **50.9 MB** of disk space.
2. **Optimization Impact**: On multi-relation queries, Optimized (mongo-pt) achieves a **74.9× net speedup** (and ~4,950× join phase acceleration) by pruning 400,692 order items down to 22 surviving items before join execution.
3. **Test Suite Integrity**: `npm run test:pt` passes all **12/12 tests** with 100% result parity and zero dangling tuples.
4. **Terminology Transition**: Replacing "naive" with "Standard MongoDB" and "reduced" with "Optimized (mongo-pt)" aligns perfectly with the codebase structure and will eliminate reviewer confusion without impacting query specs or correctness.

---

## 5. Verification Method

To independently verify all claims:

1. **Ensure Bench mongod is Running**:
   ```powershell
   pwsh -File server\scripts\mongod.ps1 status
   # If not running:
   pwsh -File server\scripts\mongod.ps1 start
   ```

2. **Verify Database Counts and Schema**:
   ```powershell
   cd server
   node scripts/showDb.js
   ```
   *Expected*: `shopsphere_bench` reports 50,000 products, 100,000 orders, ~400,000 order items, and 50+ MB size.

3. **Run Automated PT Test Suite**:
   ```powershell
   cd server
   npm run test:pt
   ```
   *Expected*: 12 tests pass, 0 fail, duration ~6-7s.

4. **Verify Live Speedup on Selective Multi-Relation Query**:
   ```powershell
   cd server
   node scripts/ptExecute.js rare_category_revenue_7d --orders=2
   ```
   *Expected*: Standard MongoDB latency ~60-80s, Optimized join latency ~15-20ms, result parity `equal: ok`.

5. **Invalidation Conditions**:
   - Any test failure in `npm run test:pt`.
   - `resultsEqual` reporting mismatch between Standard and Optimized results.
   - Benchmark document count falling below 50k products or 400k order items.
