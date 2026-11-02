# Benchmark Seeding & Dataset Architecture Investigation Report

## 1. Observation

### 1.1 Command-Line Options and Argument Parsing in `server/scripts/seedBench.js`
In `server/scripts/seedBench.js` (lines 30–48):
```javascript
function parseArgs(argv) {
  const opts = {
    products: 200000, orders: 1000000, items: 4000000,
    vendors: 200, categories: 50, users: 100000, reviews: 1000000,
    seed: 12345, batch: 5000, drop: false
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--small') {
      Object.assign(opts, { products: 3000, orders: 12000, items: 48000, vendors: 20, categories: 12, users: 2000, reviews: 8000 });
    } else if (raw === '--drop') {
      opts.drop = true;
    } else {
      const m = /^--([a-z]+)=(-?\d+)$/.exec(raw);
      if (!m) throw new Error(`Unknown argument: ${raw}`);
      opts[m[1]] = parseInt(m[2], 10);
    }
  }
  return opts;
}
```
Direct observations:
- **Default scale** (full scale): `products: 200000`, `orders: 1000000`, `items: 4000000`, `vendors: 200`, `categories: 50`, `users: 100000`, `reviews: 1000000`.
- **Built-in flag presets**: Only `--small` and `--drop` are recognized.
- **Argument parser constraint**: Any parameter that is not `--small` or `--drop` MUST match `/^--([a-z]+)=(-?\d+)$/`.
- **Preset gap**: Passing `--medium` or `--scale=medium` to `seedBench.js` fails immediately with `Error: Unknown argument: --medium` because the regex fails to match.

### 1.2 Medium Scale Definition in `server/scripts/repro.js`
In `server/scripts/repro.js` (lines 17–21):
```javascript
const SCALES = {
  small: ['--small'],
  medium: ['--products=50000', '--orders=100000', '--items=400000', '--vendors=100', '--categories=30', '--users=20000', '--reviews=100000'],
  default: []
};
```
The project's canonical definition of `medium` scale comprises:
- `products`: **50,000**
- `orders`: **100,000**
- `items`: **400,000** (average 4.0 items per order)
- `vendors`: **100**
- `categories`: **30**
- `users`: **20,000**
- `reviews`: **100,000**

### 1.3 PRNG Determinism & Deliberate Distribution Skew
In `server/scripts/seedBench.js` (lines 19–28, 54, 71–219):
- **PRNG implementation**: Uses 32-bit `mulberry32(seed)` with default seed `12345`.
- **Determinism**: Given `--seed=12345`, the generator sequence, product attributes (price, rating, stock, vendor/category associations), order sizes, product selections, user selections, and review ratings are 100% deterministic.
- **Category Skew** (lines 81–90):
  - Category 0 (`Rare Collectibles`, `is_rare: true`): receives **0.5%** of products.
  - Category 1 (`Category 1`, common): receives **40.0%** of products.
  - Remaining 28 categories share the remaining **59.5%** evenly.
- **Vendor Skew** (lines 95–102): Zipf-distributed weights `1 / (i + 1)`.
- **Hot Products Skew** (lines 159, 169–170): First 0.1% of products (50 products at medium scale) receive **30%** of order item picks.
- **Temporal Skew** (lines 156–157, 165): Orders are uniformly distributed across the past 365 days (`YEAR = 365 * 24 * 3600 * 1000`). Orders within the last 7 days represent approximately **1.9%** (~1,900 orders) of total volume.
- **Relative Date Filters in Specs** (`server/pt/specs/index.js`): Queries use `@now-7d`, `@now-30d`, `@now-90d`, `@now-365d` parsed via `server/pt/querySpec.js:resolveLocalFilter()`. Seeding with `now = Date.now()` ensures the time window is aligned with query execution.

