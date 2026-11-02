# mongo-pt robustness results

> **Environment**
> mongod 8.2.6 | 16-core AMD Ryzen 7 7735HS with Radeon Graphics         | 15.19 GB RAM (3.96 GB free) | win32 10.0.26200 | Node v22.19.0
> label=smoke scale=small runs=2 caps=[10000, 50000, 200000] timeout=15000ms edge_ratio=0.3 mat_ratio=0.5 bloom=false
> other heavy processes: Memory Compression (0.99 GB); chrome.exe (0.60 GB); mongod-x64-win32-8.2.6.exe (0.91 GB)
Generated 2026-10-05T06:34:15.290Z from `server/logs/pt-log-smoke.jsonl`.

> ⚠️ **SMOKE TEST run** (reduced scale/runs). Use it to check the harness, not to draw performance claims.

Legend: `DNF` = timed out (censored, lower bound = timeout, never dropped); a gap shown as `>= X` involves a DNF.

## Per-query summary

| spec | orders | naive med | naive gap | exact med | exact gap | adaptive med | adaptive gap | transfer ms | mat ms | DNF n/e/a/b |
|---|---|---|---|---|---|---|---|---|---|---|
| rare_category_revenue_7d | 3 | 5912 | 18.25 | 3 | 1.5 | 29 | 1.33 | 186 | 100 | 0/0/0/0 |
| common_category_revenue_365d | 3 | 15000+ | >=1 (1 DNF) | 4730 | 1 | 7623 | 1 | 655 | 500 | 1/0/0/0 |
| vendor_scoped_revenue_90d | 5 | 6438 | 3.79 | 524 | 1.56 | 910 | 1.55 | 1808 | 206 | 0/0/0/0 |
| user_scoped_spend_30d | 5 | 556 | 4509.5 | 2 | 2.25 | 3 | 1.67 | 399 | 79 | 0/0/0/0 |
| low_rating_reviews_by_category | 5 | 777 | 2.69 | 511 | 1.55 | 797 | 1.87 | 344 | 157 | 0/0/0/0 |
| vendor_category_revenue_365d | 3 | 15000+ | >=1 (1 DNF) | 5720 | 1 | 9818 | 1 | 1028 | 559 | 1/0/0/0 |
| user_vendor_category_spend_30d | 3 | 1526+ | >=14.59 (1 DNF) | 6 | 1.3 | 6 | 1.09 | 1104 | 174 | 1/0/0/0 |

## Cap sweep + adaptive decisions (which transfer edges are skipped)

| spec | mode | cap | transfer ms | mat ms | skipped edges |
|---|---|---|---|---|---|
| rare_category_revenue_7d | exact | 10000 | 186 | 100 | (none) |
| rare_category_revenue_7d | exact | 50000 | 117 | 97 | (none) |
| rare_category_revenue_7d | exact | 200000 | 115 | 95 | (none) |
| rare_category_revenue_7d | adaptive | 50000 | 102 | 109 | oi<-o, p<-oi, cat<-p, o<-oi, v<-oi |
| common_category_revenue_365d | exact | 10000 | 655 | 500 | oi<-o, o<-oi |
| common_category_revenue_365d | exact | 50000 | 2509 | 542 | (none) |
| common_category_revenue_365d | exact | 200000 | 2375 | 538 | (none) |
| common_category_revenue_365d | adaptive | 50000 | 2424 | 569 | o<-oi, p<-oi, cat<-p, v<-oi |
| vendor_scoped_revenue_90d | exact | 10000 | 1808 | 206 | (none) |
| vendor_scoped_revenue_90d | exact | 50000 | 1633 | 204 | (none) |
| vendor_scoped_revenue_90d | exact | 200000 | 1569 | 166 | (none) |
| vendor_scoped_revenue_90d | adaptive | 50000 | 1467 | 241 | o<-oi, v<-oi |
| user_scoped_spend_30d | exact | 10000 | 399 | 79 | (none) |
| user_scoped_spend_30d | exact | 50000 | 524 | 79 | (none) |
| user_scoped_spend_30d | exact | 200000 | 558 | 73 | (none) |
| user_scoped_spend_30d | adaptive | 50000 | 542 | 100 | o<-oi, u<-o |
| low_rating_reviews_by_category | exact | 10000 | 344 | 157 | (none) |
| low_rating_reviews_by_category | exact | 50000 | 283 | 145 | (none) |
| low_rating_reviews_by_category | exact | 200000 | 285 | 138 | (none) |
| low_rating_reviews_by_category | adaptive | 50000 | 155 | 28 | r<-p, p<-r, v<-p, c<-p |
| vendor_category_revenue_365d | exact | 10000 | 1028 | 559 | oi<-o |
| vendor_category_revenue_365d | exact | 50000 | 2230 | 569 | (none) |
| vendor_category_revenue_365d | exact | 200000 | 2177 | 625 | (none) |
| vendor_category_revenue_365d | adaptive | 50000 | 1897 | 556 | o<-oi, p<-oi, c<-p, v<-p |
| user_vendor_category_spend_30d | exact | 10000 | 1104 | 174 | (none) |
| user_vendor_category_spend_30d | exact | 50000 | 1185 | 175 | (none) |
| user_vendor_category_spend_30d | exact | 200000 | 1237 | 162 | (none) |
| user_vendor_category_spend_30d | adaptive | 50000 | 1158 | 217 | oi<-v, o<-oi, u<-o |

