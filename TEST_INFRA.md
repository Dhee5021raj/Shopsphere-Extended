# TEST_INFRA.md — E2E Test Suite Architecture & Infrastructure

## 1. Overview & Architecture

This document specifies the end-to-end (E2E), requirement-driven, opaque-box test infrastructure for the **ShopSphere mongo-pt Query Optimization Log Revamp**.

The test suite validates the architectural transformation of the query optimization log system from legacy terminology (`naive` vs `reduced`) to clear academic-grade terminology (`Standard MongoDB` vs `Optimized (mongo-pt)`), real-time query execution status tracking, per-query descriptions, comprehensive comparative metrics, benchmark dataset scaling, and functional integrity.

### 4-Tier Test Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        E2E Test Architecture                           │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 1: Feature Coverage (R1–R5)                                       │
│   ├── F1: Terminology Update (Status, Metrics, Log Endpoints)          │
│   ├── F2: Real-Time Query Execution Status Indicator                   │
│   ├── F3: Per-Query Descriptions (Canonical, PerSpec, LiveSearch)      │
│   ├── F4: Comprehensive Performance Metrics (Throughput, Speedup, Eq)  │
│   ├── F5: Benchmark Dataset Scaling (50k products, 400k order items)   │
│   └── F6: Functional Integrity (HTTP 200, Ordering, Acyclicity)        │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 2: Boundary & Corner Cases                                        │
│   ├── Empty Log Files, Zero Shadow Records, Malformed JSON Lines       │
│   ├── Divide-by-Zero Safeguards (Zero Latency, Robustness Gap Nulls)  │
│   └── Missing/Corrupted Status Files & Stale Lock Timeout Handling     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 3: Cross-Feature Combinations                                     │
│   ├── Dual Terminology Coherence (Standard==Naive, Optimized==Reduced) │
│   ├── Active Status & Stepped Progression Coordination                 │
│   └── Metric Aggregation Invariants (PerSpecSum == TotalRuns)          │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 4: Real-World Application Scenarios                               │
│   ├── Full Benchmark Execution Lifecycle (Idle->Running->Done->Idle)   │
│   ├── Live Search Trigger & Filter Spec Generation Flow                │
│   ├── Batch Shadow Record Ingestion & Metric Verification              │
│   ├── Process Crash & Dead-PID Recovery (Phantom Suppression)          │
│   └── Live shopsphere_bench Database Query Equivalence Verification    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authoritative Sources of Truth

Every test in this suite derives its expected inputs, outputs, and validation contracts strictly from authoritative project specifications:

1. **`ORIGINAL_REQUEST.md`**: Defines core functional requirements:
   - **R1 (Terminology Update)**: Baseline renamed to `Standard MongoDB` (replacing `naive`); novel approach renamed to `Optimized (mongo-pt)` (replacing `reduced`).
   - **R2 (Real-Time Status Indicator)**: Live status with phase progression (`Optimized` -> `Standard` -> `Verification`) and idle/running indicators.
   - **R3 (Descriptions & Metrics)**: Per-query computational descriptions, latency, throughput ($1000 / \text{avgMs}$), speedup factor, transfer and materialization overhead, result verification.
   - **R4 (Benchmark Dataset Scaling)**: Dataset scale $\ge 50{,}000$ products and $\ge 400{,}000$ order items in `shopsphere_bench`, with measurable speedup ($> 1\times$) on selective queries.
   - **R5 (Functional Integrity)**: Result equivalence between Standard and Optimized query executions; existing test suite passes.

2. **`PROJECT.md` § Interface Contracts**:
   - `GET /api/admin/pt-status` JSON schema: `running`, `startedAt`, `standard`, `optimized`, `naive`, `reduced`, `staleAfterMin`, `typicalRunSeconds`.
   - `GET /api/admin/pt-metrics` JSON schema: `totalRuns`, `avgStandardMs`, `avgOptimizedMs`, `throughputStandard`, `throughputOptimized`, `avgSpeedup`, `winRate`, `robustnessGap`, `avgOverheadPct`, `perSpecStats` (with `description`).
   - `GET /api/admin/pt-log` JSON schema: `standard_ms`, `optimized_ms`, `naive_ms`, `reduced_ms`, `description`, `speedup`, `equal`, `checksum`, `result_rows`.

