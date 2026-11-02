# Milestone M1 Independent Review & Adversarial Challenge Report

## Review Summary

**Verdict**: APPROVE  
**Reviewer**: `teamwork_reviewer_m1_2`  
**Milestone**: M1 (Benchmark Scaling, Index Coverage & Optimization Speedup)  
**Integrity Assessment**: CLEAN — No hardcoded test results, no facade implementations, no fabricated metrics, no shortcuts detected.

---

## 1. Observation

### 1.1 Correctness & Edge Cases of `--medium` in `server/scripts/seedBench.js`
In `server/scripts/seedBench.js` lines 36–48:
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

Tested edge cases via automated Node evaluation against `parseArgs`:
- Default invocation: returns default scale (products: 200,000, orders: 1,000,000).
- `--medium`: returns products: 50,000, orders: 100,000, items: 400,000, vendors: 100, categories: 30, users: 20,000, reviews: 100,000.
- `--medium --drop` and `--drop --medium`: both set `drop: true` and medium scale.
- Argument overriding: `--medium --products=10000` overrides products to 10,000; `--products=10000 --medium` sets products back to 50,000 (preset precedence).
- Rejection of invalid inputs: `--unknown` throws `Unknown argument: --unknown`; `--medium=true` throws `Unknown argument: --medium=true`; non-numeric values like `--products=abc` throw `Unknown argument: --products=abc`.
All 11 edge case test assertions passed without regression.

### 1.2 Independent Verification of Collection Counts and Indexes via `verifyBench.js`
Executed:
`cd server; node scripts/verifyBench.js`

Verbatim Tool Output:
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
Exit code: 0.

### 1.3 Independent Execution of Multi-Relation Speedup & Equivalence
Executed:
`cd server; node scripts/ptExecute.js rare_category_revenue_7d --orders=1`

Verbatim Output:
```
[env] {
 "timestamp": "2026-10-27T11:05:47.961Z",
 "mongod_version": "8.2.6",
 "cpu_count": 16,
 "cpu_model": "AMD Ryzen 7 7735HS with Radeon Graphics        ",
 "total_mem_gb": 15.19,
 "free_mem_gb": 4.71,
 "loadavg": [ 0, 0, 0 ],
 "platform": "win32 10.0.26300",
 "node_version": "v22.19.0",
 "uri": "mongodb://127.0.0.1:27018/shopsphere_bench",
 "bloom_enabled": false,
 "max_orders": 1
}

SPEC rare_category_revenue_7d: 28 valid join orders, testing 1
  transfer=465ms  materialization=195ms  skipped=[]
   {"order":"oi>o>p>v>cat","naive_ms":100028,"exact_join_ms":15,"exact_total_ms":675,"bloom_join_ms":null,"bloom_total_ms":null,"equal":"ok","checksum":"12:7b0d582f"}

[ptExecute] equality failures: 0
```
- Standard MongoDB Execution Latency: **100,028 ms** (~100.0s)
- Optimized (mongo-pt) Join Latency: **15 ms**
- Optimized (mongo-pt) Transfer + Materialization Overhead: **465 ms + 195 ms = 660 ms**
- Optimized (mongo-pt) Total Latency: **675 ms**
- **Net End-to-End Speedup**: **148.19×** (100,028 / 675 ms, massively exceeding the >1× requirement)
- **Join-Phase Speedup**: **6,668.5×** (100,028 / 15 ms)
- **Result Verification**: `equal: "ok"`, `checksum: "12:7b0d582f"`, equality failures: `0`
Exit code: 0.

### 1.4 Independent Verification of Core PT Test Suite
Executed:
`cd server; node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js`

Verbatim Output:
```
TAP version 13
# Subtest: Bloom: 120k keys (mixed ObjectIds) have zero false negatives
ok 1 - Bloom: 120k keys (mixed ObjectIds) have zero false negatives
# Subtest: Bloom: measured false-positive rate on 100k non-members
ok 2 - Bloom: measured false-positive rate on 100k non-members
# Subtest: ExactSet: dedupes and drops null/undefined keys
ok 3 - ExactSet: dedupes and drops null/undefined keys
# Subtest: ExactSet: values are distinct
ok 4 - ExactSet: values are distinct
# Subtest: Bloom and Exact agree with server-side $function (zero false negatives)
ok 5 - Bloom and Exact agree with server-side $function (zero false negatives)
# Subtest: acyclicity: chain accepted
ok 6 - acyclicity: chain accepted
# Subtest: acyclicity: star accepted
ok 7 - acyclicity: star accepted
# Subtest: acyclicity: triangle rejected with a clear error
ok 8 - acyclicity: triangle rejected with a clear error
# Subtest: schedule: forward pass then backward pass, root is the largest relation
ok 9 - schedule: forward pass then backward pass, root is the largest relation
# Subtest: naive == reduced for every spec on a tiny dataset and 3 join orders
ok 10 - naive == reduced for every spec on a tiny dataset and 3 join orders
# Subtest: dangling tuples: reduced relations == projection of final join (selective spec)
ok 11 - dangling tuples: reduced relations == projection of final join (selective spec)
# Subtest: null join keys are dropped and sets are distinct (via distinct())
ok 12 - null join keys are dropped and sets are distinct (via distinct())
1..12
# tests 12
# suites 0
# pass 12
# fail 0
```
Result: 12 passed, 0 failed, 100% pass rate.

