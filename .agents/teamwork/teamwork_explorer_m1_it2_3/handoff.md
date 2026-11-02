# Adversarial Verification Suite for seedBench.js CLI Arguments

**Agent**: `teamwork_explorer_m1_it2_3`  
**Milestone**: M1 Iteration 2 (Benchmark Dataset Scaling & CLI Robustness)  
**Task**: Design adversarial verification suite for `seedBench.js` CLI arguments (negative values, unknown options, zero values, and preset flags), formulate verification commands for Worker, and guarantee zero database mutation on invalid input.

---

## 1. Observation

### 1.1 Root Cause & File Inspection in `server/scripts/seedBench.js`
- **Location**: `server/scripts/seedBench.js` lines 30–50 (`parseArgs`), lines 54–62 (`main`), line 265 (`main().catch(...)`).
- **Verbatim Code (`server/scripts/seedBench.js:30-50`)**:
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
- **Observed Vulnerabilities**:
  1. **Negative Value Acceptance**: Regex `/^--([a-z]+)=(-?\d+)$/` explicitly allows negative numbers due to `-?`. Passing `--products=-50` assigns `-50` to `opts.products`.
  2. **Unbounded Key Acceptance**: Any alphanumeric key matching `[a-z]+` is assigned directly to `opts` without checking against an allowlist. Passing `--unknown=10` assigns `opts.unknown = 10` without raising an error.
  3. **Zero Value Acceptance**: Passing `--orders=0` or `--products=0` assigns `0` to scale parameters without throwing an error.
  4. **Late Crash After Partial DB Writes**: In `main()` (lines 54–62), `parseArgs()` does not reject invalid arguments. The script logs `[seedBench] uri=...`, connects to MongoDB via `await connectBench()`, inserts 50 categories, inserts 200 vendors, and inserts 100,000 users before crashing on line 116 (`new Array(opts.products)`) with `RangeError: Invalid array length`.
  5. **Missing Module Exports & Guard**: On line 265, `seedBench.js` invokes `main().catch(...)` unconditionally at top level without `if (require.main === module)` and does not export `parseArgs`, which prevents in-memory unit testing of CLI parsing logic.

### 1.2 Inspection of `server/scripts/verifyBench.js`
- **Location**: `server/scripts/verifyBench.js` lines 1–73.
- **Current Behavior**:
  - Connects to `mongodb://127.0.0.1:27018/shopsphere_bench`.
  - Checks collection counts (`products >= 50000`, `orders >= 100000`, `order_items >= 400000`, etc.).
  - Checks secondary indexes.
  - Checks academic skew (rare category 0.2%–1.5%, 7-day orders 1.0%–3.0%).
- **Gap Identified**:
  - `verifyBench.js` has zero CLI argument testing and zero verification that adversarial inputs fail cleanly without mutating the database.

---

## 2. Logic Chain

1. **Failure Vector Analysis (VULN-M1-01)**:
   - When a CLI script accepts negative, zero, or unrecognized options and opens a database connection before validating those arguments, any error occurring downstream during batch generation corrupts persistent database state.
   - For a production-ready and academic-grade benchmark suite, validation must be strictly fail-fast: parse and validate all inputs *synchronously before* initiating database connections or logging runtime parameters.

2. **Adversarial Verification Strategy**:
   To ensure complete protection against regressions and satisfy Challenger M1-1's rejection criteria, the verification suite must test across four distinct vectors:
   - **Vector 1 (Negative Inputs)**: Test `--products=-50`, `--orders=-10`, `--items=-1`, `--vendors=-5`, `--categories=-2`, `--users=-100`, `--reviews=-20`, `--batch=-500`, `--seed=-1`. Each must immediately exit with non-zero status (code 1) and emit a descriptive error (`Value for --${key} must be a positive integer`).
   - **Vector 2 (Zero Values)**: Test `--products=0`, `--orders=0`, `--items=0`, `--vendors=0`, `--categories=0`, `--users=0`, `--reviews=0`, `--batch=0`. Each must exit with non-zero status and emit the same error.
   - **Vector 3 (Unknown / Malformed Arguments)**: Test `--unknown=10`, `--badparam=99`, `--badflag`, `--drop=true`, `--products=abc`, `--products=12.5`. Each must exit with non-zero status and emit an unknown/invalid error (`Unknown argument: ...` or `Invalid integer value for --...`).
   - **Vector 4 (Valid Scale Presets & Combinations)**: Test `--medium` (50k products, 100k orders, 400k items), `--small` (3k products, 12k orders, 48k items), `--drop`, `--medium --drop`, and valid custom overrides (e.g. `--products=500 --orders=1000 --seed=9999`). Must parse without error and produce exact options.

