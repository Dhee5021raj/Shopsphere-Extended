# Milestone 1 Adversarial Challenge Report: Benchmark Dataset Scaling & Integrity

**Agent**: `teamwork_challenger_m1_1`  
**Milestone**: M1  
**Verdict**: **REJECT** (Blocking on CLI argument parsing & mutation safety in `seedBench.js`)

---

## 1. Observation

### 1.1 Direct Inspection of `shopsphere_bench` on MongoDB Port 27018
- Command:
  ```powershell
  node -e "const { MongoClient } = require('./server/node_modules/mongodb'); ..."
  ```
- Result:
  Connected directly to `mongodb://127.0.0.1:27018/shopsphere_bench`.
  Collection document counts:
  - `products`: 50,000
  - `orders`: 100,000
  - `order_items`: 400,692
  - `users`: 20,000
  - `reviews`: 100,000
  - `vendors`: 100
  - `categories`: 30
- Data Authenticity & Calculation Consistency:
  - Sampled products showed realistic prices (min 100, max 99,996, mean 50,082.34), realistic ratings (1.0 to 5.0, mean 3.01), realistic demo names (`AeroBlade Gaming Laptop Pro 0`, etc.), and proper timestamps across a 1-year window (`2025-10-27` to `2026-10-27`).
  - Sampled 200 random orders: for 100% of sampled orders, `orders.total_amount` exactly matched the computed sum of `order_items.line_total` (`sum === total_amount`, 0 mismatches).

### 1.2 Exhaustive Foreign Key Referential Integrity Verification
- Command:
  Evaluated complete relational integrity across the entire database using in-memory ObjectId sets and streaming cursors over 400,692 items:
- Verbatim Output:
  ```
  Connected to shopsphere_bench. Starting exhaustive foreign key verification...
  Loading primary keys...
  Loaded PKs: users=20000, vendors=100, categories=30, products=50000, orders=100000
  Checking products FKs (vendor_id, category_id)...
  Products FK check completed. Errors: 0
  Checking orders FKs (user_id)...
  Orders FK check completed. Errors: 0
  Checking all 400k+ order_items FKs (order_id, product_id, vendor_id)...
  Checked 400692 order_items in 6.4s:
    missing order_id: 0
    missing product_id: 0
    missing vendor_id: 0
  Checking reviews FKs (user_id, product_id, vendor_id)...
  Checked 100000 reviews:
    missing user_id: 0
    missing product_id: 0
    missing vendor_id: 0

  TOTAL REFERENTIAL INTEGRITY ERRORS ACROSS ENTIRE DB: 0
  ```

### 1.3 Adversarial Stress-Testing of CLI Argument Parsing in `server/scripts/seedBench.js`
- Inspected `server/scripts/seedBench.js` lines 36–48:
  ```javascript
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
  ```
- Identified Flaws:
  1. The regex `/^--([a-z]+)=(-?\d+)$/` permits negative integers (`-?\d+`).
  2. Any argument matching `[a-z]+` is blindly stored in `opts` (e.g. `--unknownkey=50`), bypassing option validation.
  3. No validation is conducted before connecting to MongoDB or executing collection modifications.
- Empirical Attack Scenario & Database Corruption:
  Executed: `node server/scripts/seedBench.js --products=-50`
  Verbatim output:
  ```
  [seedBench] uri=mongodb://127.0.0.1:27018/shopsphere_bench seed=12345
  [seedBench] scale: {
    products: -50,
    orders: 1000000,
    items: 4000000,
    vendors: 200,
    categories: 50,
    users: 100000,
    reviews: 1000000,
    seed: 12345,
    batch: 5000,
    drop: false
  }
  [seedBench] categories: 50 (rare=6ae085df151ca6890c5338bd, common=6ae085df151ca6890c5338be)
  [seedBench] vendors: 200 (Zipf-skewed)
  [seedBench] users: 100000
  [seedBench] FAILED: RangeError: Invalid array length
      at main (C:\GEMINI\DBMS_PRJ\Shopsphere\server\scripts\seedBench.js:116:22)
  ```
  Post-execution collection count check:
  - `users`: increased from 20,000 to **120,000**
  - `vendors`: increased from 100 to **300**
  - `categories`: increased from 30 to **80**
  - The script inserted 100,000 users and 200 vendors into the active database before crashing at `const productIds = new Array(opts.products);` (line 116), leaving the database in an inconsistent state.

