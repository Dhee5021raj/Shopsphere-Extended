# Milestone 1 Iteration 2 Investigation Report: Database State Cleanliness & Mutation Safety

**Agent**: `teamwork_explorer_m1_it2_2`  
**Milestone**: M1 (Iteration 2)  
**Investigation Focus**: Current `shopsphere_bench` database state, `--medium --drop` reseeding verification, and pre-connection CLI mutation safety checks for VULN-M1-01.

---

## 1. Observation

### 1.1 Direct Inspection of `shopsphere_bench` on Port 27018
- Direct connection via MongoDB client (`mongodb://127.0.0.1:27018/shopsphere_bench`) and `scripts/showDb.js` confirmed:
  - Database disk footprint: **50.5 MB**
  - Collection document counts:
    - `products`: **50,000**
    - `orders`: **100,000**
    - `order_items`: **400,692**
    - `users`: **20,000**
    - `reviews`: **100,000**
    - `vendors`: **100**
    - `categories`: **30**
  - All 12 secondary join-key indexes exist and are valid:
    - `products`: `category_id_1`, `vendor_id_1`
    - `orders`: `user_id_1`, `created_at_1`
    - `order_items`: `order_id_1`, `product_id_1`, `vendor_id_1`, `created_at_1`
    - `reviews`: `product_id_1`, `user_id_1`, `vendor_id_1`
    - `users`: `email_1`
  - Deliberate academic skew confirmed:
    - Rare category product share: **0.52%** (expected 0.2% - 1.5%)
    - 7-day order volume: **1.87%** (1,873 of 100,000 orders, expected 1.0% - 3.0%)

### 1.2 Verification of Clean `--medium --drop` Reseeding
- Executed `node server/scripts/seedBench.js --medium --drop` (task-30):
  - Execution duration: **45.6 seconds**
  - Exit code: **0**
  - Cleanly dropped all 7 collections and reconstructed dataset with deterministic seed (`12345`).
  - Resulting collection counts match expected pristine `--medium` specifications exactly.
- Executed `node server/scripts/verifyBench.js`:
  - Result: `[VERIFY] Summary: ALL CHECKS PASSED` (exit code: 0).

### 1.3 Benchmark Query Performance & Result Parity
- Executed `node server/scripts/ptExecute.js rare_category_revenue_7d --orders=1` (task-40):
  - Standard MongoDB left-deep join (`naive_ms`): **82,456 ms** (~82.5 s)
  - Optimized (mongo-pt) Join (`exact_join_ms`): **17 ms**
  - Optimized (mongo-pt) Total (`exact_total_ms`): **1,111 ms**
  - Total Query Speedup: **74.2×**
  - Direct Join Speedup: **4,850×**
  - Result Equality: `equal: "ok"`, checksum: `"12:b9232869"`, equality failures: **0**.

### 1.4 Test Suite Verification
- Core PT Test Suite (`cd server; node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js`):
  - Results: **12 passed**, 0 failed, duration 8.4s, exit code 0.
- E2E PT Revamp M1 Tests (`cd server; node --test --test-name-pattern="R4-Scale|R4-Gains|Scenario-LiveBenchEquivalence" tests/e2e_pt_revamp.test.js`):
  - Results: **6 passed** (`T1.5.1`, `T1.5.2`, `T1.5.3`, `T1.5.4`, `T1.5.5`, `T4.5`), 0 failed, exit code 0.