### 1.4 Batch Insertion, Drop Logic, and Index Creation
- **Drop capability** (lines 62–67): When `--drop` is passed, drops all 7 collections: `users`, `vendors`, `categories`, `products`, `orders`, `order_items`, `reviews`. If omitted, records are appended to existing collections.
- **Bulk insertion** (lines 109, 150, 192–194, 215, 257–261): Uses `insertMany(..., { ordered: false })` with batch size 5,000 (and order batch size scaled to `5000 / avgItems` ≈ 1,250 orders per flush).
- **Index creation** (lines 222–235): Indexes are automatically created on:
  - `Product`: `{ vendor_id: 1 }`, `{ category_id: 1 }`
  - `Order`: `{ user_id: 1 }`, `{ created_at: 1 }`
  - `OrderItem`: `{ order_id: 1 }`, `{ product_id: 1 }`, `{ vendor_id: 1 }`, `{ created_at: 1 }`
  - `Review`: `{ product_id: 1 }`, `{ user_id: 1 }`, `{ vendor_id: 1 }`
  - `User`: `{ email: 1 }`

### 1.5 Database Connection Isolation
In `server/pt/benchDb.js` (lines 12–28):
- Default URI: `mongodb://127.0.0.1:27018/shopsphere_bench`.
- Connection assertion: Requires URI to match `/shopsphere_bench/`, preventing accidental execution against the operational `shopsphere` database.
- Database process: Managed via `server/scripts/mongod.ps1` (or `mongod.sh`) storing data in `server/.mongo-bench-data`.

---

## 2. Logic Chain

1. **Preset Gap Identification**:
   - `Observation`: `seedBench.js:parseArgs()` accepts only `--small` and regex `--<key>=<int>`. Running `node scripts/seedBench.js --medium` throws `Unknown argument: --medium`.
   - `Inference`: Currently, to seed medium scale without code changes, all 7 parameters must be passed explicitly as done in `repro.js:19`.
   - `Inference`: Adding native support for `--medium` in `seedBench.js:parseArgs()` improves maintainability and developer ergonomics, while the explicit flag command remains 100% backward-compatible.

2. **Necessity of `--drop`**:
   - `Observation`: Without `--drop`, MongoDB does not clear collections before insertion.
   - `Inference`: Re-running without `--drop` would accumulate 100k+ products and 800k+ order items, distorting benchmark scale and invalidating determinism.

3. **Temporal Freshness Alignment**:
   - `Observation`: `seedBench.js` distributes orders over `[now - 365d, now]`. Query specs (`rare_category_revenue_7d`) filter by `created_at >= @now-7d`.
   - `Inference`: If the database was seeded months ago, the last-7-days window contains 0 documents, collapsing the join to 0 rows. A fresh re-seeding immediately prior to benchmark evaluation ensures that the 7-day window contains ~1,900 orders and ~22 surviving final join rows.

4. **Speedup Impact at Medium Scale**:
   - `Observation`: In survey 3, under medium scale (50k products, 400,692 items), `rare_category_revenue_7d` latency on join order `oi>o>p>v>cat` was **74,249 ms** for Standard MongoDB vs **991 ms** for Optimized (mongo-pt) (join phase **15 ms**), delivering a **74.9× net speedup** with `equal: ok`.
   - `Inference`: The medium scale configuration fulfills Requirement R4 by making the semi-join reduction speedup unmistakable and reproducible (>50×), while executing seeding in under 50 seconds and occupying only ~51 MB on disk.

---

## 3. Caveats

1. **Bench mongod Process Requirement**:
   - The benchmark database connects to `127.0.0.1:27018`. If the mongod daemon is not running, seeding will fail with `MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27018`. Worker must ensure mongod is active prior to seeding.
2. **`--medium` Preset Missing in `seedBench.js`**:
   - Until Worker patches `parseArgs()` in `seedBench.js`, the explicit parameter command must be used.
3. **Exact Order Item Count**:
   - Because `nItems` per order is calculated using `avgItems + (rng() * 2 - 1) * avgItems * 0.6`, the exact count of order items generated for seed 12345 is **400,692**, not exactly 400,000. This is expected and normal.

---

## 4. Conclusion

