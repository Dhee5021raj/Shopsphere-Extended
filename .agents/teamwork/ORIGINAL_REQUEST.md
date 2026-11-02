# Original User Request

## Approved Task Prompt — 2026-10-27T10:27:46Z

Revamp the mongo-pt query optimization log page (/admin/pt-log) for an academic review showcase by updating terminology from "naive" vs "reduced" to "Standard MongoDB" vs "Optimized (mongo-pt)", displaying comprehensive performance metrics with per-query descriptions, adding a real-time query execution status indicator, and scaling the benchmark dataset to make optimization gains prominent.

Integrity mode: development

## Requirements

### R1. Terminology Update
Replace the baseline and optimized query terminology across the entire PT log page, metrics dashboard, comparison tables, and tooltips: label the baseline approach "Standard MongoDB" (replacing "naive") and the novel approach "Optimized (mongo-pt)" (replacing "reduced") to eliminate reviewer confusion.

### R2. Real-Time Query Execution Status Indicator
Provide a live status indicator on the PT log page that clearly reflects whether a query measurement or background benchmark is currently active/running (with elapsed time or phase progression) or idle.

### R3. Per-Query Descriptions and Comprehensive Metrics
For every query displayed in the PT log table and metrics views, present a concise description explaining what the query calculates along with comprehensive comparative metrics, including execution latency, throughput (queries/sec), speedup factor, transfer and materialization overhead, and result verification.

### R4. Benchmark Dataset Scaling
Re-seed the benchmark database (`shopsphere_bench`) with a scaled dataset size (e.g., 50k products and 400k order items) so that the performance differences and semi-join reduction speedups between Standard MongoDB and Optimized (mongo-pt) are clearly evident during live comparisons and benchmarks.

### R5. Verification and Functional Integrity
Ensure all existing query specs continue to return identical results across both standard and optimized executions, and verify the updated UI, status endpoints, and metrics via automated tests and browser checks.

## Acceptance Criteria

### Terminology Clarity
- [ ] The term "naive" is replaced by "Standard MongoDB" (or "Standard") in all user-facing table headers, metric cards, status chips, and tooltips on `/admin/pt-log`.
- [ ] The term "reduced" is replaced by "Optimized (mongo-pt)" (or "Optimized") across the PT log page and metrics dashboard.

### Real-Time Status Indication
- [ ] Navigating to `/admin/pt-log` displays a visible status indicator showing whether a query measurement is actively running or idle.
- [ ] While a measurement is in progress, the indicator displays active status with elapsed time or phase breakdown, transitioning to idle when complete.

### Metrics & Descriptions
- [ ] Each query entry in the PT log table displays a short description stating what the query computes.
- [ ] The metrics dashboard and per-query logs report latency, throughput (queries/sec), speedup ratio, and overhead percentage for both Standard MongoDB and Optimized (mongo-pt).
- [ ] Result equality check confirms that Standard MongoDB and Optimized (mongo-pt) return identical query results.

### Benchmark Dataset Scaling & Verification
- [ ] `shopsphere_bench` is seeded with a scaled dataset where multi-relation queries demonstrate measurable speedup (>1×) under the Optimized (mongo-pt) approach compared to Standard MongoDB.
- [ ] Existing PT test suite (`npm run test:pt`) passes.
- [ ] Backend API endpoints `GET /api/admin/pt-log`, `GET /api/admin/pt-status`, and `GET /api/admin/pt-metrics` return 200 OK with valid JSON matching the updated terminology.