3. **Zero Mutation Guarantee**:
   - The test suite must assert that during adversarial invocations:
     - The process does NOT output `[seedBench] uri=` or `[seedBench] scale:`.
     - When executed against an active MongoDB instance, a count snapshot of all 7 collections taken before vs. after execution confirms `delta === 0` across all collections.

4. **Test Architecture Selection**:
   - Rather than relying solely on manual commands, we provide two concrete, automated test components:
     1. **`server/tests/seedBench_cli.test.js`**: An automated test suite runnable via Node.js test runner (`node --test tests/seedBench_cli.test.js`), which integrates directly with `npm run test:pt`.
     2. **Additions to `server/scripts/verifyBench.js`**: An embedded adversarial verification step inside `verifyBench.js` that checks CLI failure modes AND verifies live zero-mutation across active collections.

---

## 3. Caveats

- **MongoDB Requirement for Live Invariance**: Child-process exit-code tests run without MongoDB. However, the database mutation invariance check in `verifyBench.js` requires MongoDB running on port 27018 (`shopsphere_bench`).
- **Export Guard Requirement in `seedBench.js`**: Direct in-memory testing of `parseArgs` requires Worker to export `parseArgs` and wrap `main()` with `if (require.main === module)`.
- **E2E M2 Test Suite**: Running `npm run test:pt` executes `tests/*.test.js`, including `e2e_pt_revamp.test.js` where 4 M2 endpoint tests are expected to fail until Milestone M2. Core PT tests and `seedBench_cli.test.js` should pass 100%.

---

## 4. Conclusion & Concrete Deliverables

We have designed and prepared two artifact files in our agent directory for the Worker:

1. **`proposed_seedBench_cli.test.js`**  
   - Path: `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_it2_3\proposed_seedBench_cli.test.js`
   - Purpose: Comprehensive automated adversarial test suite covering 25+ test cases (negative values, zero values, unknown arguments, malformed formats, preset verification).
   - Destination for Worker: `server/tests/seedBench_cli.test.js`.

2. **`proposed_verifyBench.js`**  
   - Path: `C:\GEMINI\DBMS_PRJ\Shopsphere\.agents\teamwork\teamwork_explorer_m1_it2_3\proposed_verifyBench.js`
   - Purpose: Drop-in replacement / enhancement for `server/scripts/verifyBench.js`.
   - Incorporates document count checks, index checks, academic skew checks, plus live CLI adversarial validation and 0-mutation database snapshot comparisons.

### Adversarial Test Matrix