### Adaptive decisions

| spec | decision | alias | ratio | threshold | detail |
|---|---|---|---|---|---|
| rare_category_revenue_7d | edge-apply | p<-cat | 0.0003 | 0.3 | 1 keys / 3000 rows |
| rare_category_revenue_7d | edge-apply | oi<-p | 0.0004 | 0.3 | 17 keys / 47987 rows |
| rare_category_revenue_7d | edge-skip/ratio | oi<-o | 1.2063 | 0.3 | 228 keys / 189 rows (ratio) |
| rare_category_revenue_7d | edge-apply | oi<-v | 0.1058 | 0.3 | 20 keys / 189 rows |
| rare_category_revenue_7d | edge-skip/ratio | p<-oi | 1 | 0.3 | 17 keys / 17 rows (ratio) |
| rare_category_revenue_7d | edge-skip/ratio | cat<-p | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| rare_category_revenue_7d | edge-skip/ratio | o<-oi | 0.8202 | 0.3 | 187 keys / 228 rows (ratio) |
| rare_category_revenue_7d | edge-skip/ratio | v<-oi | 0.55 | 0.3 | 11 keys / 20 rows (ratio) |
| rare_category_revenue_7d | mat-skip | cat | 1 | 0.5 | 1/1 rows |
| rare_category_revenue_7d | materialize | p | 0.0057 | 0.5 | 17/3000 rows |
| rare_category_revenue_7d | materialize | oi | 0.0039 | 0.5 | 189/47987 rows |
| rare_category_revenue_7d | mat-skip | o | 1 | 0.5 | 228/228 rows |
| rare_category_revenue_7d | mat-skip | v | 1 | 0.5 | 20/20 rows |
| common_category_revenue_365d | edge-apply | p<-cat | 0.0003 | 0.3 | 1 keys / 3000 rows |
| common_category_revenue_365d | edge-apply | oi<-o | 0.2501 | 0.3 | 12000 keys / 47987 rows |
| common_category_revenue_365d | edge-apply | oi<-p | 0.0248 | 0.3 | 1191 keys / 47987 rows |
| common_category_revenue_365d | edge-apply | oi<-v | 0.0009 | 0.3 | 20 keys / 21894 rows |
| common_category_revenue_365d | edge-skip/ratio | o<-oi | 0.8769 | 0.3 | 10523 keys / 12000 rows (ratio) |
| common_category_revenue_365d | edge-skip/ratio | p<-oi | 1 | 0.3 | 1191 keys / 1191 rows (ratio) |
| common_category_revenue_365d | edge-skip/ratio | cat<-p | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| common_category_revenue_365d | edge-skip/ratio | v<-oi | 1 | 0.3 | 20 keys / 20 rows (ratio) |
| common_category_revenue_365d | mat-skip | cat | 1 | 0.5 | 1/1 rows |
| common_category_revenue_365d | materialize | p | 0.397 | 0.5 | 1191/3000 rows |
| common_category_revenue_365d | materialize | oi | 0.4562 | 0.5 | 21894/47987 rows |
| common_category_revenue_365d | mat-skip | o | 1 | 0.5 | 12000/12000 rows |
| common_category_revenue_365d | mat-skip | v | 1 | 0.5 | 20/20 rows |
| vendor_scoped_revenue_90d | edge-apply | oi<-o | 0.0636 | 0.3 | 3051 keys / 47987 rows |
| vendor_scoped_revenue_90d | edge-apply | oi<-p | 0.2497 | 0.3 | 3000 keys / 12015 rows |
| vendor_scoped_revenue_90d | edge-apply | oi<-v | 0.0001 | 0.3 | 1 keys / 12015 rows |
| vendor_scoped_revenue_90d | edge-skip/ratio | o<-oi | 0.7388 | 0.3 | 2254 keys / 3051 rows (ratio) |
| vendor_scoped_revenue_90d | edge-apply | p<-oi | 0.262 | 0.3 | 786 keys / 3000 rows |
| vendor_scoped_revenue_90d | edge-skip/ratio | v<-oi | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| vendor_scoped_revenue_90d | mat-skip | v | 1 | 0.5 | 1/1 rows |
| vendor_scoped_revenue_90d | materialize | oi | 0.0777 | 0.5 | 3730/47987 rows |
| vendor_scoped_revenue_90d | mat-skip | o | 1 | 0.5 | 3051/3051 rows |
| vendor_scoped_revenue_90d | materialize | p | 0.262 | 0.5 | 786/3000 rows |
| user_scoped_spend_30d | edge-apply | o<-u | 0.001 | 0.3 | 1 keys / 1016 rows |
| user_scoped_spend_30d | edge-apply | oi<-p | 0.0625 | 0.3 | 3000 keys / 47987 rows |
| user_scoped_spend_30d | edge-apply | oi<-o | 0 | 0.3 | 1 keys / 47987 rows |
| user_scoped_spend_30d | edge-apply | p<-oi | 0.001 | 0.3 | 3 keys / 3000 rows |
| user_scoped_spend_30d | edge-skip/ratio | o<-oi | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| user_scoped_spend_30d | edge-skip/ratio | u<-o | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| user_scoped_spend_30d | mat-skip | u | 1 | 0.5 | 1/1 rows |
| user_scoped_spend_30d | materialize | o | 0.001 | 0.5 | 1/1016 rows |
| user_scoped_spend_30d | materialize | oi | 0.0001 | 0.5 | 4/47987 rows |
| user_scoped_spend_30d | materialize | p | 0.001 | 0.5 | 3/3000 rows |
| low_rating_reviews_by_category | edge-apply | p<-v | 0.0067 | 0.3 | 20 keys / 3000 rows |
| low_rating_reviews_by_category | edge-apply | p<-c | 0.004 | 0.3 | 12 keys / 3000 rows |
| low_rating_reviews_by_category | edge-skip/ratio | r<-p | 0.9325 | 0.3 | 3000 keys / 3217 rows (ratio) |
| low_rating_reviews_by_category | edge-skip/ratio | p<-r | 0.6527 | 0.3 | 1958 keys / 3000 rows (ratio) |
| low_rating_reviews_by_category | edge-skip/ratio | v<-p | 1 | 0.3 | 20 keys / 20 rows (ratio) |
| low_rating_reviews_by_category | edge-skip/ratio | c<-p | 1 | 0.3 | 12 keys / 12 rows (ratio) |
| low_rating_reviews_by_category | mat-skip | r | 1 | 0.5 | 3217/3217 rows |
| low_rating_reviews_by_category | mat-skip | p | 1 | 0.5 | 3000/3000 rows |
| low_rating_reviews_by_category | mat-skip | c | 1 | 0.5 | 12/12 rows |
| low_rating_reviews_by_category | mat-skip | v | 1 | 0.5 | 20/20 rows |
| vendor_category_revenue_365d | edge-apply | p<-c | 0.004 | 0.3 | 12 keys / 3000 rows |
| vendor_category_revenue_365d | edge-apply | p<-v | 0.0003 | 0.3 | 1 keys / 3000 rows |
| vendor_category_revenue_365d | edge-apply | oi<-o | 0.2501 | 0.3 | 12000 keys / 47987 rows |
| vendor_category_revenue_365d | edge-apply | oi<-p | 0.0174 | 0.3 | 837 keys / 47987 rows |
| vendor_category_revenue_365d | edge-skip/ratio | o<-oi | 0.7503 | 0.3 | 9004 keys / 12000 rows (ratio) |
| vendor_category_revenue_365d | edge-skip/ratio | p<-oi | 1 | 0.3 | 837 keys / 837 rows (ratio) |
| vendor_category_revenue_365d | edge-skip/ratio | c<-p | 1 | 0.3 | 12 keys / 12 rows (ratio) |
| vendor_category_revenue_365d | edge-skip/ratio | v<-p | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| vendor_category_revenue_365d | mat-skip | v | 1 | 0.5 | 1/1 rows |
| vendor_category_revenue_365d | materialize | p | 0.279 | 0.5 | 837/3000 rows |
| vendor_category_revenue_365d | materialize | oi | 0.3142 | 0.5 | 15076/47987 rows |
| vendor_category_revenue_365d | mat-skip | o | 1 | 0.5 | 12000/12000 rows |
| vendor_category_revenue_365d | mat-skip | c | 1 | 0.5 | 12/12 rows |
| user_vendor_category_spend_30d | edge-apply | p<-c | 0.004 | 0.3 | 12 keys / 3000 rows |
| user_vendor_category_spend_30d | edge-apply | o<-u | 0.001 | 0.3 | 1 keys / 1015 rows |
| user_vendor_category_spend_30d | edge-apply | oi<-p | 0.0625 | 0.3 | 3000 keys / 47987 rows |
| user_vendor_category_spend_30d | edge-apply | oi<-o | 0 | 0.3 | 1 keys / 47987 rows |
| user_vendor_category_spend_30d | edge-skip/ratio | oi<-v | 5 | 0.3 | 20 keys / 4 rows (ratio) |
| user_vendor_category_spend_30d | edge-apply | p<-oi | 0.001 | 0.3 | 3 keys / 3000 rows |
| user_vendor_category_spend_30d | edge-apply | c<-p | 0.25 | 0.3 | 3 keys / 12 rows |
| user_vendor_category_spend_30d | edge-skip/ratio | o<-oi | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| user_vendor_category_spend_30d | edge-skip/ratio | u<-o | 1 | 0.3 | 1 keys / 1 rows (ratio) |
| user_vendor_category_spend_30d | edge-apply | v<-oi | 0.15 | 0.3 | 3 keys / 20 rows |
| user_vendor_category_spend_30d | mat-skip | u | 1 | 0.5 | 1/1 rows |
| user_vendor_category_spend_30d | materialize | o | 0.001 | 0.5 | 1/1015 rows |
| user_vendor_category_spend_30d | materialize | oi | 0.0001 | 0.5 | 4/47987 rows |
| user_vendor_category_spend_30d | materialize | p | 0.001 | 0.5 | 3/3000 rows |
| user_vendor_category_spend_30d | materialize | v | 0.15 | 0.5 | 3/20 rows |
| user_vendor_category_spend_30d | materialize | c | 0.25 | 0.5 | 3/12 rows |