3. **Mathematical Invariants**:
   - $\text{Throughput} = \frac{1000}{\text{avgMs}}$ (queries/second)
   - $\text{Speedup} = \frac{\text{StandardMs}}{\text{OptimizedMs}}$
   - $\text{OverheadPct} = \frac{\text{TransferMs} + \text{MaterializationMs}}{\text{OptimizedMs}} \times 100$
   - $\text{WinRate} = \frac{\text{Runs with Speedup} > 1.0}{\text{Total Shadow Runs}} \times 100$
   - $\text{RobustnessGap} = \frac{\max(\text{StandardMs})}{\min(\text{StandardMs})}$

4. **Live Database Oracle**:
   - Real MongoDB instance on `mongodb://127.0.0.1:27018/shopsphere_bench`.
   - Direct count queries on `products`, `order_items`, `orders`, `users`, `vendors`, `categories`, `reviews`.
   - Direct execution of `runNaive` and `runReduced` against query specifications (`rare_category_revenue_7d`).

---

## 3. Test Inventory & Mapping

The test suite contains **54 tests** structured into 4 distinct tiers:

### Tier 1: Feature Coverage (32 Tests)

| Test ID | Name / Description | Target Requirement | Method / Assertion |
|---|---|---|---|
| `T1.1.1` | `[R1-Status-Standard]` `GET /api/admin/pt-status` exposes `standard` phase object | R1, PROJECT § Contract | `res.standard` has `phase`, `startedAt`, `finishedAt`, `ms` |
| `T1.1.2` | `[R1-Status-Optimized]` `GET /api/admin/pt-status` exposes `optimized` phase object | R1, PROJECT § Contract | `res.optimized` has `phase`, `startedAt`, `finishedAt`, `ms` |
| `T1.1.3` | `[R1-Status-BackwardCompat]` `GET /api/admin/pt-status` preserves `naive` & `reduced` | R1, PROJECT § Contract | `res.naive` and `res.reduced` present and match standard/optimized |
| `T1.1.4` | `[R1-Metrics-UpdatedKeys]` `GET /api/admin/pt-metrics` exposes `avgStandardMs`, `avgOptimizedMs`, throughputs | R1, R3 | Assert `avgStandardMs`, `avgOptimizedMs`, `throughputStandard`, `throughputOptimized` |
| `T1.1.5` | `[R1-Metrics-BackwardCompat]` `GET /api/admin/pt-metrics` preserves `avgNaiveMs`, `avgReducedMs` | R1, PROJECT § Contract | Assert legacy metric keys are defined and match updated values |
| `T1.1.6` | `[R1-Log-Keys]` `GET /api/admin/pt-log` emits `standard_ms` and `optimized_ms` | R1, PROJECT § Contract | Each log record contains `standard_ms` and `optimized_ms` |
| `T1.2.1` | `[R2-Status-Idle]` `GET /api/admin/pt-status` reports idle state when no run is active | R2 | `running === false` and `startedAt === null` |
| `T1.2.2` | `[R2-Status-Running]` `GET /api/admin/pt-status` reports active state when process runs | R2 | `running === true` with active PID and valid `startedAt` |
| `T1.2.3` | `[R2-Status-SteppedProgression]` Stepped phase tracking (`optimized: done`, `standard: running`) | R2 | Verify distinct per-phase progression objects |
| `T1.2.4` | `[R2-Status-Timestamps]` `startedAt` is valid ISO timestamp; `staleAfterMin` is positive | R2 | Valid Date string parse and positive number |
| `T1.2.5` | `[R2-Status-PhantomSuppression]` Dead PID / expired timestamp suppresses phantom running state | R2 | Dead PID returns `running: false` |
| `T1.3.1` | `[R3-PerSpec-Description]` `perSpecStats` entries contain non-empty `description` | R3 | Every item in `perSpecStats` has string `description` |
| `T1.3.2` | `[R3-Log-Description]` `GET /api/admin/pt-log` shadow records contain detailed `description` | R3 | Non-empty string description explaining query and join order |
| `T1.3.3` | `[R3-SpecRegistry-Canonical]` All 7 specs in `server/pt/specs` have canonical descriptions | R3 | Verify `description` string exists on every spec object |
| `T1.3.4` | `[R3-LiveSearch-DynamicDesc]` `makeLiveSearchSpec` produces dynamic query description | R3 | Dynamic description contains search term and filter criteria |
| `T1.3.5` | `[R3-Spec-Differentiator]` Descriptions clearly differentiate selective vs unselective workloads | R3 | Descriptions detail selectivity and relation count |
| `T1.4.1` | `[R3-Metrics-Throughput]` Throughput matches mathematical formula $1000 / \text{avgMs}$ | R3 | Strict numeric comparison within 0.001 margin |
| `T1.4.2` | `[R3-Metrics-Speedup]` `avgSpeedup`, `maxSpeedup`, `minSpeedup` are positive numbers ($>0$) | R3 | Verified against standard/optimized ratio |
| `T1.4.3` | `[R3-Metrics-Overhead]` Overhead metrics (`avgOverheadPct`, `avgTransferMs`, `avgMatMs`) $\ge 0$ | R3 | Non-negative numeric assertions |
| `T1.4.4` | `[R3-Metrics-WinRate]` `winRate` reflects percentage of runs with speedup $> 1.0$ | R3 | Strict formula check: $\frac{\text{wins}}{\text{total}} \times 100$ |
| `T1.4.5` | `[R3-Metrics-ResultEquality]` Log verifies `equal: true` and matching `checksum` | R3, R5 | Assert `equal === true` and checksum format |
| `T1.4.6` | `[R3-Metrics-RobustnessGap]` `robustnessGap` measures sensitivity to join order | R3 | $\max / \min$ ratio calculated correctly |
| `T1.5.1` | `[R4-Scale-Products]` `shopsphere_bench.products` contains $\ge 50{,}000$ documents | R4 | MongoDB countDocuments $\ge 50000$ |
| `T1.5.2` | `[R4-Scale-OrderItems]` `shopsphere_bench.order_items` contains $\ge 400{,}000$ documents | R4 | MongoDB countDocuments $\ge 400000$ |
| `T1.5.3` | `[R4-Scale-Orders]` `shopsphere_bench.orders` contains $\ge 100{,}000$ documents | R4 | MongoDB countDocuments $\ge 100000$ |
| `T1.5.4` | `[R4-Scale-SupportingCollections]` Supporting collections meet scaled thresholds | R4 | `users` $\ge 10\text{k}$, `vendors` $\ge 50$, `reviews` $\ge 50\text{k}$ |
| `T1.5.5` | `[R4-Gains-Speedup]` Multi-relation query (`rare_category_revenue_7d`) yields speedup $> 1.0\times$ | R4 | Verified via benchmark log and live execution |
| `T1.6.1` | `[R5-Endpoint-Log200]` `GET /api/admin/pt-log` returns HTTP 200 array | R5 | Status 200, array type |
| `T1.6.2` | `[R5-Endpoint-Status200]` `GET /api/admin/pt-status` returns HTTP 200 object | R5 | Status 200, object type |
| `T1.6.3` | `[R5-Endpoint-Metrics200]` `GET /api/admin/pt-metrics` returns HTTP 200 object | R5 | Status 200, object type |
| `T1.6.4` | `[R5-Log-Ordering]` Log records returned newest first, capped at 100 | R5 | Reverse chronological ordering verification |
| `T1.6.5` | `[R5-Core-Acyclicity]` Join graph acyclicity detection accepts trees and rejects cycles | R5 | `isAcyclic` passes for chain/star, throws for triangle |

