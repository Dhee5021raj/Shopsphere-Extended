# mongo-pt robustness results

> **Environment**
> mongod 8.2.6 | 16-core AMD Ryzen 7 7735HS with Radeon Graphics         | 15.19 GB RAM (3.91 GB free) | win32 10.0.26200 | Node v22.19.0
> label=full scale=medium runs=5 caps=[10000, 50000, 200000] timeout=120000ms edge_ratio=0.3 mat_ratio=0.5 bloom=false
> other heavy processes: Memory Compression (0.96 GB); chrome.exe (0.58 GB); mongod-x64-win32-8.2.6.exe (0.92 GB)
Generated 2026-10-05T06:33:59.617Z from `server/logs/pt-log.jsonl`.

Legend: `DNF` = timed out (censored, lower bound = timeout, never dropped); a gap shown as `>= X` involves a DNF.

## Per-query summary

| spec | orders | naive med | naive gap | exact med | exact gap | adaptive med | adaptive gap | transfer ms | mat ms | DNF n/e/a/b |
|---|---|---|---|---|---|---|---|---|---|---|
| rare_category_revenue_7d | 2 | 54878 | 13.5 | 17 | 1.2 | 21 | 1.63 | 823 | 126 | 0/0/0/0 |

## Cap sweep + adaptive decisions (which transfer edges are skipped)

| spec | mode | cap | transfer ms | mat ms | skipped edges |
|---|---|---|---|---|---|
| rare_category_revenue_7d | exact | 10000 | 823 | 126 | (none) |
| rare_category_revenue_7d | exact | 50000 | 443 | 124 | (none) |
| rare_category_revenue_7d | exact | 200000 | 441 | 112 | (none) |
| rare_category_revenue_7d | adaptive | 50000 | 425 | 251 | oi<-v, cat<-p |
| common_category_revenue_365d | exact | 10000 | 3471 | 7705 | oi<-o, oi<-p, o<-oi, p<-oi |
| common_category_revenue_365d | exact | 50000 | 8624 | 4092 | oi<-o, o<-oi |
| common_category_revenue_365d | exact | 200000 | 28910 | 3620 | (none) |
| common_category_revenue_365d | adaptive | 50000 | 6774 | 3595 | oi<-o, o<-oi, p<-oi, cat<-p, v<-oi |

### Adaptive decisions

| spec | decision | alias | ratio | threshold | detail |
|---|---|---|---|---|---|
| rare_category_revenue_7d | edge-apply | p<-cat | 0 | 0.3 | 1 keys / 50000 rows |
| rare_category_revenue_7d | edge-apply | oi<-p | 0.0007 | 0.3 | 275 keys / 400656 rows |
| rare_category_revenue_7d | edge-apply | oi<-o | 0.2929 | 0.3 | 1878 keys / 6411 rows |
| rare_category_revenue_7d | edge-skip/ratio | oi<-v | 0.7937 | 0.3 | 100 keys / 126 rows (ratio) |
| rare_category_revenue_7d | edge-apply | p<-oi | 0.1018 | 0.3 | 28 keys / 275 rows |
| rare_category_revenue_7d | edge-skip/ratio | cat<-p | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| rare_category_revenue_7d | edge-apply | o<-oi | 0.066 | 0.3 | 124 keys / 1878 rows |
| rare_category_revenue_7d | edge-apply | v<-oi | 0.2 | 0.3 | 20 keys / 100 rows |
| rare_category_revenue_7d | mat-skip | cat | 1 | 0.5 | 1/1 rows |
| rare_category_revenue_7d | materialize | p | 0.0006 | 0.5 | 28/50000 rows |
| rare_category_revenue_7d | materialize | oi | 0.0003 | 0.5 | 126/400656 rows |
| rare_category_revenue_7d | materialize | o | 0.066 | 0.5 | 124/1878 rows |
| rare_category_revenue_7d | materialize | v | 0.2 | 0.5 | 20/100 rows |
| common_category_revenue_365d | edge-apply | p<-cat | 0 | 0.3 | 1 keys / 50000 rows |
| common_category_revenue_365d | edge-skip/cap | oi<-o | - | - | 99998 keys / ? rows (cap) |
| common_category_revenue_365d | edge-apply | oi<-p | 0.0499 | 0.3 | 19974 keys / 400656 rows |
| common_category_revenue_365d | edge-apply | oi<-v | 0.0007 | 0.3 | 100 keys / 150233 rows |
| common_category_revenue_365d | edge-skip/cap | o<-oi | - | - | 81288 keys / ? rows (cap) |
| common_category_revenue_365d | edge-skip/ratio | p<-oi | 0.9969 | 0.3 | 19913 keys / 19974 rows (ratio) |
| common_category_revenue_365d | edge-skip/ratio | cat<-p | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| common_category_revenue_365d | edge-skip/ratio | v<-oi | 1 | 0.3 | 100 keys / 100 rows (ratio) |
| common_category_revenue_365d | mat-skip | cat | 1 | 0.5 | 1/1 rows |
| common_category_revenue_365d | materialize | p | 0.3995 | 0.5 | 19974/50000 rows |
| common_category_revenue_365d | materialize | oi | 0.375 | 0.5 | 150233/400656 rows |
| common_category_revenue_365d | mat-skip | o | 1 | 0.5 | 99998/99998 rows |
| common_category_revenue_365d | mat-skip | v | 1 | 0.5 | 100/100 rows |

## Where it did NOT help

_No spec failed to improve in this run._

## Per-join-order detail

| spec | order | naive med | exact med | adaptive med | bloom med | transfer | mat | total | equal |
|---|---|---|---|---|---|---|---|---|---|
| rare_category_revenue_7d | `p>oi>o>cat>v` | 102187 | 18 | 26 | - | 823 | 126 | 967 | ok |
| rare_category_revenue_7d | `p>cat>oi>v>o` | 7569 | 15 | 16 | - | 823 | 126 | 964 | ok |
| common_category_revenue_365d | `p>oi>o>cat>v` | DNF(>=120000) | 47145 | 51371 | - | 3471 | 7705 | 58321 | n/v |

## Specs

- **rare_category_revenue_7d** — 28 valid orders, tested 2; sizes {"cat":1,"p":50000,"oi":400656,"o":1878,"v":100}
- **common_category_revenue_365d** — 28 valid orders, tested 2; sizes {"cat":1,"p":50000,"oi":400656,"o":99998,"v":100}
