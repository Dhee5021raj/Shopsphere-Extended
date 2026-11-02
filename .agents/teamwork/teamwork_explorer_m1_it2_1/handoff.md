# Investigation Report: Fail-Fast Input Validation Architecture for `seedBench.js` (VULN-M1-01)

**Agent**: `teamwork_explorer_m1_it2_1`  
**Milestone**: M1 Iteration 2  
**Target File**: `server/scripts/seedBench.js`  
**Working Directory**: `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_it2_1`

---

## 1. Observation

### 1.1 Vulnerability Trace in `server/scripts/seedBench.js`
In `server/scripts/seedBench.js` lines 30–50:
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

### 1.2 Flaws Identified
1. **Unbounded Option Key Assignment**: The regex `/^--([a-z]+)=(-?\d+)$/` captures any lowercase string as an option key (`m[1]`). An unrecognized parameter such as `--unknown=50` or `--timeout=1000` is silently stored into `opts` without validation against supported flags.
2. **Acceptance of Negative and Zero Integers**: The pattern `(-?\d+)` explicitly accepts negative numbers. Passing `--products=-50` or `--orders=-10` parses as `-50` or `-10`. Zero values (e.g., `--orders=0`, `--batch=0`, `--seed=0`) are also accepted.
3. **Deferred Execution Failure and Database Corruption**:
   In `main()` (lines 54–120):
   ```javascript
   async function main() {
     const opts = parseArgs(process.argv);
     const rng = mulberry32(opts.seed);
     const randInt = (n) => Math.floor(rng() * n);

     console.log(`[seedBench] uri=${benchUri()} seed=${opts.seed}`);
     console.log(`[seedBench] scale:`, opts);
     await connectBench();
     const db = mongoose.connection.db;

     if (opts.drop) { ... }

     // ── categories ── (opts.categories inserted)
     // ── vendors ── (opts.vendors inserted)
     // ── users ── (opts.users inserted)
     // ── products ──
     const productIds = new Array(opts.products); // Line 116 CRASH
   ```
   Because `parseArgs()` did not reject negative values, `main()` connected to MongoDB, inserted categories, inserted vendors, and inserted users before crashing on line 116 with `RangeError: Invalid array length`.
   As documented by Challenger M1-1 in `teamwork_challenger_m1_1/handoff.md`, running `node server/scripts/seedBench.js --products=-50` resulted in inserting 100,000 users and 200 vendors into the active database before crashing, corrupting the database state.
4. **Lack of Export for Unit Testing**: `seedBench.js` unconditionally calls `main().catch(...)` on line 265 and does not export `parseArgs`, forcing any test harness to spawn child processes rather than testing argument validation in-process.

---

## 2. Logic Chain

1. **Root Cause Analysis (Observations 1.1, 1.2)**:
   - The CLI argument parser in `seedBench.js` operates permissively: it lacks a whitelist of allowed keys and allows negative numbers matching `-?\d+`.
   - The seeder algorithm mathematically depends on positive integers: array allocations (`new Array(opts.products)`), modulo indexing (`NAME_POOL[i % NAME_POOL.length]`), division by batch sizes (`opts.orders / opts.batch`), and random user selection (`userIds[randInt(opts.users)]`). If any numeric parameter is $\le 0$, division by zero, invalid array length, or out-of-bounds indexing occurs.

2. **Validation Timing & Fail-Fast Principle (Observation 1.3)**:
   - To guarantee zero database mutations on invalid inputs, all CLI validation must execute synchronously in `parseArgs(process.argv)` before `connectBench()` or any database operations are initiated.
   - If an unrecognized option or non-positive value is encountered, an error must be thrown immediately. Because `parseArgs` is called at the entry of `main()`, throwing an error halts the async execution flow prior to `await connectBench()`, ensuring 0 database connections, 0 collection drops, and 0 batch inserts.

3. **Allowlist Specification (DISPATCH & Challenger Requirements)**:
   - The complete set of 12 supported options consists of:
     - 3 standalone boolean/preset flags: `--drop`, `--small`, `--medium`.
     - 9 numeric parameters: `products`, `orders`, `items`, `vendors`, `categories`, `users`, `reviews`, `seed`, `batch`.
   - Any flag not belonging to these two categories must be rejected with `Error: Unknown argument: ${raw}`.
   - Any numeric parameter whose value is not a strictly positive integer ($val \le 0$, NaN, non-integer, or empty) must be rejected with `Error: Value for --${key} must be a positive integer`.

4. **Empirical Verification of Parser Behavior**:
   - The proposed parser design was executed against a comprehensive test matrix of 12 scenarios (valid combinations, negatives, zeroes, floats, strings, unknown flags, and standalone flag variants).
   - 100% of adversarial cases threw the exact required error string, and 100% of valid configurations passed without error.

---

## 3. Caveats

