# Project: mongo-pt Query Optimization Log Revamp

## Architecture
- **Operational Stack**: React (Vite, Tailwind, Recharts, Lucide) on frontend (`client/`), Express.js backend (`server/`), MongoDB on port 27018.
- **Benchmark Database**: `shopsphere_bench` on port 27018 with normalized relational schema across 7 collections (`users`, `vendors`, `categories`, `products`, `orders`, `order_items`, `reviews`).
- **Optimization Pipeline (mongo-pt)**:
  - Baseline: Standard MongoDB left-deep `$lookup` aggregation pipelines.
  - Novel Approach: Optimized (mongo-pt) semi-join reduction using Yannakakis LargestRoot algorithm to eliminate dangling tuples in two passes before executing lookup on small temporary materialized collections.
- **API Endpoints**:
  - `GET /api/admin/pt-log`: Returns recent execution logs with per-query comparative metrics.
  - `GET /api/admin/pt-status`: Returns real-time execution status (active/idle, running phase, elapsed timing).
  - `GET /api/admin/pt-metrics`: Returns aggregated throughput, latency, speedup, and perSpecStats.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Baseline Terminology Update | Replace "naive" with "Standard MongoDB" (or "Standard") in table headers, stat cards, tooltips, chart legends, status chips | M3 | R1 |
| 2 | Novel Approach Terminology Update | Replace "reduced" with "Optimized (mongo-pt)" (or "Optimized") across PT log page, metrics dashboard, tooltips, chart legends | M3 | R1 |
| 3 | Backend Terminology Alignment | Backend endpoints emit `standard`/`optimized` keys (`standard_ms`, `optimized_ms`, `avgStandardMs`, etc.) while retaining legacy aliases | M2 | R1, R5 |
| 4 | Real-Time Query Execution Status Indicator | Visible indicator on `/admin/pt-log` showing whether measurement is actively running or idle | M3 | R2 |
| 5 | Phase Progression & Elapsed Timing | Real-time status indicator displays active status with elapsed time and stepped phase progression (`Optimized` -> `Standard` -> `Verification`) | M3 | R2 |
| 6 | Backend Real-Time Status Support | `ptShadow.js` and `adminController.js` track and expose phase state with updated terminology | M2 | R2 |
| 7 | Per-Query Descriptions | Each query entry in PT log table displays concise computation description explaining what the query calculates | M3 | R3 |
| 8 | Backend Query Descriptions | `perSpecStats` in `GET /api/admin/pt-metrics` includes canonical description for each query spec | M2 | R3 |
| 9 | Comprehensive Performance Metrics | Dashboard and logs report latency, throughput (q/s), speedup factor, transfer/materialization overhead, result verification | M3 | R3 |
| 10 | Result Equality Verification | Result verification check confirms Standard MongoDB and Optimized (mongo-pt) return identical query results | M2, M3 | R3, R5 |
| 11 | Benchmark Dataset Scaling | Seed `shopsphere_bench` with scaled dataset (50k products, 400k order items, 100k orders) | M1 | R4 |
| 12 | Optimization Speedup Verification | Verify multi-relation queries demonstrate measurable speedup (>1x) under Optimized (mongo-pt) vs Standard MongoDB | M1 | R4 |
| 13 | PT Test Suite Integrity | `npm run test:pt` passes with 100% success rate on scaled dataset | M1, M4 | R5 |
| 14 | API Endpoints Verification | Endpoints `GET /api/admin/pt-log`, `GET /api/admin/pt-status`, `GET /api/admin/pt-metrics` return 200 OK matching updated terminology | M2, M4 | R5 |
| 15 | Frontend Compilation & Parity | Frontend compiles cleanly (`npm run build`) and passes browser checks | M3, M4 | R5 |
| 16 | E2E Testing Suite | Independent opaque-box test suite covering Tiers 1-4 | E2E Track | Dual Track |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Test Suite Creation | Test infrastructure and Tiers 1-4 opaque-box test cases for terminology, status, metrics, dataset | none | DONE |
| M1 | Benchmark Dataset Scaling & Performance | Seed `shopsphere_bench` (50k products, 400k order items), verify speedup (>1x) on multi-relation queries, ensure `npm run test:pt` passes | none | DONE |
| M2 | Backend Terminology, Status & Metrics API | Update `server/controllers/adminController.js` and `server/scripts/ptShadow.js` for dual terminology (`standard`/`optimized`), perSpec descriptions, and status lifecycle | M1 | DONE |
| M3 | Frontend PT Log Page Revamp | Update `client/src/pages/PtLogPage.jsx` and `ProductDiscoveryPage.jsx`: terminology revamp, stepped real-time status indicator, per-query descriptions, and comprehensive metrics | M2 | DONE |
| M4 | Final Milestone (E2E Pass & Hardening) | Phase 1: 100% pass on E2E test suite (Tiers 1-4). Phase 2: Adversarial coverage hardening (Tier 5) with Challengers & Forensic Auditor | E2E, M1, M2, M3 | DONE |