## Where it did NOT help

- **low_rating_reviews_by_category (exact)**: reduced total 1012 ms >= naive 777 ms (transfer+mat overhead 501 ms, reported separately).
- **low_rating_reviews_by_category (adaptive)**: reduced total 1298 ms >= naive 777 ms (transfer+mat overhead 501 ms, reported separately).

## Per-join-order detail

| spec | order | naive med | exact med | adaptive med | bloom med | transfer | mat | total | equal |
|---|---|---|---|---|---|---|---|---|---|
| rare_category_revenue_7d | `oi>o>p>v>cat` | 5912 | 3 | 26 | - | 186 | 100 | 289 | ok |
| rare_category_revenue_7d | `p>oi>o>cat>v` | 6342 | 3 | 29 | - | 186 | 100 | 289 | ok |
| rare_category_revenue_7d | `p>cat>oi>v>o` | 348 | 2 | 35 | - | 186 | 100 | 288 | ok |
| common_category_revenue_365d | `oi>o>p>v>cat` | DNF(>=15000) | 4730 | 7623 | - | 655 | 500 | 5885 | n/v |
| vendor_scoped_revenue_90d | `v>oi>p>o` | 2690 | 410 | 714 | - | 1808 | 206 | 2424 | ok |
| vendor_scoped_revenue_90d | `oi>p>v>o` | 10186 | 639 | 1107 | - | 1808 | 206 | 2653 | ok |
| user_scoped_spend_30d | `o>u>oi>p` | 98 | 5 | 2 | - | 399 | 79 | 483 | ok |
| user_scoped_spend_30d | `o>oi>u>p` | 556 | 3 | 3 | - | 399 | 79 | 481 | ok |
| user_scoped_spend_30d | `oi>p>o>u` | 9019 | 2 | 3 | - | 399 | 79 | 480 | ok |
| user_scoped_spend_30d | `u>o>oi>p` | 2 | 2 | 3 | - | 399 | 79 | 480 | ok |
| user_scoped_spend_30d | `p>oi>o>u` | 6692 | 2 | 3 | - | 399 | 79 | 480 | ok |
| low_rating_reviews_by_category | `r>p>v>c` | 494 | 507 | 758 | - | 344 | 157 | 1008 | ok |
| low_rating_reviews_by_category | `p>v>r>c` | 777 | 511 | 744 | - | 344 | 157 | 1012 | ok |
| low_rating_reviews_by_category | `p>r>v>c` | 766 | 553 | 797 | - | 344 | 157 | 1054 | ok |
| low_rating_reviews_by_category | `r>p>c>v` | 896 | 480 | 1379 | - | 344 | 157 | 981 | ok |
| low_rating_reviews_by_category | `p>v>c>r` | 1329 | 742 | 1388 | - | 344 | 157 | 1243 | ok |
| vendor_category_revenue_365d | `oi>p>o>v>c` | DNF(>=15000) | 5720 | 9818 | - | 1028 | 559 | 7307 | n/v |
| user_vendor_category_spend_30d | `o>oi>u>v>p>c` | 1028 | 6 | 6 | - | 1104 | 174 | 1284 | ok |
| user_vendor_category_spend_30d | `o>oi>p>u>v>c` | 1526 | 7 | 6 | - | 1104 | 174 | 1285 | ok |
| user_vendor_category_spend_30d | `oi>v>o>u>p>c` | DNF(>=15000) | 5 | 6 | - | 1104 | 174 | 1283 | n/v |

## Specs

- **rare_category_revenue_7d** — 28 valid orders, tested 3; sizes {"cat":1,"p":3000,"oi":47987,"o":228,"v":20}
- **common_category_revenue_365d** — 28 valid orders, tested 3; sizes {"cat":1,"p":3000,"oi":47987,"o":12000,"v":20}
- **vendor_scoped_revenue_90d** — 12 valid orders, tested 5; sizes {"v":1,"oi":47987,"o":3051,"p":3000}
- **user_scoped_spend_30d** — 8 valid orders, tested 5; sizes {"u":1,"o":1016,"oi":47987,"p":3000}
- **low_rating_reviews_by_category** — 12 valid orders, tested 5; sizes {"r":3217,"p":3000,"c":12,"v":20}
- **vendor_category_revenue_365d** — 28 valid orders, tested 3; sizes {"v":1,"p":3000,"oi":47987,"o":12000,"c":12}
- **user_vendor_category_spend_30d** — 72 valid orders, tested 3; sizes {"u":1,"o":1015,"oi":47987,"p":3000,"v":20,"c":12}