- **No Caveats**: The problem boundary is strictly contained to `server/scripts/seedBench.js`. The proposed validation does not modify default values or alter the downstream seeding logic, nor does it impact existing caller scripts (`server/scripts/repro.js`, `server/package.json`).

---

## 4. Conclusion & Recommended Implementation for Worker

### 4.1 Architecture Overview
Implement a strict two-stage argument validation in `server/scripts/seedBench.js`:
1. **Option Allowlist**: An explicit `Set` of 9 numeric parameter names and dedicated handling for the 3 recognized standalone flags (`--small`, `--medium`, `--drop`).
2. **Strict Positive Integer Validation**: Check that the raw value matches `/^-?\d+$/`, parses to a safe integer (`Number.isSafeInteger`), and satisfies $val > 0$.
3. **Fail-Fast Boundary**: Validate arguments in `parseArgs(process.argv)` at the beginning of execution, before `connectBench()` or MongoDB connections occur.
4. **Module Export Guard**: Protect `main().catch(...)` with `if (require.main === module)` and export `{ parseArgs, NUMERIC_KEYS, main }` to allow automated unit testing.

### 4.2 Exact Code Replacement for `server/scripts/seedBench.js`

#### Change 1: Replace lines 30–50 (`parseArgs`) with:
```javascript
const NUMERIC_KEYS = new Set([
  'products', 'orders', 'items', 'vendors', 'categories',
  'users', 'reviews', 'seed', 'batch'
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
      const match = /^--([a-zA-Z0-9_-]+)=(.*)$/.exec(raw);
      if (!match) {
        throw new Error(`Unknown argument: ${raw}`);
      }
      const [, key, rawVal] = match;
      if (!NUMERIC_KEYS.has(key)) {
        throw new Error(`Unknown argument: ${raw}`);
      }
      const isInteger = /^-?\d+$/.test(rawVal);
      const val = isInteger ? parseInt(rawVal, 10) : NaN;
      if (!isInteger || !Number.isSafeInteger(val) || val <= 0) {
        throw new Error(`Value for --${key} must be a positive integer`);
      }
      opts[key] = val;
    }
  }
  return opts;
}
```

#### Change 2: Replace line 265 (`main() invocation`) with:
```javascript
if (require.main === module) {
  main().catch((err) => { console.error('[seedBench] FAILED:', err); process.exit(1); });
}

module.exports = { parseArgs, NUMERIC_KEYS, main };
```

---

## 5. Verification Method

The Worker and Challenger can independently verify this implementation using the following procedures:

### 5.1 Adversarial CLI Verification (Must Fail Fast with 0 DB Mutations)
Run the following adversarial commands from the repository root:

1. **Negative Value**:
   ```powershell
   node server/scripts/seedBench.js --products=-50
   ```
   - **Expected Result**: Exits with status code 1.
   - **Verbatim Output**: `[seedBench] FAILED: Error: Value for --products must be a positive integer`
   - **DB Check**: No connection attempt logged, 0 changes to `shopsphere_bench`.

2. **Zero Value**:
   ```powershell
   node server/scripts/seedBench.js --orders=0
   ```
   - **Expected Result**: Exits with status code 1.
   - **Verbatim Output**: `[seedBench] FAILED: Error: Value for --orders must be a positive integer`

3. **Unknown Key-Value Option**:
   ```powershell
   node server/scripts/seedBench.js --unknown=10
   ```
   - **Expected Result**: Exits with status code 1.
   - **Verbatim Output**: `[seedBench] FAILED: Error: Unknown argument: --unknown=10`

4. **Unknown Standalone Option**:
   ```powershell
   node server/scripts/seedBench.js --unknown
   ```
   - **Expected Result**: Exits with status code 1.
   - **Verbatim Output**: `[seedBench] FAILED: Error: Unknown argument: --unknown`

5. **Invalid Data Type (Float/String)**:
   ```powershell
   node server/scripts/seedBench.js --products=12.5
   node server/scripts/seedBench.js --products=abc
   ```
   - **Expected Result**: Exits with status code 1.
   - **Verbatim Output**: `[seedBench] FAILED: Error: Value for --products must be a positive integer`

### 5.2 Valid Execution Verification
1. **Valid Medium Preset Execution**:
   ```powershell
   node server/scripts/seedBench.js --medium --drop
   ```
   - **Expected Result**: Successfully seeds database to 50k products, 100k orders, 400k items, exit code 0.

2. **Benchmark Integrity Verification**:
   ```powershell
   node server/scripts/verifyBench.js
   ```
   - **Expected Result**: `[VERIFY] Summary: ALL CHECKS PASSED`, exit code 0.

3. **Core PT Test Suite**:
   ```powershell
   cd server; node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js
   ```
   - **Expected Result**: 12/12 tests passing, exit code 0.