## Interface Contracts

### Backend ↔ Frontend API Contract
1. `GET /api/admin/pt-status`:
   ```json
   {
     "running": boolean,
     "startedAt": string | null,
     "standard": { "phase": "idle"|"running"|"done", "startedAt": string|null, "finishedAt": string|null, "ms": number|null },
     "optimized": { "phase": "idle"|"running"|"done", "startedAt": string|null, "finishedAt": string|null, "ms": number|null },
     "naive": { ... },
     "reduced": { ... },
     "staleAfterMin": number,
     "typicalRunSeconds": number
   }
   ```
2. `GET /api/admin/pt-metrics`:
   ```json
   {
     "totalRuns": number,
     "avgStandardMs": number,
     "avgOptimizedMs": number,
     "medStandardMs": number,
     "medOptimizedMs": number,
     "throughputStandard": number,
     "throughputOptimized": number,
     "avgSpeedup": number,
     "maxSpeedup": number,
     "minSpeedup": number,
     "winRate": number,
     "robustnessGap": number,
     "avgOverheadPct": number,
     "avgTransferMs": number,
     "avgMatMs": number,
     "perSpecStats": [
       {
         "spec": string,
         "description": string,
         "runs": number,
         "avgStandardMs": number,
         "avgOptimizedMs": number,
         "medStandardMs": number,
         "medOptimizedMs": number,
         "throughputStandard": number,
         "throughputOptimized": number,
         "avgSpeedup": number,
         "avgOverheadPct": number,
         "timeline": [ { "t": string, "standard_ms": number, "optimized_ms": number, "speedup": number } ]
       }
     ],
     "timeline": [ { "t": string, "spec": string, "standard_ms": number, "optimized_ms": number, "speedup": number } ]
   }
   ```
3. `GET /api/admin/pt-log`:
   Array of records containing:
   `spec`, `description`, `trigger`, `kind`, `standard_ms`, `optimized_ms`, `speedup`, `transfer_ms`, `materialization_ms`, `transfer_overhead_pct`, `equal`, `checksum`, `result_rows`, `best`, `worst_case`.

## Code Layout
- `client/src/pages/PtLogPage.jsx`: Main PT log & metrics UI.
- `client/src/pages/ProductDiscoveryPage.jsx`: Background shadow status badge (`ShadowStatusBadge`).
- `server/controllers/adminController.js`: `getPtLog`, `getPtStatus`, `getPtMetrics`.
- `server/scripts/ptShadow.js`: Background detached measurement process.
- `server/scripts/seedBench.js`: Benchmark database generator and seeder.
- `server/scripts/verifyBench.js`: Benchmark database verification suite.
- `server/pt/specs/index.js`: Benchmark query specifications.
- `server/tests/`: PT automated test suite.