### 1.5 Code Inspection of `server/scripts/seedBench.js` (Root Cause of VULN-M1-01)
- Inspected lines 30–70:
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
      } else if (raw === '--medium') {
        Object.assign(opts, { products: 50000, orders: 100000, items: 400000, vendors: 100, categories: 30, users: 20000, reviews: 100000 });
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
- Vulnerability mechanism:
  1. Regex `/^--([a-z]+)=(-?\d+)$/` matches negative numbers (`-?\d+`) and arbitrary unvalidated keys (`[a-z]+`).
  2. `parseArgs` does not validate key presence in an allowlist, nor does it check positive bounds on values.
  3. `main()` connects to MongoDB via `await connectBench()` and executes drop/inserts BEFORE encountering downstream errors (e.g. `const productIds = new Array(opts.products);` throws `RangeError: Invalid array length`).
  4. Crucially: Even if combined with `--drop` (e.g. `--drop --products=-50`), the script drops collections in `main()` before failing, destroying existing data without completing the seed.

---

## 2. Logic Chain

1. **Current State Verification (Observation 1.1, 1.2, 1.3, 1.4)**:
   - The active database on port 27018 is currently clean, intact, and conforms 100% to M1 specifications: exactly 50k products, 400,692 order items, 100k orders, 20k users, 100k reviews, 100 vendors, 30 categories, all 12 indexes, verified 74.2× speedup, and 0 equality errors.
   - Idempotent clean seeding via `node server/scripts/seedBench.js --medium --drop` was directly executed and confirmed to finish in 45.6s, returning the database to this pristine state.

2. **Vulnerability Mechanics & Causation (Observation 1.5)**:
   - Challenger M1-1 properly flagged VULN-M1-01 because invoking `seedBench.js` with invalid arguments (e.g., negative integers or unknown options) causes partial database modifications before an unhandled crash occurs.
   - The failure point is that input argument validation does not occur prior to database connection.
   - Because `parseArgs` returns without checking if parsed parameters are valid integers > 0 and members of a known option allowlist, `main()` opens a connection and modifies or drops collections.

3. **Remediation & Mutation Safety Requirement**:
   - To guarantee zero database mutations on invalid inputs:
     1. `parseArgs()` must validate all flags against a strict allowlist.
     2. `parseArgs()` must enforce that all scale options (`products`, `orders`, `items`, `vendors`, `categories`, `users`, `reviews`, `batch`) are positive integers (`> 0`), and `seed` is a non-negative integer (`>= 0`).
     3. Any invalid argument must immediately throw an Error inside `parseArgs()`.
     4. Because `parseArgs(process.argv)` is called before `await connectBench()`, any validation error aborts execution before `connectBench()` or `drop()` is ever called, guaranteeing zero network connection to MongoDB and zero database mutation.

---

## 3. Caveats

- **Expected M2 Failures in Full Test Suite**:
  Running `npm run test:pt` executes `server/tests/e2e_pt_revamp.test.js`. In that file, tests `T1.1.1`, `T1.1.2`, `T1.1.4`, and `T1.3.1` fail with messages indicating that M2 backend requirements (exposing `standard`/`optimized` phase objects, `avgStandardMs`, and spec `description`) are not yet implemented. This is expected and documented in `PROJECT.md` for Milestone M2.
- **No Source Code Changes Applied**:
  As an Explorer agent in read-only mode, no modifications were made to `seedBench.js` in this turn. The exact drop-in fix is detailed below for Worker M1.

---

## 4. Conclusion & Recommended Worker Remediation

### Proposed Fix for `server/scripts/seedBench.js`
Replace `parseArgs` (lines 30–50) with:

```javascript
const ALLOWED_NUMERIC_KEYS = new Set([
  'products', 'orders', 'items', 'vendors', 'categories', 'users', 'reviews', 'seed', 'batch'
]);

function parseArgs(argv) {
  const opts = {
    products: 200000, orders: 1000000, items: 4000000,
    vendors: 200, categories: 50, users: 100000, reviews: 1000000,
    seed: 12345, batch: 5000, drop: false
  };

  for (const raw of argv.slice(2)) {
    if (raw === '--small') {
      Object.assign(opts, { products: 3000, orders: 12000, items: 48000, vendors: 20, categories: 12, users: 2000, reviews: 8000 });
    } else if (raw === '--medium') {
      Object.assign(opts, { products: 50000, orders: 100000, items: 400000, vendors: 100, categories: 30, users: 20000, reviews: 100000 });
    } else if (raw === '--drop') {
      opts.drop = true;
    } else {
      const m = /^--([a-z_]+)=(.*)$/.exec(raw);
      if (!m) throw new Error(`Unknown argument: ${raw}`);
      const key = m[1];
      const valStr = m[2];

      if (!ALLOWED_NUMERIC_KEYS.has(key)) {
        throw new Error(`Unknown argument: ${raw}`);
      }

      if (!/^-?\d+$/.test(valStr)) {
        throw new Error(`Value for --${key} must be an integer, got: ${valStr}`);
      }

      const val = parseInt(valStr, 10);
      if (key === 'seed') {
        if (val < 0) throw new Error(`Value for --seed must be a non-negative integer, got: ${val}`);
      } else {
        if (val <= 0) throw new Error(`Value for --${key} must be a positive integer, got: ${val}`);
      }

      opts[key] = val;
    }
  }
  return opts;
}
```

---

## 5. Verification Method (For Worker M1 & Challenger M1-2)

Worker and Challenger should run the following independent checks:

### Check 1: Mutation Safety on Negative Scale Value
```powershell
# Record counts before
node -e "const { MongoClient } = require('./server/node_modules/mongodb'); (async () => { const c = new MongoClient('mongodb://127.0.0.1:27018/shopsphere_bench'); await c.connect(); console.log('users_before:', await c.db().collection('users').countDocuments()); await c.close(); })()"

# Attempt invalid seed
node server/scripts/seedBench.js --products=-50
# Expected: Exits with code 1, stderr contains "Value for --products must be a positive integer", does NOT log "[seedBench] uri=..."

# Verify counts after (must be identical)
node -e "const { MongoClient } = require('./server/node_modules/mongodb'); (async () => { const c = new MongoClient('mongodb://127.0.0.1:27018/shopsphere_bench'); await c.connect(); console.log('users_after:', await c.db().collection('users').countDocuments()); await c.close(); })()"
```
*Pass condition*: Exit code 1, `users_before === users_after`.

### Check 2: Mutation Safety on Unknown Flag Combined with `--drop`
```powershell
# Attempt invalid seed with --drop
node server/scripts/seedBench.js --drop --unknownflag=50
# Expected: Exits with code 1, stderr contains "Unknown argument: --unknownflag=50"

# Verify products count is still 50000 (not dropped)
node -e "const { MongoClient } = require('./server/node_modules/mongodb'); (async () => { const c = new MongoClient('mongodb://127.0.0.1:27018/shopsphere_bench'); await c.connect(); const p = await c.db().collection('products').countDocuments(); console.log('products:', p); if (p !== 50000) process.exit(1); await c.close(); })()"
```
*Pass condition*: Exit code 1 on command, database collections are NOT dropped.

### Check 3: Zero Value Rejection
```powershell
node server/scripts/seedBench.js --batch=0
# Expected: Exits with code 1, stderr contains "Value for --batch must be a positive integer"
```

### Check 4: Non-Numeric Value Rejection
```powershell
node server/scripts/seedBench.js --products=abc
# Expected: Exits with code 1, stderr contains "Value for --products must be an integer, got: abc"
```

### Check 5: Verification of Pristine Medium Dataset & Core PT Tests
```powershell
node server/scripts/verifyBench.js
cd server; node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js
```
*Pass condition*: Both exit with code 0 (`ALL CHECKS PASSED`, 12/12 tests passed).