### 1.4 Execution of `server/scripts/verifyBench.js`
- Executed on clean `--medium` state: `node server/scripts/verifyBench.js`
- Verbatim Output:
  ```
  [VERIFY] Connecting to mongodb://127.0.0.1:27018/shopsphere_bench...
  [VERIFY] Checking collection document counts:
    ✓ PASS products: 50000 (min expected: 50000)
    ✓ PASS orders: 100000 (min expected: 100000)
    ✓ PASS order_items: 400692 (min expected: 400000)
    ✓ PASS users: 20000 (min expected: 20000)
    ✓ PASS reviews: 100000 (min expected: 100000)
    ✓ PASS vendors: 100 (min expected: 100)
    ✓ PASS categories: 30 (min expected: 30)

  [VERIFY] Checking required secondary indexes:
    ✓ PASS products.category_id_1
    ✓ PASS products.vendor_id_1
    ✓ PASS orders.user_id_1
    ✓ PASS orders.created_at_1
    ✓ PASS order_items.order_id_1
    ✓ PASS order_items.product_id_1
    ✓ PASS order_items.vendor_id_1
    ✓ PASS order_items.created_at_1
    ✓ PASS reviews.product_id_1
    ✓ PASS reviews.user_id_1
    ✓ PASS reviews.vendor_id_1
    ✓ PASS users.email_1

  [VERIFY] Checking deliberate academic skew:
    ✓ PASS Rare category product share: 0.52% (expected 0.2% - 1.5%)
    ✓ PASS 7-day order volume: 1.87% (expected 1.0% - 3.0%)

  [VERIFY] Summary: ALL CHECKS PASSED
  ```
- Exit code: 0.

### 1.5 Execution of `npm run test:pt` and Core PT Unit Tests
- Executed: `npm run test:pt` (`node --test tests/*.test.js`)
  - Total tests run: 66
  - Tests passing: 62
  - Tests failing: 4
  - The 4 failures in `server/tests/e2e_pt_revamp.test.js`:
    - `T1.1.1 [R1-Status-Standard]`: Failed with `M2 Requirement: pt-status must expose "standard" phase object`
    - `T1.1.2 [R1-Status-Optimized]`: Failed with `M2 Requirement: pt-status must expose "optimized" phase object`
    - `T1.1.4 [R1-Metrics-UpdatedKeys]`: Failed with `M2 Requirement: pt-metrics must emit "avgStandardMs"`
    - `T1.3.1 [R3-PerSpec-Description]`: Failed with `M2 Requirement: perSpecStats entry must include "description"`
    All 4 failing tests are explicitly designated for Milestone M2.
  - All M1 and dataset scaling tests in `e2e_pt_revamp.test.js` passed: `T1.4.1`, `T1.4.2`, `T1.4.3`, `T1.4.4`, `T4.5`.
- Executed Core PT Test Suite: `node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js`
  - Results: 12 tests passed, 0 failed, duration 7.7s, exit code 0.

### 1.6 Empirical Multi-Relation Speedup & Equality Check
- Executed: `node server/scripts/ptExecute.js rare_category_revenue_7d --orders=1`
- Verbatim Output:
  ```
  SPEC rare_category_revenue_7d: 28 valid join orders, testing 1
    transfer=614ms  materialization=212ms  skipped=[]
     {"order":"oi>o>p>v>cat","naive_ms":91489,"exact_join_ms":14,"exact_total_ms":840,"bloom_join_ms":null,"bloom_total_ms":null,"equal":"ok","checksum":"12:7b0d582f"}

  [ptExecute] equality failures: 0
  ```
  - Standard MongoDB Latency: **91,489 ms** (~91.5 s)
  - Optimized (mongo-pt) Join Latency: **14 ms**
  - Optimized (mongo-pt) Total Latency: **840 ms**
  - Net Speedup: **108.9×**
  - Join Speedup: **6,534.9×**
  - Result Equivalence: `equal: "ok"`, `checksum: "12:7b0d582f"`, 0 equality failures.

---

## 2. Logic Chain