1. **Recommended Enhancement for `server/scripts/seedBench.js`**:
   Worker should add native `--medium` preset handling to `parseArgs()` in `server/scripts/seedBench.js` (lines 38–41):
   ```javascript
       if (raw === '--small') {
         Object.assign(opts, { products: 3000, orders: 12000, items: 48000, vendors: 20, categories: 12, users: 2000, reviews: 8000 });
       } else if (raw === '--medium') {
         Object.assign(opts, { products: 50000, orders: 100000, items: 400000, vendors: 100, categories: 30, users: 20000, reviews: 100000 });
       } else if (raw === '--drop') {
   ```

2. **Recommended Seeding Commands for Worker**:
   - *Option A (Explicit flags — works immediately without any code edits)*:
     ```powershell
     cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
     node scripts/seedBench.js --drop --products=50000 --orders=100000 --items=400000 --vendors=100 --categories=30 --users=20000 --reviews=100000
     ```
   - *Option B (With recommended `--medium` patch applied)*:
     ```powershell
     cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
     node scripts/seedBench.js --medium --drop
     ```

3. **Step-by-Step Validation Checklist for Worker**:
   - **Step 1: mongod status**: Verify bench mongod is running on port 27018 (`pwsh -File server\scripts\mongod.ps1 status`).
   - **Step 2: Seed execution**: Run the seeding command; confirm exit code 0 and ~45–55s duration.
   - **Step 3: Document count verification**: Run `node scripts/showDb.js` or query collection counts:
     - `products`: 50,000
     - `orders`: 100,000
     - `order_items`: ~400,000 (specifically 400,692)
     - `users`: 20,000
     - `reviews`: 100,000
     - `vendors`: 100
     - `categories`: 30
   - **Step 4: Index verification**: Confirm indexes exist on foreign keys (`showDb.js`).
   - **Step 5: PT Test Suite**: Run `npm run test:pt` (all 12 tests must pass, especially `transfer.test.js` verifying zero dangling tuples on `rare_category_revenue_7d`).
   - **Step 6: Query speedup & correctness verification**: Run `node scripts/ptExecute.js rare_category_revenue_7d --orders=2`:
     - Standard MongoDB latency: ~60–90 seconds.
     - Optimized latency: ~1 second.
     - Net speedup: >50× (satisfies requirement >1×).
     - Equivalence check: `equal: ok`.

---

## 5. Verification Method

To independently verify this investigation:

1. **Verify parseArgs behavior on `--medium`**:
   Run node one-liner:
   ```powershell
   node -e "const s = require('./server/scripts/seedBench.js');"
   ```
   Inspect `server/scripts/seedBench.js:30-48` using `view_file` to confirm `--medium` is absent from `parseArgs()`.

2. **Verify mongod & run Seeding**:
   ```powershell
   # 1. Start bench mongod if not active
   pwsh -File server\scripts\mongod.ps1 status
   pwsh -File server\scripts\mongod.ps1 start

   # 2. Seed medium scale
   cd server
   node scripts/seedBench.js --drop --products=50000 --orders=100000 --items=400000 --vendors=100 --categories=30 --users=20000 --reviews=100000
   ```

3. **Verify Database Counts and Schema**:
   ```powershell
   cd server
   node scripts/showDb.js
   ```
   *Expected*: `shopsphere_bench` contains 50,000 products, 100,000 orders, 400,692 order items, 20,000 users, 100,000 reviews, 100 vendors, 30 categories, with ~51 MB storage size.

4. **Verify Automated PT Test Suite**:
   ```powershell
   cd server
   npm run test:pt
   ```
   *Expected*: 12 tests pass, 0 fail.

5. **Verify Live Speedup and Parity**:
   ```powershell
   cd server
   node scripts/ptExecute.js rare_category_revenue_7d --orders=2
   ```
   *Expected*: Standard MongoDB latency ~70s+, Optimized join latency ~15-20ms, Speedup > 50×, result parity `equal: ok`.

6. **Invalidation Conditions**:
   - `seedBench.js` failing or throwing out of memory during bulk insert.
   - Collection document counts diverging from medium scale specifications.
   - Any test failure in `npm run test:pt`.
   - Results mismatch (`resultsEqual` false) between Standard MongoDB and Optimized (mongo-pt).
