# mongo-pt — design notes (Step 0)

This document describes the design of **mongo-pt**, a predicate-transfer (PT) engine for
MongoDB inspired by:

> Junyi Zhao, Kai Su, Yifei Yang, Xiangyao Yu, Paraschos Koutris, Huanchen Zhang.
> *Debunking the Myth of Join Ordering: Toward Robust SQL Analytics.* SIGMOD 2025.
> arXiv:2502.15181 — https://arxiv.org/abs/2502.15181

The goal of the project (a DBMS course project on query optimization) is to show the
paper's central claim — **join-order robustness** — on MongoDB: after a full semi-join
reduction ("the transfer phase"), the join phase becomes insensitive to the join order it
is executed in, because every intermediate result is bounded by the final output.

The paper's algorithm is **Robust Predicate Transfer (RPT)**. RPT = *Yannakakis-style
semi-join reduction* + the paper's two new algorithms:

1. **LargestRoot** — builds the transfer schedule (a join tree) so that the reduction is
   *complete* for acyclic queries, and the largest relation sits at the root.
2. **SafeSubjoin** — verifies that a chosen join order in the *join phase* is "safe"
   (no intermediate blowup) for queries that are acyclic but not γ-acyclic.

---

## 1. Model

### 1.1 Join graph

A query is a set of relations `R_1 … R_n`. Each relation is
`{ collection, alias, localFilter }`. A join edge is an equality between two aliases:
`R_i.f = R_j.g` (only equality joins are supported).

The **join graph** `G_q` is undirected: vertices are relations, an edge exists between two
relations when they share a join attribute. Following the paper (Lemma 3.2), each edge
carries a **weight** = the number of shared join attributes between the two relations
(most real edges have weight 1).

### 1.2 Acyclicity (α-acyclicity)

A natural join is **α-acyclic** iff it has a join tree (Definition 3.1). We test this with
the classic **GYO ear-removal** algorithm: repeatedly remove a vertex whose neighbours form
a clique (an "ear"); the graph is α-acyclic iff it can be reduced to the empty graph this
way. Cyclic specs are **rejected** with a clear error, exactly as the brief requires.

### 1.3 γ-acyclicity

`q` is γ-acyclic iff it is α-acyclic and has no 3-cycle `R(x,y), S(y,z), T(x,y,z)`
(Definition 3.4). In practice a sufficient test is: **no two relations are connected by
more than one edge** (no composite-key joins). Our benchmark queries join every pair on a
single attribute, so they are γ-acyclic; see §5 for how this affects SafeSubjoin.

---

## 2. The transfer schedule (LargestRoot)

This is the paper's Algorithm 1, restated in our own words:

**LargestRoot(G_q) → tree T**
- Let `R_max` be the relation with the largest cardinality (estimated; see §4.1). Start
  with `R' = { R_max }` and `T = ∅`.
- Repeat until `R'` contains every relation:
  - among all edges `{R, S}` of `G_q` with `R ∉ R'` and `S ∈ R'`, pick the one with the
    **largest weight**; break ties by picking the largest `R` (pushes big relations toward
    the root early, minimising Bloom/set construction time);
  - add `{R, S}` to `T`, **directed from `R` toward `S`** (i.e. leaf → root);
  - add `R` to `R'`.
- Return `T`.

This is Prim's maximum-spanning-tree algorithm started from the largest relation. Because
of Lemma 3.2, for an acyclic query `T` is a **join tree** — which is exactly what makes
the semi-join reduction complete. `R_max` is the **root**.

### 2.1 Forward pass then backward pass

From the directed tree we generate an ordered list of transfer steps, exactly the
Yannakakis semi-join phases:

**Forward pass — leaf → root (post-order).**
For each node `u` in post-order, for each child `c` of `u`:
semi-join `u ⋉ c`, i.e. *filter `u` using the key set currently held by `c`*. After
filtering, `u`'s distinct key sets are recomputed and become available to `u`'s parent.

**Backward pass — root → leaf (pre-order).**
For each node `u ≠ root` with parent `p`: semi-join `u ⋉ p`, i.e. filter `u` using the
key set currently held by `p`. After the backward pass every relation is fully reduced
(for acyclic queries).