1. **Benchmark Scale & Relational Integrity (Observations 1.1, 1.2, 1.4, 1.6)**:
   - The seeded database contains genuine, mathematically coherent data across 400k+ items and 100k orders.
   - Exhaustive checks confirmed 0 foreign key mismatches across all collections.
   - The benchmark query demonstrates substantial performance gains (108.9× speedup) while maintaining perfect result parity (`equal: ok`).
   - All core PT unit tests (12/12) and M1-scoped E2E tests pass.

2. **Argument Parsing & Mutation Safety Flaw (Observation 1.3)**:
   - Dispatch item 3 instructed: *"Test argument parsing robustness: ensure invalid flags or negative values are properly handled by seedBench.js"*.
   - In `seedBench.js`, `parseArgs` uses `/^--([a-z]+)=(-?\d+)$/`.
   - Because `-?` is permitted, negative values (`--products=-50`, `--orders=-10`) are parsed as valid integers.
   - Because option keys are not validated against an allowlist, arbitrary flags (`--unknown=10`) are accepted.
   - Most critically, validation does NOT occur prior to executing database mutations. When invoked with `--products=-50`, `seedBench.js` connected to the active database, modified `categories`, `vendors`, and inserted 100,000 `users` before aborting on line 116 with `RangeError: Invalid array length`.
   - This corrupts database state whenever a developer or automated script provides an invalid or negative configuration.

3. **Conclusion Attribution**:
   - Because `seedBench.js` fails to properly handle negative values and invalid flags, dispatch requirement 3 is not met.
   - Therefore, the appropriate adversarial verdict is **REJECT**, with a concrete and straightforward mitigation path for Worker M1.

---

## 3. Caveats

- **M2 Endpoint Tests**: `npm run test:pt` triggers `e2e_pt_revamp.test.js`, which asserts backend keys (`standard`, `optimized`, `description`) planned for Milestone M2. Those 4 failures are normal and expected for M1.
- **Pristine State Restored**: Following the negative input test that inserted partial records, `node server/scripts/seedBench.js --medium --drop` was executed. The database has been confirmed to be in a pristine medium state (`users: 20000`, `products: 50000`, `order_items: 400692`, etc.).

---

## 4. Conclusion & Recommended Action

**Verdict: REJECT**

### Vulnerability Report: VULN-M1-01
- **Severity**: HIGH (causes silent partial database mutation followed by unhandled crash).
- **Location**: `server/scripts/seedBench.js` lines 30–50 (`parseArgs`).
- **Trigger**: `node scripts/seedBench.js --products=-50` (or any negative/zero scale flag or unrecognized key).
- **Impact**: Pollutes active MongoDB collections with partial batch inserts before terminating with `RangeError: Invalid array length`.

### Recommended Remediation for Worker M1:
Update `parseArgs` in `server/scripts/seedBench.js` to:
1. Define an explicit allowlist of supported numeric flags:
   `const NUMERIC_KEYS = new Set(['products', 'orders', 'items', 'vendors', 'categories', 'users', 'reviews', 'seed', 'batch']);`
2. Reject negative or non-positive integers for scale parameters (`val <= 0` throws `Error: Value for --${key} must be a positive integer`).
3. Reject unknown keys (`if (!NUMERIC_KEYS.has(key)) throw new Error('Unknown argument: ...')`).
4. Perform all validation in `parseArgs` before `main()` opens any connection or runs any database operations.

Once Worker M1 applies this input validation fix, Milestone M1 will be ready for immediate approval.

---

## 5. Verification Method

To verify the vulnerability and the fix:
1. **Adversarial Input Test (Should fail gracefully with clean error message and 0 DB mutations)**:
   ```powershell
   node server/scripts/seedBench.js --products=-50
   ```
   *Expected behavior*: Throws `Error: Value for --products must be a positive integer` immediately, with exit code 1, WITHOUT connecting to or modifying MongoDB.

2. **Verify Clean Seeding & Counts**:
   ```powershell
   node server/scripts/verifyBench.js
   ```
   *Expected behavior*: Exit code 0, `ALL CHECKS PASSED`.

3. **Verify Core PT Tests**:
   ```powershell
   cd server; node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js
   ```
   *Expected behavior*: 12/12 pass, exit code 0.