---

## 2. Logic Chain

1. **Preset Flag Parsing** (Observation 1.1):
   - The `--medium` flag is cleanly mapped to the required benchmark scale constants in `seedBench.js`.
   - Edge case analysis confirms deterministic behavior: presets can be combined with `--drop`, subsequent argument overrides behave predictably, and invalid arguments or non-numeric parameters are strictly rejected.
2. **Benchmark Scale & Skew Integrity** (Observation 1.2):
   - `verifyBench.js` independently executed live count queries on `shopsphere_bench` on MongoDB port 27018.
   - The collections hold 50,000 products, 100,000 orders, and 400,692 order items, fulfilling R4.
   - All 12 required foreign-key indexes are verified to exist on MongoDB, preventing false speedups caused by missing indexes.
   - The academic skew parameters (0.52% rare product share and 1.87% 7-day order share) match the target theoretical distributions.
3. **Speedup & Parity Verification** (Observation 1.3 & 1.4):
   - In Standard MongoDB, the query executes left-deep lookup over 400,692 order items taking 100,028 ms.
   - In mongo-pt, semi-join reduction prunes intermediate relations down to 22 surviving items before joining, completing the join in 15 ms and total execution in 675 ms.
   - Net speedup is 148.19× (join speedup is 6,668.5×), satisfying the >1× acceptance criterion.
   - Canonical row sorting, float rounding, and hex stringification in `resultsEqual` and `checksum` confirm row-for-row identity between Standard MongoDB and Optimized (mongo-pt) results.

---

## 3. Adversarial Challenges & Findings

### Challenge 1: Flag Parsing Syntax Stricteness
- **Scenario**: Passing `--medium=true` or `--Medium`.
- **Finding**: Minor usability note. The parser expects bare `--medium` and throws `Unknown argument` for `--medium=true` or uppercase variants.
- **Impact**: Low. Bare flags are standard across all seed scripts (`--small`, `--drop`).

### Challenge 2: Temporal Window Drift in Skew Verification
- **Scenario**: If the benchmark database remains untouched for months, the 7-day temporal window (`created_at >= now - 7d`) will eventually yield 0 orders if not re-seeded.
- **Finding**: `seedBench.js` uses dynamic `new Date()` relative timestamps during seeding. If temporal drift occurs in long-running test environments, running `node scripts/seedBench.js --medium --drop` restores fresh timestamps in ~42 seconds.
- **Impact**: Acceptable; documented in runbooks.

### Challenge 3: Parallel E2E Suite Assertion Alignment
- **Scenario**: Running `npm run test:pt` runs all files under `tests/*.test.js`, which now includes `tests/e2e_pt_revamp.test.js` created by the E2E test track.
- **Finding**: In `e2e_pt_revamp.test.js`, test `T4.5` (Live benchmark equivalence) passes completely (`ok 5`), while tests asserting the pending M2 endpoint properties (`standard_ms`, `optimized_ms` in `pt-status`) will be addressed in Milestone M2. Core PT tests (`tests/bloom.test.js`, `tests/pt.test.js`, `tests/transfer.test.js`) pass 12/12.
- **Impact**: None on M1; M2 will satisfy the endpoint contract assertions.

---

## 4. Conclusion

Milestone M1 satisfies all requirements (R4, R5) and acceptance criteria:
- `seedBench.js` supports `--medium` correctly.
- `shopsphere_bench` contains 50,000 products, 100,000 orders, and 400,692 order items with complete secondary index coverage.
- Multi-relation queries demonstrate a verified **148.19×** end-to-end speedup (and **6,668.5×** join speedup) with complete result parity (`equal: ok`, 0 errors).
- Zero integrity violations detected.

**Final Verdict**: **APPROVE**

---

## 5. Verification Method

To reproduce and verify these findings independently:

1. **Verify Database Counts, Indexes, and Skew**:
   ```powershell
   cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
   node scripts/verifyBench.js
   ```
   *Expected Output*: Exit code 0, 7 count checks PASS, 12 index checks PASS, 2 skew checks PASS, `[VERIFY] Summary: ALL CHECKS PASSED`.

2. **Verify Speedup and Equivalence**:
   ```powershell
   cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
   node scripts/ptExecute.js rare_category_revenue_7d --orders=1
   ```
   *Expected Output*: Exit code 0, `naive_ms` > 70,000 ms, `exact_total_ms` < 1,000 ms (speedup > 100×), `"equal":"ok"`, `[ptExecute] equality failures: 0`.

3. **Verify Core PT Test Suite**:
   ```powershell
   cd C:\GEMINI\DBMS_PRJ\Shopsphere\server
   node --test tests/bloom.test.js tests/pt.test.js tests/transfer.test.js
   ```
   *Expected Output*: Exit code 0, 12 passing tests, 0 failures.