A transfer step is therefore:

```
{ target: <alias>, filterBy: <alias>, on: { targetField, filterField },
  direction: 'forward' | 'backward' }
```

Implementation of one step:
1. `incoming` = the distinct values that `filterBy` currently holds on `filterField`
   (a `FilterSet`).
2. query `target` with `{ ...target.localFilter, [targetField]: incoming.toMongoClause() }`,
   projecting only the key fields needed for the target's remaining edges.
3. recompute `target`'s distinct outgoing key sets (one per join attribute) and store them.

Large `incoming` sets are pushed as **batched `$in`** lists. If a set exceeds the cap
(`PT_IN_CAP`, default 50 000) the step is **skipped** and logged — this breaks the
completeness guarantee, which we state honestly in the docs.

---

## 3. Filter interface

```js
// server/pt/filters/FilterSet.js
interface FilterSet {
  add(value);                 // add a key value
  has(value) -> boolean;      // membership test (used by tests)
  size() -> number;           // cardinality of the set
  toMongoClause(field) -> object;  // { [field]: <mongo predicate> }
}
```

- **`ExactSet`** — default. Stores distinct values in a `Set`; `toMongoClause(field)` →
  `{ [field]: { $in: [...batches] } }` (the engine batches by `PT_IN_CAP`).
  Exact ⇒ the reduction is a true semi-join ⇒ the correctness/robustness guarantee holds.
- **`BloomFilterSet`** — *experimental*, behind `PT_BLOOM=1`. A hand-rolled Bloom filter
  exposed to the server via `$function` so that filtering can happen inside the query.
  MongoDB cannot build/probe a Bloom filter inside a normal query plan, so this is a
  best-effort approximation with false positives (the subsequent join phase removes them).
  The deployment is probed and the result (allowed / rejected) is reported either way.

---

## 4. Assumptions & implementation notes

1. **Orchestration is in Node, not in the DB optimizer.** The paper inserts `CreateBF` /
   `ProbeBF` operators into DuckDB's logical optimizer. MongoDB exposes no such hook, so
   `mongo-pt` runs the transfer schedule from Node and issues one reduced query per step.
   Only the *effect* (a reduced relation) is reproduced.
2. **Cardinality estimates.** LargestRoot needs relation sizes to pick `R_max` and to
   break ties. We use `estimatedDocumentCount()` / `countDocuments(localFilter)` cached per
   run.
3. **Exact sets instead of Bloom filters by default.** Cheaper to reason about and exact,
   but the set itself can be large — hence the in-list cap and the optional Bloom path.
4. **Materialization cost is always reported separately.** The "reduced" mode total is
   `transfer + materialization + join`; the transfer overhead is never hidden.
5. **Equality joins only, acyclic only** — cyclic specs are rejected by the join graph check.
6. **Money is rounded to 2 decimals** before comparing naive vs reduced results.
7. The benchmark always runs against a **separate database** (`shopsphere_bench`) and a
   **real `mongod`**, never the demo database and never `mongodb-memory-server` at runtime.

---

## 5. Differences from the paper (honest list)

| Paper (DuckDB, RPT) | mongo-pt | Why |
| --- | --- | --- |
| Bloom filter operators inside the query plan | Default **exact key sets** pushed as batched `$in`; optional `$function` Bloom behind `PT_BLOOM=1` | MongoDB cannot build/probe a Bloom filter inside a query |
| Orchestration inside the DB optimizer | Orchestration in Node, one reduced query per step | No optimizer extension point |
| `SafeSubjoin` supervises the join order for acyclic-but-not-γ-acyclic queries | **Skipped**; we detect γ-acyclicity (single-attribute pairwise joins) and note that every benchmark query is γ-acyclic, so every connected join order is safe | The brief allows skipping it if not simple; the guarantee is not needed for our γ-acyclic specs |
| Bushy plans discussed | Left-deep `$lookup` join orders only | Simplicity; the paper itself finds bushy gives little |
| Semi-join via Bloom (approx.) | Exact semi-join (equivalent reduction, larger memory) | Correctness-first default |

All of these are surfaced again in `docs/predicate-transfer.md`.
