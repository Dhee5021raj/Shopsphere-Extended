# mongo-pt robustness results

> **Environment**
> mongod 8.2.6 | 16-core AMD Ryzen 7 7735HS with Radeon Graphics         | 15.19 GB RAM (2.61 GB free) | win32 10.0.26200 | Node v22.19.0
> scale=small runs=1 caps=[10000, 50000, 200000] bloom=true timeout=8000ms
> other heavy processes: Memory Compression (0.87 GB); chrome.exe (0.64 GB); chrome.exe (0.63 GB); freebuff.exe (0.73 GB); mongod-x64-win32-8.2.6.exe (1.15 GB)
Generated 2026-10-05T05:41:36.468Z from `server/logs/pt-log.jsonl`.

## Per-query summary (total time = transfer + materialization + join)

| spec | orders | naive median | naive min/max | naive gap | exact median | exact min/max | exact gap | transfer (ms) | mat. (ms) |
|---|---|---|---|---|---|---|---|---|---|
| rare_category_revenue_7d | 3 | 5864 | 327/6145 | 18.79 | 3 | 1/4 | 4 | 151 | 109 |

## Cap sweep (which transfer edges get skipped)

| spec | mode | cap | transfer ms | mat ms | skipped edges |
|---|---|---|---|---|---|
| rare_category_revenue_7d | exact | 10000 | 151 | 109 | (none) |
| rare_category_revenue_7d | exact | 50000 | 126 | 101 | (none) |
| rare_category_revenue_7d | exact | 200000 | 122 | 100 | (none) |
| rare_category_revenue_7d | bloom | 10000 | 19129 | 1062 | (none) |
| rare_category_revenue_7d | bloom | 50000 | 19558 | 1235 | (none) |
| rare_category_revenue_7d | bloom | 200000 | 20054 | 1139 | (none) |
| common_category_revenue_365d | exact | 10000 | 737 | 553 | oi<-o, o<-oi |
| common_category_revenue_365d | exact | 50000 | 2343 | 473 | (none) |
| common_category_revenue_365d | exact | 200000 | 2316 | 534 | (none) |
| common_category_revenue_365d | bloom | 10000 | 50427 | 5190 | oi<-o, o<-oi |

## Where it did NOT help

_No spec failed to improve in this run._

## Per-join-order detail

| spec | order | naive med (ms) | exact med (ms) | bloom med (ms) | transfer | mat | total | equal |
|---|---|---|---|---|---|---|---|---|
| rare_category_revenue_7d | `oi>o>p>v>cat` | 5864 | 1 | 3 | 151 | 109 | 261 | ok |
| rare_category_revenue_7d | `p>oi>o>cat>v` | 6145 | 3 | 3 | 151 | 109 | 263 | ok |
| rare_category_revenue_7d | `p>cat>oi>v>o` | 327 | 4 | 4 | 151 | 109 | 264 | ok |

## Specs

- **rare_category_revenue_7d** — 28 valid orders, tested 3; sizes {"cat":1,"p":3000,"oi":47987,"o":228,"v":20}
- **common_category_revenue_365d** — 28 valid orders, tested 3; sizes {"cat":1,"p":3000,"oi":47987,"o":12000,"v":20}
