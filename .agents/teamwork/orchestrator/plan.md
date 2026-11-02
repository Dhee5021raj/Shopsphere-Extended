# Plan: Mongo-PT Query Optimization Log Revamp

## Objectives
Revamp the mongo-pt query optimization log page (/admin/pt-log) for an academic review showcase:
1. Update terminology from "naive" vs "reduced" to "Standard MongoDB" vs "Optimized (mongo-pt)".
2. Add real-time query execution status indicator (active/running with elapsed time or phase vs idle).
3. Provide per-query descriptions and comprehensive metrics (latency, throughput, speedup factor, transfer & materialization overhead, result verification).
4. Scale benchmark dataset in `shopsphere_bench` (e.g. 50k products, 400k order items) for measurable speedup (>1x).
5. Comprehensive verification: test suite (`npm run test:pt`), endpoint verification (`/api/admin/pt-log`, `/api/admin/pt-status`, `/api/admin/pt-metrics`), and functional parity.

## Execution Pattern: Project
### Step 0: Survey Phase
Spawn 3 Explorers in parallel to inspect:
- Explorer 1: Frontend `/admin/pt-log` UI component, state management, terminology, status indicator, metrics rendering.
- Explorer 2: Backend API endpoints (`/api/admin/pt-log`, `/api/admin/pt-status`, `/api/admin/pt-metrics`), runner service, query descriptions, metric calculations.
- Explorer 3: Benchmark dataset seeding scripts, mongo-pt query execution, `shopsphere_bench` schema, indexes, test suite `npm run test:pt`.

### Step 1: Synthesis & PROJECT.md
Merge findings into `PROJECT.md` with:
- Architecture & code layout
- Complete Feature Inventory
- Milestones and Interface Contracts

### Step 2: Dual Track Execution
- Track A (E2E Testing): Create independent test suite validating terminology, status indicator transitions, metrics schema, and dataset speedup.
- Track B (Implementation Milestones):
  - Milestone 1: Benchmark Dataset Scaling & Performance Verification
  - Milestone 2: Backend Terminology, Status API & Metrics Enhancement
  - Milestone 3: Frontend PT Log Page Revamp (Terminology, Live Status Indicator, Descriptions, Metrics UI)
  - Milestone 4: Final Acceptance & E2E Validation + Adversarial Hardening