### Tier 2: Boundary & Corner Cases (10 Tests)

| Test ID | Name / Description | Target Requirement | Method / Assertion |
|---|---|---|---|
| `T2.1` | `[Edge-EmptyLog-PtLog]` Missing log file returns empty array `[]` | R1, R5 | Return status 200 with empty array, no exception |
| `T2.2` | `[Edge-EmptyLog-PtMetrics]` Missing log file returns `{ totalRuns: 0, noData: true }` | R1, R3 | Correct zero-state JSON response |
| `T2.3` | `[Edge-NoShadowRuns-PtMetrics]` Log with zero shadow records returns `noData: true` | R3 | Ingest only `env` / `spec` lines -> `noData: true` |
| `T2.4` | `[Edge-MalformedLines-Tolerance]` Malformed / corrupted JSON lines are safely skipped | R5 | Ingest invalid JSON strings -> valid records parsed |
| `T2.5` | `[Edge-ZeroLatency-DivideByZero]` Zero latency does not trigger `Infinity` or `NaN` | R3 | Safe fallback / null returned for throughput and speedup |
| `T2.6` | `[Edge-SingleRun-RobustnessGap]` Single shadow run sets `robustnessGap: null` without error | R3 | `robustnessGap === null` when $<2$ runs exist |
| `T2.7` | `[Edge-MissingStatusFile-Idle]` Missing `.pt-shadow-status.json` cleanly defaults to idle | R2 | `running === false`, null phases |
| `T2.8` | `[Edge-CorruptedStatusFile-Fallback]` Malformed status JSON falls back safely | R2 | Graceful error suppression, fallback to lock/idle |
| `T2.9` | `[Edge-StaleLockFile-Timeout]` Lock file older than 15 minutes is treated as stale/idle | R2 | Stale lock mtime -> `running === false` |
| `T2.10` | `[Edge-UnselectiveSpec-NoCrash]` Speeds with speedup $< 1.0$ correctly handled | R3, R4 | Correct handling of negative speedup cases |

