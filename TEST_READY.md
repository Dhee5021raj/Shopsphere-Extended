# TEST_READY.md — E2E Test Suite Publication

## Status: READY & PUBLISHED
**Date**: 2026-10-27T10:56:00Z  
**Author**: teamwork_test_writer_e2e  
**Target Milestone**: M4 (E2E Pass & Hardening) / M1-M3 Verification Driver  

---

## 1. Executive Summary

The independent, opaque-box, requirement-driven E2E test suite for the **ShopSphere mongo-pt Query Optimization Log Revamp** is fully constructed, verified, and ready for use across all project milestones.

- **Test Suite Location**: `server/tests/e2e_pt_revamp.test.js`
- **Architecture Documentation**: `TEST_INFRA.md`
- **Total Tests Implemented**: **54 tests** across 4 tiers
- **Current Baseline**: **50 PASS / 4 FAIL**
  - The 50 passing tests verify R2 (Real-Time Status Indicator), R3 (Comprehensive Performance Metrics & Invariants), R4 (Benchmark Dataset Scale: 50k products, 400k order items), R5 (Core Functional Integrity), Tier 2 (Boundary & Corner Cases), Tier 3 (Cross-Feature Combinations), and Tier 4 (Real-World Application Scenarios).
  - The 4 failing tests precisely identify the contractual gaps for **Milestone M2 (Backend Terminology, Status & Metrics API)**, providing an explicit, reproducible target for backend implementation.

---

## 2. Test Execution Command

Run the test suite standalone:
```bash
cd server
node --test tests/e2e_pt_revamp.test.js
```

Run alongside the full PT test suite:
```bash
cd server
npm run test:pt
```

---

## 3. Test Inventory by Tier

| Tier | Focus | Tests | Status (Baseline) |
|---|---|---|---|
| **Tier 1** | Feature Coverage (R1–R5) | 32 | 28 PASS / 4 FAIL (Pending M2) |
| **Tier 2** | Boundary & Corner Cases | 10 | 10 PASS / 0 FAIL |
| **Tier 3** | Cross-Feature Combinations | 7 | 7 PASS / 0 FAIL |
| **Tier 4** | Real-World Application Scenarios | 5 | 5 PASS / 0 FAIL |
| **Total** | | **54** | **50 PASS / 4 FAIL** |

---

## 4. Contractual Escalatables for Milestone M2

The 4 failing tests clearly define the required changes in `server/controllers/adminController.js` and `server/scripts/ptShadow.js`:

1. **`T1.1.1 [R1-Status-Standard]`**:
   - *Failure*: `M2 Requirement: pt-status must expose "standard" phase object`
   - *Action for M2*: In `getPtStatus`, emit `standard: { phase, startedAt, finishedAt, ms }` alongside legacy alias `naive`.
2. **`T1.1.2 [R1-Status-Optimized]`**:
   - *Failure*: `M2 Requirement: pt-status must expose "optimized" phase object`
   - *Action for M2*: In `getPtStatus`, emit `optimized: { phase, startedAt, finishedAt, ms }` alongside legacy alias `reduced`.
3. **`T1.1.4 [R1-Metrics-UpdatedKeys]`**:
   - *Failure*: `M2 Requirement: pt-metrics must emit "avgStandardMs"`
   - *Action for M2*: In `getPtMetrics`, return `avgStandardMs`, `avgOptimizedMs`, `medStandardMs`, `medOptimizedMs`, `throughputStandard`, and `throughputOptimized` alongside legacy aliases.
4. **`T1.3.1 [R3-PerSpec-Description]`**:
   - *Failure*: `M2 Requirement: perSpecStats entry must include "description"`
   - *Action for M2*: In `getPtMetrics`, map canonical query spec descriptions into each item in `perSpecStats`.

---

## 5. Dataset Scaling (R4) & Existing PT Integrity (R5) Verification

- **R4 Dataset Scale Confirmed**:
  - `products`: 50,000 documents ($\ge 50{,}000$)
  - `order_items`: 400,692 documents ($\ge 400{,}000$)
  - `orders`: 100,000 documents ($\ge 100{,}000$)
  - `reviews`: 100,000 documents
  - `users`: 20,000 documents
  - `vendors`: 100 documents
  - `categories`: 30 documents
- **R5 Functional Integrity Confirmed**:
  - `bloom.test.js`: 5/5 PASS
  - `pt.test.js`: 5/5 PASS
  - `transfer.test.js`: 2/2 PASS
  - All 12 baseline PT tests pass cleanly with 100% success rate.