| # | Argument Tested | Input Vector | Expected Exit Code | Expected Error Message Pattern | Pre-DB Abort Verified |
|---|---|---|---|---|---|
| 1 | `--products=-50` | Negative Integer | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 2 | `--orders=-10` | Negative Integer | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 3 | `--items=-1` | Negative Integer | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 4 | `--vendors=-5` | Negative Integer | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 5 | `--categories=-2` | Negative Integer | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 6 | `--users=-100` | Negative Integer | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 7 | `--reviews=-20` | Negative Integer | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 8 | `--batch=-500` | Negative Integer | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 9 | `--seed=-123` | Negative Integer | `1` (`!= 0`) | `/must be a positive integer|must be a non-negative integer/i` | Yes (no `[seedBench] uri=`) |
| 10 | `--products=0` | Zero Value | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 11 | `--orders=0` | Zero Value | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 12 | `--items=0` | Zero Value | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 13 | `--vendors=0` | Zero Value | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 14 | `--categories=0` | Zero Value | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 15 | `--users=0` | Zero Value | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 16 | `--reviews=0` | Zero Value | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 17 | `--batch=0` | Zero Value | `1` (`!= 0`) | `/must be a positive integer/i` | Yes (no `[seedBench] uri=`) |
| 18 | `--unknown=10` | Unknown Key | `1` (`!= 0`) | `/unknown argument/i` | Yes (no `[seedBench] uri=`) |
| 19 | `--badparam=99` | Unknown Key | `1` (`!= 0`) | `/unknown argument/i` | Yes (no `[seedBench] uri=`) |
| 20 | `--badflag` | Unknown Flag | `1` (`!= 0`) | `/unknown argument/i` | Yes (no `[seedBench] uri=`) |
| 21 | `--products=abc` | Non-numeric string | `1` (`!= 0`) | `/invalid integer|unknown argument/i` | Yes (no `[seedBench] uri=`) |
| 22 | `--products=12.5` | Floating point | `1` (`!= 0`) | `/invalid integer|unknown argument/i` | Yes (no `[seedBench] uri=`) |
| 23 | `--drop=true` | Key-value flag | `1` (`!= 0`) | `/unknown argument/i` | Yes (no `[seedBench] uri=`) |
| 24 | `--medium` | Valid Preset | `0` (Success) | N/A (parses: 50k prod, 100k ord, 400k items) | N/A |
| 25 | `--small` | Valid Preset | `0` (Success) | N/A (parses: 3k prod, 12k ord, 48k items) | N/A |
| 26 | `--medium --drop` | Preset + Flag | `0` (Success) | N/A (parses: 50k scale, drop: true) | N/A |
| 27 | Live DB Invariance | All adversarial | N/A | 0 mutations across all 7 collections | Verified |

---

## 5. Verification Method

To independently verify the implementation, Worker M1 and Challenger M1-2 should execute the following sequence:

### Step 1: Copy Proposed Test File and Update `verifyBench.js`
- Copy `proposed_seedBench_cli.test.js` to `server/tests/seedBench_cli.test.js`.
- Update `server/scripts/verifyBench.js` using `proposed_verifyBench.js`.

### Step 2: Run Dedicated Adversarial CLI Test Suite
```powershell
cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
node --test tests/seedBench_cli.test.js
```
*Expected Output*:
- 25+ passing tests.
- 0 failures.
- Exit code: 0.

### Step 3: Run Interactive Adversarial Commands Directly in Shell
```powershell
# 1. Negative products check
node server/scripts/seedBench.js --products=-50
# Expected: Exits with code 1; prints: [seedBench] FAILED: Value for --products must be a positive integer

# 2. Zero orders check
node server/scripts/seedBench.js --orders=0
# Expected: Exits with code 1; prints: [seedBench] FAILED: Value for --orders must be a positive integer

# 3. Unknown option check
node server/scripts/seedBench.js --unknown=10
# Expected: Exits with code 1; prints: [seedBench] FAILED: Unknown argument: --unknown=10

# 4. Unknown standalone flag check
node server/scripts/seedBench.js --badflag
# Expected: Exits with code 1; prints: [seedBench] FAILED: Unknown argument: --badflag
```

### Step 4: Run Complete Benchmark & Mutation Verification
```powershell
node server/scripts/verifyBench.js
```
*Expected Output*:
- Document counts: `✓ PASS` for all 7 collections (products: 50000, orders: 100000, items: 400000, users: 20000, reviews: 100000, vendors: 100, categories: 30).
- Secondary indexes: `✓ PASS` for all required indexes.
- Academic skew: `✓ PASS` for rare category and 7-day order volume.
- CLI argument validation: `✓ PASS` for negative, zero, unknown, and malformed inputs.
- Zero database mutations: `✓ PASS Zero database mutations during adversarial CLI testing`.
- `--medium` scale parsing: `✓ PASS --medium sets expected scale`.
- Summary: `ALL CHECKS PASSED`, exit code 0.

### Step 5: Run Core PT Regression Suite
```powershell
cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js tests/seedBench_cli.test.js
```
*Expected Output*:
- All PT core and CLI validation tests pass (37+ tests passed, 0 failed, exit code 0).