### Tier 3: Cross-Feature Combinations (7 Tests)

| Test ID | Name / Description | Target Requirement | Method / Assertion |
|---|---|---|---|
| `T3.1` | `[Cross-Terminology-Coherence]` Parity between `standard` and `naive` in status | R1, R2 | `standard.ms === naive.ms` and `optimized.ms === reduced.ms` |
| `T3.2` | `[Cross-MetricsTerminology-Parity]` Parity between updated and legacy metrics fields | R1, R3 | `avgStandardMs === avgNaiveMs`, `throughputStandard === throughputNaive` |
| `T3.3` | `[Cross-StatusDuringExecution]` Status coordination during stepped execution | R2 | Phase progression from `optimized: done` to `standard: running` |
| `T3.4` | `[Cross-PerSpecSum-TotalRuns]` Sum of per-spec runs matches aggregate `totalRuns` | R3 | $\sum \text{perSpecStats.runs} === \text{totalRuns}$ |
| `T3.5` | `[Cross-Timeline-MetricsSync]` Timeline tail matches newest perSpec record values | R3 | Timeline timestamp and latency synchrony |
| `T3.6` | `[Cross-OverheadFormula-Consistency]` Overhead % matches transfer + mat relative to optimized | R3 | Numerical validation within rounding tolerance |
| `T3.7` | `[Cross-FilterLiveSearch-Description]` Live-search query dynamic description encodes all filters | R3 | Price, rating, stock filters represented in description |

### Tier 4: Real-World Application Scenarios (5 Tests)

| Test ID | Name / Description | Target Requirement | Method / Assertion |
|---|---|---|---|
| `T4.1` | `[Scenario-BenchmarkLifecycle]` Full benchmark lifecycle simulation | R1, R2, R3 | Idle -> Started -> Stepped -> Completed -> Logged -> Idle |
| `T4.2` | `[Scenario-LiveSearchSimulation]` Search page trigger creates valid shadow record | R2, R3 | Search term spliced into spec, timed, and logged |
| `T4.3` | `[Scenario-BatchLogIngestion]` Batch ingestion of 10 mixed records computes exact metrics | R3 | End-to-end verification of mean, median, win rate |
| `T4.4` | `[Scenario-ProcessCrashRecovery]` Dead PID status file automatically cleaned/suppressed | R2 | Controller suppresses phantom running indicator |
| `T4.5` | `[Scenario-LiveBenchEquivalence]` Live DB query execution returns equivalent results | R4, R5 | Query execution on `shopsphere_bench` returns identical rows |

---

## 4. Test Execution & Usage

### Running the E2E Test Suite

Execute from the workspace root or from the `server/` subdirectory:

```bash
# From workspace root:
node --test server/tests/e2e_pt_revamp.test.js

# From server/ directory:
cd server
node --test tests/e2e_pt_revamp.test.js

# Running alongside existing PT tests:
cd server
npm run test:pt
```

### Environment Requirements
- **Node.js**: v18.0.0+ (v22.19.0 verified in development environment).
- **Test Runner**: Native Node.js test runner (`node:test`, `node:assert/strict`). Zero external test framework dependencies.
- **MongoDB**: Active mongod service on port 27018 with `shopsphere_bench` populated. If mongod is unavailable, database tests gracefully skip while all opaque-box API and metric tests continue executing.

---

## 5. Test Isolation & Fixture Management

To prevent test-order dependence or cross-test state leakage:
1. **Dynamic Log Isolation**: Tests targeting `getPtLog` and `getPtMetrics` override `process.env.PT_LOG` pointing to temporary isolated files (`os.tmpdir()`), automatically deleted on test teardown.
2. **Status File Sandboxing**: Live status file tests write to `.pt-shadow-status.json` with existing state backup and restoration in `finally` blocks.
3. **Mock Request/Response**: Controller endpoints are tested via strict opaque-box mock response objects capturing HTTP status codes and JSON payloads without requiring network socket allocation.
4. **Deterministic Math Verification**: Synthetic fixture records use fixed seeds and known numerical values to assert exact calculations (e.g. median of odd/even arrays, integer throughputs).
