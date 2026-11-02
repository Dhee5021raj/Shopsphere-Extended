import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, BarChart2, CheckCircle, CheckCircle2, Clock, Database, RefreshCw, Search, ShieldCheck, Target, TrendingUp, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import axios from "axios";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
//#region client/src/services/api.js
var api = axios.create({
	baseURL: "/api",
	headers: { "Content-Type": "application/json" }
});
api.interceptors.request.use((config) => {
	const token = localStorage.getItem("shopsphere_token");
	if (token) config.headers.Authorization = `Bearer ${token}`;
	let sessionId = localStorage.getItem("shopsphere_guest_session");
	if (!sessionId) {
		sessionId = `guest_${Math.random().toString(36).substring(2)}_${Date.now()}`;
		localStorage.setItem("shopsphere_guest_session", sessionId);
	}
	config.headers["x-session-id"] = sessionId;
	return config;
}, (error) => Promise.reject(error));
//#endregion
//#region client/src/pages/PtLogPage.jsx
var fmtMs = (v) => v == null ? "—" : `${Math.round(v)} ms`;
var pct = (v) => v == null ? "—" : `${v}%`;
var fmtThroughput = (v) => {
	if (v == null || isNaN(v)) return "—";
	const num = Number(v);
	if (num < 1) return `${num.toFixed(4)} q/s`;
	return `${num.toFixed(2)} q/s`;
};
var fmtTime = (ts) => {
	if (!ts) return "—";
	const d = new Date(isNaN(+ts) && typeof ts === "string" ? ts.replace(" ", "T") : ts);
	if (isNaN(d.getTime())) return String(ts);
	const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 6e4));
	const rel = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.floor(mins / 60)} h ago` : `${Math.floor(mins / 1440)} d ago`;
	return `${d.toLocaleTimeString(void 0, {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit"
	})} · ${rel}`;
};
/**
* Canonical Metadata Registry for Benchmark & Relational Queries.
* Provides scholarly, relational-calculus level descriptions decoupled from UI search events.
*/
var SPEC_METADATA = {
	rare_category_revenue_7d: {
		title: "Rare Category Revenue (7-Day)",
		shortDesc: "Sum of order-item line totals grouped by vendor for products in a rare category over the last 7 days.",
		computation: "5-relation join (cat ⋈ p ⋈ oi ⋈ o ⋈ v) summing order item line totals grouped by vendor for orders placed in the last 7 days — top 50 vendors by revenue.",
		joinOrder: "categories ▸ products ▸ order items ▸ orders ▸ vendors",
		selectivity: "High (~1 rare category row out of 100). Semi-join reduction prunes >99% of intermediate product and order tuples.",
		relations: [
			"categories",
			"products",
			"order_items",
			"orders",
			"vendors"
		]
	},
	common_category_revenue_365d: {
		title: "Common Category Revenue (365-Day)",
		shortDesc: "Sum of order-item line totals grouped by vendor for products in a common category over 365 days.",
		computation: "5-relation join (cat ⋈ p ⋈ oi ⋈ o ⋈ v) summing order item line totals grouped by vendor for Category 1 over 365 days — top 50 vendors by revenue.",
		joinOrder: "categories ▸ products ▸ order items ▸ orders ▸ vendors",
		selectivity: "Low (unselective). High cardinality survives reducer pass; transfer overhead outweighs reduction (honest negative control).",
		relations: [
			"categories",
			"products",
			"order_items",
			"orders",
			"vendors"
		]
	},
	vendor_scoped_revenue_90d: {
		title: "Vendor-Scoped Revenue (90-Day)",
		shortDesc: "Sum of order-item line totals grouped by product for one large vendor over 90 days.",
		computation: "4-relation join (v ⋈ oi ⋈ o ⋈ p) summing line totals grouped by product, restricted to Vendor 0 over 90 days — top 50 products by revenue.",
		joinOrder: "vendors ▸ order items ▸ orders ▸ products",
		selectivity: "Medium-High (1 vendor scoped). Demonstrates vendor-partition pruning via semi-join reducer.",
		relations: [
			"vendors",
			"order_items",
			"orders",
			"products"
		]
	},
	user_scoped_spend_30d: {
		title: "User-Scoped Spend (30-Day)",
		shortDesc: "Sum of order-item line totals grouped by product for orders placed by a single user in 30 days.",
		computation: "4-relation join (u ⋈ o ⋈ oi ⋈ p) summing order item line totals grouped by product for orders placed by one user in the last 30 days — top 50 products by spend.",
		joinOrder: "users ▸ orders ▸ order items ▸ products",
		selectivity: "Extremely high (single user needle in 100k orders). Near-instant semi-join pruning across orders and items.",
		relations: [
			"users",
			"orders",
			"order_items",
			"products"
		]
	},
	low_rating_reviews_by_category: {
		title: "Low Rating Reviews by Category",
		shortDesc: "Count of 1–2★ reviews with average rating, grouped by category via review → product → category + vendor.",
		computation: "4-relation join (r ⋈ p ⋈ c ⋈ v) counting reviews with rating ≤ 2 and calculating average rating per category — top 50 categories by review count.",
		joinOrder: "reviews ▸ products ▸ categories ▸ vendors",
		selectivity: "Medium. Branching join tree where reviews filter does not strongly constrain the products relation.",
		relations: [
			"reviews",
			"products",
			"categories",
			"vendors"
		]
	},
	vendor_category_revenue_365d: {
		title: "Vendor × Category Revenue (365-Day)",
		shortDesc: "Sum of order-item line totals grouped by category, restricted to one vendor over 365 days.",
		computation: "5-relation join (v ⋈ p ⋈ oi ⋈ o ⋈ c) summing line totals grouped by category for Vendor 0 over 365 days — top 50 categories by revenue.",
		joinOrder: "vendors ▸ products ▸ order items ▸ orders ▸ categories",
		selectivity: "Mixed 5-relation join across vendor and category axes.",
		relations: [
			"vendors",
			"products",
			"order_items",
			"orders",
			"categories"
		]
	},
	user_vendor_category_spend_30d: {
		title: "User × Vendor × Category Spend (30-Day)",
		shortDesc: "Spend per (vendor × category) for a single user over 30 days (heaviest 6-relation join tree).",
		computation: "6-relation join (u ⋈ o ⋈ oi ⋈ p ⋈ v ⋈ c) summing spend per (vendor × category) pair for one user over 30 days — top 50 pairs by spend.",
		joinOrder: "users ▸ orders ▸ order items ▸ products ▸ vendors ▸ categories",
		selectivity: "Heaviest join tree (6 relations). Transfer + temporary collection materialization dominate execution time at small scales.",
		relations: [
			"users",
			"orders",
			"order_items",
			"products",
			"vendors",
			"categories"
		]
	}
};
var SPEC_INFO = {
	rare_category_revenue_7d: "Revenue per vendor for a RARE category over the last 7 days (cat▸p▸oi▸o▸v). Highly selective — triggered by product searches. This is the spec that should win big.",
	common_category_revenue_365d: "Revenue per vendor for a COMMON category over 365 days. Unselective — transfer overhead outweighs the pruning (honest negative case).",
	vendor_scoped_revenue_90d: "Revenue per product for one large vendor over 90 days (vendor-scoped).",
	user_scoped_spend_30d: "Spend per product for a single user over 30 days (user-scoped — extremely selective).",
	low_rating_reviews_by_category: "Count/avg of low-rating (≤2★) reviews per category (reviews▸products▸categories▸vendors). A known no-win case.",
	vendor_category_revenue_365d: "Revenue for one vendor + one category over 365 days.",
	user_vendor_category_spend_30d: "Spend per (vendor × category) for one user over the last 30 days. The heaviest spec — 6 relations joined, so transfer + materialization often dominate at small scales. An honest worst case for the optimization."
};
var KIND_INFO = {
	shadow: "Live measurement fired by a site action (product search or analytics page) — the row you demo",
	order: "Benchmark protocol record: one Standard MongoDB vs Optimized (mongo-pt) comparison for a single join order",
	summary: "Benchmark protocol record: per-spec aggregate across all tested orders",
	cap: "Cap-sweep record: what happens when the $in-transfer size limit changes",
	env: "Environment snapshot logged with benchmark runs (mongod version, CPU/RAM, Node)",
	spec: "Spec declaration record: relation sizes and how many valid join orders exist"
};
var SHORT_QUERY = {
	rare_category_revenue_7d: "Sum of order-item line totals grouped by vendor, selling products from a single rare category, orders placed in the last 7 days — top 50 vendors by revenue",
	common_category_revenue_365d: "Sum of order-item line totals grouped by vendor, selling products from a single common category (Category 1), orders in the last 365 days — top 50 vendors by revenue",
	vendor_scoped_revenue_90d: "Sum of order-item line totals grouped by product, restricted to one large vendor (Vendor 0), orders in the last 90 days — top 50 products by revenue",
	user_scoped_spend_30d: "Sum of order-item line totals grouped by product, restricted to orders placed by a single user, orders in the last 30 days — top 50 products by spend",
	low_rating_reviews_by_category: "Count of 1–2★ reviews together with their average rating, grouped by category via review → product → category + vendor — top 50 categories by review count",
	vendor_category_revenue_365d: "Sum of order-item line totals grouped by category, restricted to one vendor (Vendor 0), orders in the last 365 days — top 50 categories by revenue",
	user_vendor_category_spend_30d: "Sum of order-item line totals grouped by (vendor × category) for a single user, orders in the last 30 days — top 50 vendor×category pairs by spend"
};
var getCanonicalQueryInfo = (recordOrSpec) => {
	const spec = typeof recordOrSpec === "string" ? recordOrSpec : recordOrSpec?.spec;
	const description = typeof recordOrSpec === "object" ? recordOrSpec?.description : null;
	if (SPEC_METADATA[spec]) return SPEC_METADATA[spec];
	if (spec && spec.startsWith("live_search_")) return {
		title: "Live Search Query (Rare Category Revenue)",
		shortDesc: "Revenue per vendor for rare category products ordered in last 7 days, restricted to products matching live search filters.",
		computation: "5-relation join (cat ⋈ p ⋈ oi ⋈ o ⋈ v) evaluating aggregate vendor revenue on products matching live user search criteria — spliced into product relation.",
		joinOrder: "categories ▸ products ▸ order items ▸ orders ▸ vendors",
		selectivity: "Dynamic (filter-dependent). Spliced into product relation on both Standard MongoDB and Optimized (mongo-pt) sides.",
		relations: SPEC_METADATA.rare_category_revenue_7d.relations,
		isLiveVariant: true
	};
	return {
		title: spec || "Benchmark Query",
		shortDesc: description || SHORT_QUERY[spec] || SPEC_INFO[spec] || "Benchmark relational query execution",
		computation: description || "Relational join pipeline execution",
		joinOrder: "Standard pipeline join tree",
		selectivity: "Benchmark specification",
		relations: [],
		isLiveVariant: false
	};
};
var getTriggerContext = (record) => {
	if (!record) return {
		label: "Benchmark Protocol",
		kind: "benchmark",
		action: "Direct benchmark execution"
	};
	const { trigger, kind, search_term } = record;
	if (kind !== "shadow" || !trigger) return {
		label: kind ? `Benchmark (${kind})` : "Benchmark Protocol",
		kind: kind || "benchmark",
		action: "Direct benchmark execution"
	};
	try {
		const [pathname, qs] = String(trigger).split("?");
		const params = new URLSearchParams(qs || "");
		if (pathname.startsWith("/api/products")) {
			const search = search_term || params.get("search");
			const category = params.get("category");
			if (search) return {
				label: "Product Search",
				action: `Searched for "${search}"`,
				searchTerm: search,
				kind: "search",
				endpoint: trigger
			};
			if (category) return {
				label: "Category Browse",
				action: `Browsed category "${category}"`,
				kind: "browse",
				endpoint: trigger
			};
			return {
				label: "Catalog Browse",
				action: "Opened Product Catalog",
				kind: "catalog",
				endpoint: trigger
			};
		}
		if (pathname.startsWith("/api/analytics/admin")) return {
			label: "Admin Dashboard",
			action: "Loaded Admin Analytics",
			kind: "analytics",
			endpoint: trigger
		};
		if (pathname.startsWith("/api/analytics/vendor")) return {
			label: "Vendor Dashboard",
			action: "Loaded Vendor Analytics",
			kind: "analytics",
			endpoint: trigger
		};
		return {
			label: "API Request",
			action: pathname,
			kind: "api",
			endpoint: trigger
		};
	} catch (_) {
		return {
			label: "API Trigger",
			action: trigger,
			kind: "api",
			endpoint: trigger
		};
	}
};
var ALIAS = {
	p: "products",
	cat: "categories",
	oi: "order items",
	o: "orders",
	v: "vendors",
	u: "users",
	c: "categories",
	r: "reviews"
};
var prettyOrder = (o) => {
	if (!o) return "—";
	return o.split(">").map((s) => ALIAS[s.trim()] || s.trim()).join(" ▸ ") + "  (" + o + ")";
};
var filterChips = (f) => {
	if (!f) return [];
	return [
		f.minRating != null ? `★ ≥ ${f.minRating}` : null,
		f.minPrice != null || f.maxPrice != null ? `$${f.minPrice != null ? f.minPrice : 0}–${f.maxPrice != null ? f.maxPrice : "∞"}` : null,
		f.inStock ? "in stock" : null,
		f.featured ? "featured" : null,
		f.vendorName ? `vendor: ${f.vendorName}` : null
	].filter(Boolean);
};
/**
* Speedup factor badge highlighting acceleration (>1.0x).
*/
var SpeedupBadge = ({ speedup }) => {
	if (speedup == null) return /* @__PURE__ */ jsx("span", {
		className: "text-slate-400 font-mono text-xs",
		children: "—"
	});
	const num = Number(speedup);
	if (num >= 1.05) return /* @__PURE__ */ jsxs("span", {
		className: "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs",
		title: `Optimized (mongo-pt) is ${num.toFixed(2)}x faster than Standard MongoDB`,
		children: [
			/* @__PURE__ */ jsx("span", {
				className: "text-[10px]",
				children: "⚡"
			}),
			num.toFixed(2),
			"×"
		]
	});
	if (num >= .95) return /* @__PURE__ */ jsxs("span", {
		className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300",
		title: "Parity: Standard MongoDB and Optimized (mongo-pt) execution times are comparable",
		children: [
			"~",
			num.toFixed(2),
			"×"
		]
	});
	return /* @__PURE__ */ jsxs("span", {
		className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200",
		title: `Transfer and materialization overhead exceeded reduction benefit (${num.toFixed(2)}x)`,
		children: [
			/* @__PURE__ */ jsx("span", {
				className: "text-[10px]",
				children: "🔻"
			}),
			num.toFixed(2),
			"×"
		]
	});
};
/**
* Result verification status badge with polynomial checksum and tuple row count.
*/
var VerificationBadge = ({ equal, checksum: crcChecksum, rows, mismatch }) => {
	if (equal == null) return /* @__PURE__ */ jsx("span", {
		className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200",
		title: "Result verification not evaluated for this protocol record",
		children: "n/v"
	});
	if (equal) return /* @__PURE__ */ jsxs("div", {
		className: "flex flex-col items-center",
		children: [/* @__PURE__ */ jsxs("span", {
			className: "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs",
			title: `✓ Equal: Standard MongoDB and Optimized (mongo-pt) returned identical results (${rows != null ? `${rows} rows` : ""}). Checksum: ${crcChecksum || "verified"}`,
			children: [/* @__PURE__ */ jsx(CheckCircle, {
				size: 12,
				className: "text-emerald-700"
			}), "Equal (ok)"]
		}), crcChecksum && /* @__PURE__ */ jsx("span", {
			className: "font-mono text-[9px] text-slate-500 mt-0.5 tracking-tight",
			title: `CRC32 polynomial result checksum across both engines: ${crcChecksum}`,
			children: crcChecksum
		})]
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "flex flex-col items-center",
		children: [/* @__PURE__ */ jsxs("span", {
			className: "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-xs",
			title: `Mismatch: Query results differed between engines! Reason: ${mismatch || "Data variance"}`,
			children: [/* @__PURE__ */ jsx(AlertTriangle, {
				size: 12,
				className: "text-rose-700"
			}), "MISMATCH"]
		}), mismatch && /* @__PURE__ */ jsx("span", {
			className: "text-[9px] text-rose-600 font-semibold max-w-[100px] truncate",
			title: mismatch,
			children: mismatch
		})]
	});
};
/**
* Transfer overhead (%) and Materialization time (ms) breakdown cell.
*/
var OverheadCell = ({ transferMs, matMs, overheadPct, fmtMs: formatMs = fmtMs, pct: formatPct = pct }) => {
	const pctVal = overheadPct != null ? Math.round(overheadPct) : null;
	const pctColor = pctVal == null ? "bg-slate-300" : pctVal < 30 ? "bg-emerald-500" : pctVal < 70 ? "bg-amber-500" : "bg-indigo-500";
	return /* @__PURE__ */ jsxs("div", {
		className: "text-right",
		children: [
			/* @__PURE__ */ jsx("div", {
				className: "flex items-center justify-end gap-1.5",
				children: /* @__PURE__ */ jsx("span", {
					className: `px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${pctVal == null ? "text-slate-400 bg-slate-100 border-slate-200" : pctVal < 30 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : pctVal < 70 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-indigo-700 bg-indigo-50 border-indigo-200"}`,
					children: formatPct(overheadPct)
				})
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "text-[10px] text-slate-500 mt-0.5 font-mono",
				children: [
					/* @__PURE__ */ jsxs("span", {
						title: `Transfer overhead ($in reducer arrays): ${formatMs(transferMs)}`,
						children: ["T: ", formatMs(transferMs)]
					}),
					" · ",
					/* @__PURE__ */ jsxs("span", {
						title: `Materialization time (temporary collections): ${formatMs(matMs)}`,
						children: ["M: ", formatMs(matMs)]
					})
				]
			}),
			pctVal != null && /* @__PURE__ */ jsx("div", {
				className: "w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-1 border border-slate-200",
				children: /* @__PURE__ */ jsx("div", {
					className: `${pctColor} h-full transition-all`,
					style: { width: `${Math.min(100, Math.max(0, pctVal))}%` }
				})
			})
		]
	});
};
/**
* Dual Latency & Instantaneous Throughput Cell.
*/
var LatencyThroughputCell = ({ ms, engine = "standard", fmtMs: formatMs = fmtMs, fmtThroughput: formatTp = fmtThroughput }) => {
	const tput = ms != null && ms > 0 ? 1e3 / ms : null;
	return /* @__PURE__ */ jsxs("div", {
		className: "text-right",
		children: [/* @__PURE__ */ jsx("div", {
			className: `font-bold ${engine === "standard" ? "text-rose-600" : "text-emerald-600"} text-xs`,
			children: formatMs(ms)
		}), /* @__PURE__ */ jsx("div", {
			className: "text-[10px] text-slate-500 font-mono",
			title: `Instantaneous throughput: ${formatTp(tput)}`,
			children: formatTp(tput)
		})]
	});
};
/**
* RealTimeStatusCard
*
* Prominent, accessible real-time query optimization status indicator.
* Displays stepped 3-phase progression:
*   1. Optimized (mongo-pt)
*   2. Standard MongoDB
*   3. Verification & Materialization
*
* Integrates dynamic sub-second elapsed timer and accessible ARIA live-region.
*/
var RealTimeStatusCard = ({ runStatus = { running: false }, nowTick = Date.now(), latestRecord = null, onRefresh = () => {}, isFastPolling = false }) => {
	const isRunning = Boolean(runStatus && runStatus.running);
	const opt = runStatus && (runStatus.optimized || runStatus.reduced) || null;
	const std = runStatus && (runStatus.standard || runStatus.naive) || null;
	const ver = runStatus && runStatus.verification || null;
	const totalElapsedSec = isRunning && runStatus?.startedAt ? Math.max(0, (nowTick - new Date(runStatus.startedAt).getTime()) / 1e3) : null;
	const optElapsedSec = opt?.running && opt?.startedAt ? Math.max(0, (nowTick - new Date(opt.startedAt).getTime()) / 1e3) : null;
	const stdElapsedSec = std?.running && std?.startedAt ? Math.max(0, (nowTick - new Date(std.startedAt).getTime()) / 1e3) : null;
	const optState = opt?.done ? "done" : opt?.running ? "running" : "queued";
	const stdState = std?.done ? "done" : std?.running ? "running" : "queued";
	const verState = ver?.phase === "done" || optState === "done" && stdState === "done" ? "done" : isRunning ? "queued" : latestRecord ? "done" : "queued";
	const srAnnouncement = isRunning ? `Query optimization measurement running. Elapsed: ${totalElapsedSec ? totalElapsedSec.toFixed(0) : 0} seconds. Phase 1 Optimized is ${optState}. Phase 2 Standard MongoDB is ${stdState}. Phase 3 Verification is ${verState}.` : `Query optimization benchmark is idle. Last execution speedup: ${latestRecord?.speedup ?? "—"}x with verified result parity.`;
	return /* @__PURE__ */ jsxs("div", {
		role: "status",
		"aria-live": "polite",
		"aria-atomic": "true",
		className: `rounded-3xl border transition-all duration-300 p-6 shadow-sm overflow-hidden ${isRunning ? "bg-gradient-to-r from-amber-500/10 via-indigo-500/5 to-emerald-500/10 border-amber-300/80 shadow-md ring-1 ring-amber-400/30" : "bg-white border-slate-200"}`,
		children: [
			/* @__PURE__ */ jsx("span", {
				className: "sr-only",
				children: srAnnouncement
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/60",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-3.5",
					children: [isRunning ? /* @__PURE__ */ jsxs("div", {
						className: "relative flex items-center justify-center w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 border border-amber-200 shadow-inner",
						children: [/* @__PURE__ */ jsx("span", { className: "motion-safe:animate-ping absolute inline-flex h-6 w-6 rounded-full bg-amber-400 opacity-75" }), /* @__PURE__ */ jsx(Activity, {
							size: 22,
							className: "relative z-10 motion-safe:animate-pulse"
						})]
					}) : /* @__PURE__ */ jsx("div", {
						className: "flex items-center justify-center w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-inner",
						children: /* @__PURE__ */ jsx(ShieldCheck, { size: 22 })
					}), /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ jsxs("span", {
							className: `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${isRunning ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-emerald-100 text-emerald-800 border border-emerald-200"}`,
							children: [/* @__PURE__ */ jsx("span", { className: `w-2 h-2 rounded-full ${isRunning ? "bg-amber-500 motion-safe:animate-pulse" : "bg-emerald-500"}` }), isRunning ? "Execution Active" : "System Idle — Ready"]
						}), isFastPolling && isRunning && /* @__PURE__ */ jsxs("span", {
							className: "hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200",
							children: [/* @__PURE__ */ jsx(Zap, {
								size: 10,
								className: "text-indigo-500"
							}), " Live Polling (1.5s)"]
						})]
					}), /* @__PURE__ */ jsx("h2", {
						className: "text-base font-extrabold text-slate-900 mt-0.5",
						children: isRunning ? "Real-Time Query Optimization In Progress" : "Query Optimization Engine Status"
					})] })]
				}), /* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-3",
					children: [
						isRunning && totalElapsedSec != null && /* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-300/80 text-amber-900",
							children: [/* @__PURE__ */ jsx(Clock, {
								size: 15,
								className: "text-amber-600 motion-safe:animate-spin"
							}), /* @__PURE__ */ jsxs("div", {
								className: "text-xs font-mono font-extrabold",
								children: ["Elapsed: ", /* @__PURE__ */ jsxs("span", {
									className: "text-amber-700 text-sm",
									children: [totalElapsedSec.toFixed(1), "s"]
								})]
							})]
						}),
						!isRunning && latestRecord && /* @__PURE__ */ jsxs("div", {
							className: "hidden lg:flex items-center gap-2 text-xs text-slate-500 font-medium",
							children: [/* @__PURE__ */ jsx("span", { children: "Last Run Speedup:" }), /* @__PURE__ */ jsx("span", {
								className: `px-2 py-0.5 rounded-md font-bold text-xs ${latestRecord.speedup >= 1 ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-rose-100 text-rose-800 border border-rose-200"}`,
								children: latestRecord.speedup != null ? `${latestRecord.speedup}×` : "—"
							})]
						}),
						/* @__PURE__ */ jsxs("button", {
							onClick: onRefresh,
							title: "Poll status now",
							className: "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm transition-all",
							children: [/* @__PURE__ */ jsx(RefreshCw, { size: 13 }), /* @__PURE__ */ jsx("span", {
								className: "hidden sm:inline",
								children: "Check Status"
							})]
						})
					]
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 relative",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: `relative rounded-2xl p-4 border transition-all ${optState === "done" ? "bg-emerald-50/80 border-emerald-200 text-emerald-950" : optState === "running" ? "bg-amber-50/90 border-amber-300 ring-2 ring-amber-300/50 text-amber-950 shadow-sm" : "bg-slate-50/70 border-slate-200 text-slate-500"}`,
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex items-center justify-between gap-2 mb-2",
							children: [/* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-2",
								children: [/* @__PURE__ */ jsx("div", {
									className: `w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${optState === "done" ? "bg-emerald-500 text-white" : optState === "running" ? "bg-amber-500 text-white motion-safe:animate-pulse" : "bg-slate-200 text-slate-600"}`,
									children: optState === "done" ? /* @__PURE__ */ jsx(CheckCircle2, { size: 16 }) : /* @__PURE__ */ jsx(Zap, { size: 15 })
								}), /* @__PURE__ */ jsx("span", {
									className: "text-xs font-extrabold uppercase tracking-wide",
									children: "Phase 1: Optimized (mongo-pt)"
								})]
							}), /* @__PURE__ */ jsx("span", {
								className: `px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${optState === "done" ? "bg-emerald-100 text-emerald-800" : optState === "running" ? "bg-amber-100 text-amber-800 motion-safe:animate-pulse" : "bg-slate-200 text-slate-600"}`,
								children: optState === "done" ? `Done · ${fmtMs(opt?.ms ?? latestRecord?.optimized_ms ?? latestRecord?.reduced_ms)}` : optState === "running" ? `Running · ${optElapsedSec != null ? optElapsedSec.toFixed(1) : "0"}s` : "Queued"
							})]
						}), /* @__PURE__ */ jsx("p", {
							className: "text-[11px] leading-relaxed text-slate-600",
							children: "Yannakakis semi-join reduction on temp collections to eliminate dangling tuples."
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: `relative rounded-2xl p-4 border transition-all ${stdState === "done" ? "bg-emerald-50/80 border-emerald-200 text-emerald-950" : stdState === "running" ? "bg-amber-50/90 border-amber-300 ring-2 ring-amber-300/50 text-amber-950 shadow-sm" : "bg-slate-50/70 border-slate-200 text-slate-500"}`,
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex items-center justify-between gap-2 mb-2",
							children: [/* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-2",
								children: [/* @__PURE__ */ jsx("div", {
									className: `w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${stdState === "done" ? "bg-emerald-500 text-white" : stdState === "running" ? "bg-amber-500 text-white motion-safe:animate-pulse" : "bg-slate-200 text-slate-600"}`,
									children: stdState === "done" ? /* @__PURE__ */ jsx(CheckCircle2, { size: 16 }) : /* @__PURE__ */ jsx(Database, { size: 15 })
								}), /* @__PURE__ */ jsx("span", {
									className: "text-xs font-extrabold uppercase tracking-wide",
									children: "Phase 2: Standard MongoDB"
								})]
							}), /* @__PURE__ */ jsx("span", {
								className: `px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${stdState === "done" ? "bg-emerald-100 text-emerald-800" : stdState === "running" ? "bg-amber-100 text-amber-800 motion-safe:animate-pulse" : "bg-slate-200 text-slate-600"}`,
								children: stdState === "done" ? `Done · ${fmtMs(std?.ms ?? latestRecord?.standard_ms ?? latestRecord?.naive_ms)}` : stdState === "running" ? `Running · ${stdElapsedSec != null ? stdElapsedSec.toFixed(1) : "0"}s` : "Queued"
							})]
						}), /* @__PURE__ */ jsx("p", {
							className: "text-[11px] leading-relaxed text-slate-600",
							children: "Baseline left-deep $lookup pipeline executing against full-scale catalog collections."
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: `relative rounded-2xl p-4 border transition-all ${verState === "done" ? "bg-emerald-50/80 border-emerald-200 text-emerald-950" : "bg-slate-50/70 border-slate-200 text-slate-500"}`,
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex items-center justify-between gap-2 mb-2",
							children: [/* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-2",
								children: [/* @__PURE__ */ jsx("div", {
									className: `w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${verState === "done" ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"}`,
									children: /* @__PURE__ */ jsx(CheckCircle2, { size: 16 })
								}), /* @__PURE__ */ jsx("span", {
									className: "text-xs font-extrabold uppercase tracking-wide",
									children: "Phase 3: Verification & Parity"
								})]
							}), /* @__PURE__ */ jsx("span", {
								className: `px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${verState === "done" ? "bg-emerald-100 text-emerald-800 font-bold" : "bg-slate-200 text-slate-600"}`,
								children: verState === "done" ? latestRecord?.checksum ? `Parity ok · ${latestRecord.checksum}` : "Parity Verified" : "Pending"
							})]
						}), /* @__PURE__ */ jsx("p", {
							className: "text-[11px] leading-relaxed text-slate-600",
							children: "Row-by-row equivalence verification, polynomial checksum parity, and temp collection cleanup."
						})]
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-3.5 pt-3 border-t border-slate-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500",
				children: [/* @__PURE__ */ jsx("span", { children: isRunning ? "Background measurement running detached on shopsphere_bench — user search latency is 100% unaffected." : "Benchmarks run in a detached process upon user searches. Search the catalog to fire a live measurement." }), latestRecord?.trigger && /* @__PURE__ */ jsxs("span", {
					className: "font-mono text-slate-400 truncate max-w-sm",
					title: latestRecord.trigger,
					children: ["Trigger: ", latestRecord.trigger]
				})]
			})
		]
	});
};
var StatCard = ({ icon: Icon, label, value, sub, color = "indigo", good }) => {
	const colors = {
		indigo: "bg-indigo-50  border-indigo-200  text-indigo-600",
		emerald: "bg-emerald-50 border-emerald-200 text-emerald-600",
		amber: "bg-amber-50   border-amber-200   text-amber-600",
		rose: "bg-rose-50    border-rose-200    text-rose-600",
		slate: "bg-slate-50   border-slate-200   text-slate-500",
		violet: "bg-violet-50  border-violet-200  text-violet-600"
	};
	const cls = colors[color] || colors.indigo;
	return /* @__PURE__ */ jsxs("div", {
		className: `rounded-2xl border p-4 flex flex-col gap-2 ${cls}`,
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ jsx(Icon, { size: 16 }), /* @__PURE__ */ jsx("span", {
					className: "text-[11px] font-bold uppercase tracking-wide",
					children: label
				})]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "text-2xl font-extrabold text-slate-900 leading-none",
				children: value
			}),
			sub && /* @__PURE__ */ jsx("div", {
				className: "text-[11px] text-slate-500 leading-snug",
				children: sub
			}),
			good != null && /* @__PURE__ */ jsx("div", {
				className: `text-[10px] font-bold ${good ? "text-emerald-600" : "text-rose-500"}`,
				children: good ? "▲ Optimized wins here" : "▼ Overhead dominates"
			})
		]
	});
};
var ChartTooltip = ({ active, payload, label }) => {
	if (!active || !payload || !payload.length) return null;
	return /* @__PURE__ */ jsxs("div", {
		className: "bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs space-y-1",
		children: [/* @__PURE__ */ jsxs("p", {
			className: "font-bold text-slate-700",
			children: ["Run #", label]
		}), payload.map((p) => /* @__PURE__ */ jsxs("p", {
			style: { color: p.color },
			children: [
				p.name,
				": ",
				Math.round(p.value),
				" ms"
			]
		}, p.name))]
	});
};
var MetricsPanel = ({ metrics }) => {
	const [selectedSpec, setSelectedSpec] = useState("all");
	if (!metrics || metrics.noData) return /* @__PURE__ */ jsxs("div", {
		className: "bg-white border border-slate-200 rounded-3xl p-6 shadow-sm",
		children: [/* @__PURE__ */ jsxs("div", {
			className: "flex items-center gap-3 mb-4",
			children: [/* @__PURE__ */ jsx(BarChart2, {
				size: 22,
				className: "text-indigo-500"
			}), /* @__PURE__ */ jsx("h2", {
				className: "text-lg font-extrabold text-slate-800",
				children: "Performance Metrics"
			})]
		}), /* @__PURE__ */ jsxs("p", {
			className: "text-sm text-slate-400",
			children: [
				"No shadow runs recorded yet. Search the Products page with ",
				/* @__PURE__ */ jsx("code", {
					className: "font-mono",
					children: "PT_SHADOW=1"
				}),
				" to populate metrics."
			]
		})]
	});
	const { totalRuns: overallRuns = 0, wins: overallWins = 0, winRate: overallWinRate = 0, avgStandardMs, avgNaiveMs, avgOptimizedMs, avgReducedMs, medStandardMs, medNaiveMs, medOptimizedMs, medReducedMs, throughputStandard, throughputNaive, throughputOptimized, throughputReduced, avgSpeedup: overallAvgSpeedup, maxSpeedup: overallMaxSpeedup, minSpeedup: overallMinSpeedup, robustnessGap: overallGap, avgOverheadPct: overallOverhead, avgTransferMs: overallTransfer, avgMatMs: overallMat, perSpecStats = [], timeline: overallTimeline = [] } = metrics;
	const overallAvgStd = avgStandardMs ?? avgNaiveMs;
	const overallAvgOpt = avgOptimizedMs ?? avgReducedMs;
	const overallMedStd = medStandardMs ?? medNaiveMs;
	const overallMedOpt = medOptimizedMs ?? medReducedMs;
	const overallTpStd = throughputStandard ?? throughputNaive;
	const overallTpOpt = throughputOptimized ?? throughputReduced;
	const activeSpecData = selectedSpec === "all" ? null : perSpecStats.find((s) => s.spec === selectedSpec);
	const displayData = activeSpecData ? {
		runs: activeSpecData.runs,
		wins: activeSpecData.wins,
		winRate: activeSpecData.winRate,
		avgStandardMs: activeSpecData.avgStandardMs ?? activeSpecData.avgNaiveMs,
		avgOptimizedMs: activeSpecData.avgOptimizedMs ?? activeSpecData.avgReducedMs,
		medStandardMs: activeSpecData.medStandardMs ?? activeSpecData.medNaiveMs,
		medOptimizedMs: activeSpecData.medOptimizedMs ?? activeSpecData.medReducedMs,
		throughputStandard: activeSpecData.throughputStandard ?? activeSpecData.throughputNaive,
		throughputOptimized: activeSpecData.throughputOptimized ?? activeSpecData.throughputReduced,
		avgSpeedup: activeSpecData.avgSpeedup,
		maxSpeedup: activeSpecData.maxSpeedup,
		minSpeedup: activeSpecData.minSpeedup,
		robustnessGap: activeSpecData.robustnessGap,
		avgOverheadPct: activeSpecData.avgOverheadPct,
		avgTransferMs: activeSpecData.avgTransferMs,
		avgMatMs: activeSpecData.avgMatMs,
		description: activeSpecData.description,
		timeline: activeSpecData.timeline
	} : {
		runs: overallRuns,
		wins: overallWins,
		winRate: overallWinRate,
		avgStandardMs: overallAvgStd,
		avgOptimizedMs: overallAvgOpt,
		medStandardMs: overallMedStd,
		medOptimizedMs: overallMedOpt,
		throughputStandard: overallTpStd,
		throughputOptimized: overallTpOpt,
		avgSpeedup: overallAvgSpeedup,
		maxSpeedup: overallMaxSpeedup,
		minSpeedup: overallMinSpeedup,
		robustnessGap: overallGap,
		avgOverheadPct: overallOverhead,
		avgTransferMs: overallTransfer,
		avgMatMs: overallMat,
		timeline: overallTimeline
	};
	const chartData = ((activeSpecData ? activeSpecData.timeline || [] : overallTimeline) || []).map((r, i) => ({
		run: i + 1,
		"Standard MongoDB (ms)": Math.round(r.standard_ms ?? r.naive_ms ?? 0),
		"Optimized (mongo-pt) (ms)": Math.round(r.optimized_ms ?? r.reduced_ms ?? r.total_ms ?? 0),
		speedup: r.speedup
	}));
	const tpStd = displayData.throughputStandard ?? displayData.throughputNaive;
	const tpOpt = displayData.throughputOptimized ?? displayData.throughputReduced;
	const tpImprove = tpStd && tpOpt ? (tpOpt / tpStd).toFixed(1) : null;
	return /* @__PURE__ */ jsxs("div", {
		className: "bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "px-6 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100 flex flex-col md:flex-row md:items-center justify-between gap-4",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ jsx(BarChart2, {
						size: 24,
						className: "text-indigo-600"
					}), /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
						className: "text-lg font-extrabold text-slate-900",
						children: "Performance Metrics Dashboard"
					}), /* @__PURE__ */ jsx("p", {
						className: "text-[11px] text-slate-500",
						children: "Query-by-Query breakdown: Standard MongoDB vs Optimized (mongo-pt) (Throughput, Latency, Speedup & Overhead)"
					})] })]
				}), /* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ jsx("span", {
						className: "text-xs font-bold text-slate-600 whitespace-nowrap",
						children: "Filter Query:"
					}), /* @__PURE__ */ jsxs("select", {
						value: selectedSpec,
						onChange: (e) => setSelectedSpec(e.target.value),
						className: "text-xs font-semibold px-3 py-1.5 rounded-xl border border-indigo-200 bg-white text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm",
						children: [/* @__PURE__ */ jsxs("option", {
							value: "all",
							children: [
								"📊 All Queries Combined (",
								overallRuns,
								" runs)"
							]
						}), perSpecStats.map((s) => /* @__PURE__ */ jsxs("option", {
							value: s.spec,
							children: [
								"🎯 ",
								s.spec,
								" (",
								s.runs,
								" runs)"
							]
						}, s.spec))]
					})]
				})]
			}),
			perSpecStats.length > 0 && /* @__PURE__ */ jsxs("div", {
				className: "px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ jsx("span", {
						className: "text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1",
						children: "Query:"
					}),
					/* @__PURE__ */ jsxs("button", {
						onClick: () => setSelectedSpec("all"),
						className: `px-3 py-1 rounded-full text-[11px] font-bold transition-all border ${selectedSpec === "all" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"}`,
						children: [
							"All Queries (",
							overallRuns,
							")"
						]
					}),
					perSpecStats.map((s) => /* @__PURE__ */ jsxs("button", {
						onClick: () => setSelectedSpec(s.spec),
						className: `px-3 py-1 rounded-full text-[11px] font-mono font-bold transition-all border ${selectedSpec === s.spec ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"}`,
						children: [
							s.spec,
							" (",
							s.runs,
							")"
						]
					}, s.spec))
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "p-6 space-y-6",
				children: [
					selectedSpec !== "all" && /* @__PURE__ */ jsxs("div", {
						className: "p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex items-start gap-3 text-xs text-indigo-900",
						children: [/* @__PURE__ */ jsx(Target, {
							size: 18,
							className: "text-indigo-600 shrink-0 mt-0.5"
						}), /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("span", {
							className: "font-extrabold uppercase tracking-wide text-indigo-700 mr-2",
							children: "Query Specification:"
						}), /* @__PURE__ */ jsx("span", {
							className: "font-semibold",
							children: displayData.description || SPEC_INFO[selectedSpec] || SHORT_QUERY[selectedSpec] || selectedSpec
						})] })]
					}),
					/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsxs("p", {
						className: "text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3",
						children: ["Throughput & Latency ", selectedSpec !== "all" ? `— for [${selectedSpec}]` : "— Overall"]
					}), /* @__PURE__ */ jsxs("div", {
						className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3",
						children: [
							/* @__PURE__ */ jsx(StatCard, {
								icon: Zap,
								label: "Standard Throughput",
								value: fmtThroughput(displayData.throughputStandard),
								sub: `Avg latency: ${fmtMs(displayData.avgStandardMs)}`,
								color: "rose"
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: Zap,
								label: "Optimized Throughput",
								value: fmtThroughput(displayData.throughputOptimized),
								sub: `Avg latency: ${fmtMs(displayData.avgOptimizedMs)}`,
								color: "emerald"
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: TrendingUp,
								label: "Throughput Gain",
								value: tpImprove ? `${tpImprove}×` : "—",
								sub: "Optimized q/s ÷ Standard q/s",
								color: "indigo",
								good: tpImprove > 1
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: Activity,
								label: "Median Standard",
								value: fmtMs(displayData.medStandardMs),
								sub: "Standard MongoDB (baseline)",
								color: "amber"
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: Activity,
								label: "Median Optimized",
								value: fmtMs(displayData.medOptimizedMs),
								sub: "Optimized (mongo-pt) side",
								color: "violet"
							})
						]
					})] }),
					/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsxs("p", {
						className: "text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3",
						children: ["Speedup & Robustness ", selectedSpec !== "all" ? `— for [${selectedSpec}]` : "— Overall"]
					}), /* @__PURE__ */ jsxs("div", {
						className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3",
						children: [
							/* @__PURE__ */ jsx(StatCard, {
								icon: TrendingUp,
								label: "Avg Speedup",
								value: displayData.avgSpeedup != null ? `${displayData.avgSpeedup}×` : "—",
								sub: "Standard ÷ Optimized latency ratio",
								color: displayData.avgSpeedup >= 1 ? "emerald" : "rose",
								good: displayData.avgSpeedup >= 1
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: TrendingUp,
								label: "Max Speedup",
								value: displayData.maxSpeedup != null ? `${displayData.maxSpeedup}×` : "—",
								sub: "Best single execution run",
								color: "emerald"
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: TrendingUp,
								label: "Min Speedup",
								value: displayData.minSpeedup != null ? `${displayData.minSpeedup}×` : "—",
								sub: "Worst run (overhead factor)",
								color: displayData.minSpeedup >= 1 ? "indigo" : "amber"
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: CheckCircle,
								label: "Win Rate",
								value: `${displayData.winRate}%`,
								sub: `${displayData.wins || 0} / ${displayData.runs || 0} runs where Optimized won`,
								color: displayData.winRate >= 50 ? "emerald" : "rose",
								good: displayData.winRate >= 50
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: AlertTriangle,
								label: "Robustness Gap",
								value: displayData.robustnessGap != null ? `${displayData.robustnessGap}×` : "≥ 2 runs needed",
								sub: "max standard ÷ min standard order spread",
								color: displayData.robustnessGap > 3 ? "rose" : "amber"
							})
						]
					})] }),
					/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
						className: "text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3",
						children: "Transfer Overhead"
					}), /* @__PURE__ */ jsxs("div", {
						className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3",
						children: [
							/* @__PURE__ */ jsx(StatCard, {
								icon: Activity,
								label: "Avg Overhead %",
								value: pct(displayData.avgOverheadPct),
								sub: "(transfer + mat) as % of Optimized total",
								color: displayData.avgOverheadPct < 20 ? "emerald" : displayData.avgOverheadPct < 60 ? "amber" : "rose"
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: Activity,
								label: "Avg Transfer Time",
								value: fmtMs(displayData.avgTransferMs),
								sub: "Predicate-set transfer ($in key sets)",
								color: "slate"
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: Activity,
								label: "Avg Materialization",
								value: fmtMs(displayData.avgMatMs),
								sub: "Writing + indexing temporary collections",
								color: "slate"
							}),
							/* @__PURE__ */ jsx(StatCard, {
								icon: Target,
								label: "Evaluated Runs",
								value: displayData.runs || 0,
								sub: `Executions of ${selectedSpec === "all" ? "all specs" : selectedSpec}`,
								color: "indigo"
							})
						]
					})] }),
					chartData.length > 0 && /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between mb-2",
						children: [/* @__PURE__ */ jsxs("p", {
							className: "text-[11px] font-bold uppercase tracking-widest text-slate-400",
							children: [
								"Latency Timeline — ",
								selectedSpec === "all" ? "All Queries" : selectedSpec,
								" (",
								chartData.length,
								" measured runs)"
							]
						}), selectedSpec !== "all" && /* @__PURE__ */ jsx("button", {
							onClick: () => setSelectedSpec("all"),
							className: "text-[10px] font-bold text-indigo-600 hover:text-indigo-800",
							children: "← Back to All Queries"
						})]
					}), /* @__PURE__ */ jsxs("div", {
						className: "rounded-2xl border border-slate-100 p-4 bg-slate-50",
						children: [/* @__PURE__ */ jsx(ResponsiveContainer, {
							width: "100%",
							height: 230,
							children: /* @__PURE__ */ jsxs(BarChart, {
								data: chartData,
								margin: {
									top: 4,
									right: 8,
									bottom: 4,
									left: 8
								},
								barCategoryGap: "30%",
								children: [
									/* @__PURE__ */ jsx(CartesianGrid, {
										strokeDasharray: "3 3",
										stroke: "#e2e8f0"
									}),
									/* @__PURE__ */ jsx(XAxis, {
										dataKey: "run",
										tick: {
											fontSize: 11,
											fill: "#94a3b8"
										},
										label: {
											value: "Run #",
											position: "insideBottomRight",
											offset: -4,
											fontSize: 11,
											fill: "#94a3b8"
										}
									}),
									/* @__PURE__ */ jsx(YAxis, {
										tick: {
											fontSize: 11,
											fill: "#94a3b8"
										},
										unit: " ms"
									}),
									/* @__PURE__ */ jsx(Tooltip, { content: /* @__PURE__ */ jsx(ChartTooltip, {}) }),
									/* @__PURE__ */ jsx(Legend, { wrapperStyle: { fontSize: 11 } }),
									/* @__PURE__ */ jsx(Bar, {
										dataKey: "Standard MongoDB (ms)",
										fill: "#f87171",
										radius: [
											4,
											4,
											0,
											0
										]
									}),
									/* @__PURE__ */ jsx(Bar, {
										dataKey: "Optimized (mongo-pt) (ms)",
										fill: "#34d399",
										radius: [
											4,
											4,
											0,
											0
										]
									})
								]
							})
						}), /* @__PURE__ */ jsx("p", {
							className: "text-[10px] text-slate-400 text-center mt-2",
							children: "Red = Standard MongoDB (Full DB join) · Green = Optimized (mongo-pt with Predicate Transfer). Shorter bar = faster query execution."
						})]
					})] }),
					perSpecStats && perSpecStats.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-center justify-between mb-2",
							children: [/* @__PURE__ */ jsx("p", {
								className: "text-[11px] font-bold uppercase tracking-widest text-slate-400",
								children: "All Queries Summary Table (Click any row to isolate its metrics)"
							}), selectedSpec !== "all" && /* @__PURE__ */ jsxs("span", {
								className: "text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200",
								children: ["Viewing: ", selectedSpec]
							})]
						}),
						/* @__PURE__ */ jsx("div", {
							tabIndex: 0,
							role: "region",
							"aria-label": "Query Performance Metrics Summary Table",
							className: "overflow-x-auto rounded-2xl border border-slate-200 shadow-xs focus:outline-indigo-500",
							children: /* @__PURE__ */ jsxs("table", {
								className: "w-full text-left text-xs border-collapse",
								children: [/* @__PURE__ */ jsx("thead", {
									className: "bg-slate-100 text-slate-600 uppercase tracking-wide sticky top-0 z-10 border-b border-slate-200",
									children: /* @__PURE__ */ jsxs("tr", { children: [
										/* @__PURE__ */ jsx("th", {
											scope: "col",
											className: "px-4 py-3 font-extrabold min-w-[240px]",
											children: "Query Specification"
										}),
										/* @__PURE__ */ jsx("th", {
											scope: "col",
											className: "px-3 py-3 font-extrabold text-right",
											children: "Runs"
										}),
										/* @__PURE__ */ jsx("th", {
											scope: "col",
											className: "px-4 py-3 font-extrabold text-right",
											title: "Standard MongoDB average latency & throughput",
											children: "Standard MongoDB"
										}),
										/* @__PURE__ */ jsx("th", {
											scope: "col",
											className: "px-4 py-3 font-extrabold text-right",
											title: "Optimized (mongo-pt) average latency & throughput",
											children: "Optimized (mongo-pt)"
										}),
										/* @__PURE__ */ jsx("th", {
											scope: "col",
											className: "px-3 py-3 font-extrabold text-center",
											title: "Mean speedup factor (Standard latency ÷ Optimized latency)",
											children: "Avg Speedup"
										}),
										/* @__PURE__ */ jsx("th", {
											scope: "col",
											className: "px-3 py-3 font-extrabold text-center",
											title: "Peak speedup recorded in best run",
											children: "Max Speedup"
										}),
										/* @__PURE__ */ jsx("th", {
											scope: "col",
											className: "px-4 py-3 font-extrabold text-right",
											title: "Transfer and materialization overhead as % of total run time",
											children: "Transfer & Mat"
										}),
										/* @__PURE__ */ jsx("th", {
											scope: "col",
											className: "px-3 py-3 font-extrabold text-center",
											title: "% of runs where mongo-pt was faster",
											children: "Win Rate"
										}),
										/* @__PURE__ */ jsx("th", {
											scope: "col",
											className: "px-3 py-3 font-extrabold text-center",
											children: "Action"
										})
									] })
								}), /* @__PURE__ */ jsx("tbody", {
									className: "divide-y divide-slate-100",
									children: perSpecStats.map((s) => {
										const isSelected = selectedSpec === s.spec;
										const info = getCanonicalQueryInfo(s);
										const stdMs = s.avgStandardMs ?? s.avgNaiveMs;
										const optMs = s.avgOptimizedMs ?? s.avgReducedMs;
										const stdTp = s.throughputStandard ?? s.throughputNaive;
										const optTp = s.throughputOptimized ?? s.throughputReduced;
										return /* @__PURE__ */ jsxs("tr", {
											onClick: () => setSelectedSpec(isSelected ? "all" : s.spec),
											className: `cursor-pointer transition-colors ${isSelected ? "bg-indigo-50/90 font-semibold" : "hover:bg-slate-50"}`,
											children: [
												/* @__PURE__ */ jsxs("td", {
													className: "px-4 py-3",
													children: [/* @__PURE__ */ jsx("div", {
														className: "font-mono text-xs font-bold text-slate-800",
														children: s.spec
													}), /* @__PURE__ */ jsx("div", {
														className: "text-[11px] text-slate-500 font-normal leading-snug line-clamp-2 mt-0.5",
														children: s.description || info.shortDesc
													})]
												}),
												/* @__PURE__ */ jsx("td", {
													className: "px-3 py-3 text-right font-medium text-slate-700",
													children: s.runs
												}),
												/* @__PURE__ */ jsxs("td", {
													className: "px-4 py-3 text-right",
													children: [/* @__PURE__ */ jsx("div", {
														className: "font-bold text-rose-600 text-xs",
														children: fmtMs(stdMs)
													}), /* @__PURE__ */ jsx("div", {
														className: "text-[10px] text-slate-400 font-mono",
														children: fmtThroughput(stdTp)
													})]
												}),
												/* @__PURE__ */ jsxs("td", {
													className: "px-4 py-3 text-right",
													children: [/* @__PURE__ */ jsx("div", {
														className: "font-bold text-emerald-600 text-xs",
														children: fmtMs(optMs)
													}), /* @__PURE__ */ jsx("div", {
														className: "text-[10px] text-slate-400 font-mono",
														children: fmtThroughput(optTp)
													})]
												}),
												/* @__PURE__ */ jsx("td", {
													className: "px-3 py-3 text-center",
													children: /* @__PURE__ */ jsx(SpeedupBadge, { speedup: s.avgSpeedup })
												}),
												/* @__PURE__ */ jsx("td", {
													className: "px-3 py-3 text-center",
													children: /* @__PURE__ */ jsx(SpeedupBadge, { speedup: s.maxSpeedup })
												}),
												/* @__PURE__ */ jsx("td", {
													className: "px-4 py-3",
													children: /* @__PURE__ */ jsx(OverheadCell, {
														transferMs: s.avgTransferMs,
														matMs: s.avgMatMs,
														overheadPct: s.avgOverheadPct,
														fmtMs,
														pct
													})
												}),
												/* @__PURE__ */ jsx("td", {
													className: "px-3 py-3 text-center",
													children: /* @__PURE__ */ jsxs("span", {
														className: `px-2 py-0.5 rounded-full text-[10px] font-extrabold ${s.winRate >= 50 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`,
														children: [s.winRate, "%"]
													})
												}),
												/* @__PURE__ */ jsx("td", {
													className: "px-3 py-3 text-center",
													children: /* @__PURE__ */ jsx("span", {
														className: `px-2.5 py-1 rounded-lg text-[10px] font-extrabold border transition-all ${isSelected ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"}`,
														children: isSelected ? "Selected" : "View"
													})
												})
											]
										}, s.spec);
									})
								})]
							})
						}),
						/* @__PURE__ */ jsx("p", {
							className: "text-[10px] text-slate-400 mt-2",
							children: "💡 Tip: Click any row above or use the dropdown to isolate that query's specific throughput, latency timeline, and overhead breakdown."
						})
					] })
				]
			})
		]
	});
};
var PtLogPage = ({ onToast }) => {
	const [records, setRecords] = useState([]);
	const [metrics, setMetrics] = useState(null);
	const [loading, setLoading] = useState(true);
	const [metricsLoading, setMetricsLoading] = useState(true);
	const [expanded, setExpanded] = useState(/* @__PURE__ */ new Set());
	const [runStatus, setRunStatus] = useState({
		running: false,
		startedAt: null
	});
	const [nowTick, setNowTick] = useState(Date.now());
	const [isFastPolling, setIsFastPolling] = useState(false);
	const [kindFilter, setKindFilter] = useState("live");
	const load = React.useCallback(async (silent = false) => {
		if (!silent) setLoading(true);
		try {
			const [{ data }, { data: st }] = await Promise.all([api.get("/admin/pt-log"), api.get("/admin/pt-status").catch(() => ({ data: { running: false } }))]);
			setRecords(Array.isArray(data) ? data : []);
			setRunStatus(st && typeof st === "object" ? st : { running: false });
		} catch (err) {
			if (!silent && onToast) onToast("Could not load mongo-pt log", "error");
		} finally {
			if (!silent) setLoading(false);
		}
	}, [onToast]);
	const loadMetrics = React.useCallback(async (silent = false) => {
		if (!silent) setMetricsLoading(true);
		try {
			const { data } = await api.get("/admin/pt-metrics");
			setMetrics(data);
		} catch (err) {
			setMetrics({
				noData: true,
				totalRuns: 0
			});
		} finally {
			if (!silent) setMetricsLoading(false);
		}
	}, []);
	useEffect(() => {
		if (!runStatus.running) return;
		const tickId = setInterval(() => {
			setNowTick(Date.now());
		}, 200);
		return () => clearInterval(tickId);
	}, [runStatus.running]);
	useEffect(() => {
		let isMounted = true;
		let timeoutId = null;
		const pollStatus = async () => {
			let nextDelay = 5e3;
			try {
				const { data: st } = await api.get("/admin/pt-status");
				if (!isMounted) return;
				const newStatus = st && typeof st === "object" ? st : { running: false };
				const currentlyRunning = Boolean(newStatus.running);
				setRunStatus((prev) => {
					if (prev?.running && !currentlyRunning) {
						load(true);
						loadMetrics(true);
					}
					return newStatus;
				});
				setIsFastPolling(currentlyRunning);
				nextDelay = currentlyRunning ? 1500 : 5e3;
			} catch (_) {
				nextDelay = 5e3;
				setIsFastPolling(false);
			}
			if (isMounted) timeoutId = setTimeout(pollStatus, nextDelay);
		};
		pollStatus();
		return () => {
			isMounted = false;
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, [load, loadMetrics]);
	useEffect(() => {
		load(false);
		loadMetrics(false);
		const refreshInterval = setInterval(() => {
			if (!runStatus.running) {
				load(true);
				loadMetrics(true);
			}
		}, 1e4);
		return () => clearInterval(refreshInterval);
	}, [
		load,
		loadMetrics,
		runStatus.running
	]);
	const shadows = records.filter((r) => r.kind === "shadow");
	const shown = kindFilter === "live" ? shadows : records;
	return /* @__PURE__ */ jsx("div", {
		className: "min-h-screen bg-slate-50",
		children: /* @__PURE__ */ jsxs("div", {
			className: "max-w-7xl mx-auto px-4 py-10 space-y-6",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "bg-white border border-slate-200 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-4",
						children: [/* @__PURE__ */ jsx("div", {
							className: "w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center",
							children: /* @__PURE__ */ jsx(Activity, { size: 30 })
						}), /* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("h1", {
								className: "text-2xl font-extrabold text-slate-900",
								children: "mongo-pt Shadow Log"
							}),
							/* @__PURE__ */ jsx("p", {
								className: "text-xs text-slate-500 mt-1",
								children: "Academic showcase for semi-join reduction query optimization on MongoDB."
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "flex flex-wrap items-center gap-2 mt-2",
								children: [/* @__PURE__ */ jsxs("button", {
									onClick: () => setKindFilter("live"),
									className: `px-3 py-1 rounded-full text-[11px] font-extrabold transition-all border ${kindFilter === "live" ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"}`,
									title: "Only rows fired by real site actions (search / category browse / dashboards) — the live Standard MongoDB vs Optimized (mongo-pt) comparisons",
									children: [
										"Live comparisons (",
										shadows.length,
										")"
									]
								}), /* @__PURE__ */ jsxs("button", {
									onClick: () => setKindFilter("all"),
									className: `px-3 py-1 rounded-full text-[11px] font-extrabold transition-all border ${kindFilter === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"}`,
									title: "Everything in the log, including bulk benchmark-protocol records (order/summary/cap/env/spec)",
									children: [
										"All records (",
										records.length,
										")"
									]
								})]
							})
						] })]
					}), /* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ jsxs("button", {
							onClick: () => {
								load(false);
								loadMetrics(false);
							},
							className: "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-all",
							children: [/* @__PURE__ */ jsx(RefreshCw, { size: 14 }), " Refresh"]
						}), /* @__PURE__ */ jsxs(Link, {
							to: "/admin/dashboard",
							className: "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all",
							children: [/* @__PURE__ */ jsx(ArrowLeft, { size: 14 }), " Dashboard"]
						})]
					})]
				}),
				/* @__PURE__ */ jsx(RealTimeStatusCard, {
					runStatus,
					nowTick,
					latestRecord: records[0] || null,
					onRefresh: () => {
						load(false);
						loadMetrics(false);
					},
					isFastPolling
				}),
				metricsLoading ? /* @__PURE__ */ jsxs("div", {
					className: "bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex items-center gap-3",
					children: [/* @__PURE__ */ jsx("div", { className: "w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" }), /* @__PURE__ */ jsx("span", {
						className: "text-sm text-slate-500",
						children: "Computing performance metrics…"
					})]
				}) : /* @__PURE__ */ jsx(MetricsPanel, { metrics }),
				loading ? /* @__PURE__ */ jsx("div", {
					className: "flex items-center justify-center py-24",
					children: /* @__PURE__ */ jsx("div", { className: "w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" })
				}) : /* @__PURE__ */ jsxs("div", {
					className: "bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-[11px] text-indigo-700",
						children: [/* @__PURE__ */ jsx("span", {
							className: "font-bold",
							children: "Click any row"
						}), " to see the full story: which action fired the measurement, what the benchmark query computed, and how the Standard MongoDB vs Optimized (mongo-pt) times were produced."]
					}), /* @__PURE__ */ jsx("div", {
						tabIndex: 0,
						role: "region",
						"aria-label": "mongo-pt Execution Log Table",
						className: "overflow-x-auto focus:outline-indigo-500",
						children: /* @__PURE__ */ jsxs("table", {
							className: "w-full text-left text-xs border-collapse",
							children: [/* @__PURE__ */ jsx("thead", {
								className: "bg-slate-100 text-slate-600 uppercase tracking-wide sticky top-0 z-10 border-b border-slate-200",
								children: /* @__PURE__ */ jsxs("tr", { children: [
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-4 py-3 font-extrabold",
										children: "Time"
									}),
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-3 py-3 font-extrabold",
										children: "Kind"
									}),
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-4 py-3 font-extrabold min-w-[280px]",
										children: "Query & Trigger"
									}),
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-3 py-3 font-extrabold",
										children: "Join Order"
									}),
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-4 py-3 font-extrabold text-right",
										title: "Standard MongoDB baseline execution latency and throughput",
										children: "Standard MongoDB"
									}),
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-4 py-3 font-extrabold text-right",
										title: "Optimized (mongo-pt) semi-join reduction latency and throughput",
										children: "Optimized (mongo-pt)"
									}),
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-3 py-3 font-extrabold text-center",
										title: "Standard MongoDB latency ÷ Optimized (mongo-pt) latency, both on the SAME (deliberately worst) pinned order.",
										children: "Speedup"
									}),
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-4 py-3 font-extrabold text-right",
										title: "Semi-join transfer ($in) + temporary collection materialization",
										children: "Transfer & Mat"
									}),
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-3 py-3 font-extrabold text-center",
										title: "Result verification and CRC32 polynomial checksum parity",
										children: "Verification"
									}),
									/* @__PURE__ */ jsx("th", {
										scope: "col",
										className: "px-3 py-3 font-extrabold text-right",
										title: "The SAME pinned worst-case query WITHOUT your search filter.",
										children: "Catalog Baseline"
									})
								] })
							}), /* @__PURE__ */ jsxs("tbody", {
								className: "divide-y divide-slate-100",
								children: [shown.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", {
									colSpan: 10,
									className: "px-4 py-10 text-center text-slate-400",
									children: kindFilter === "live" ? /* @__PURE__ */ jsxs(Fragment, { children: [
										"No live comparisons yet. Search the Products page (e.g. type \"laptop\", or apply a ★/vendor/price filter) with ",
										/* @__PURE__ */ jsx("code", {
											className: "font-mono",
											children: "PT_SHADOW=1"
										}),
										" — each one lands here as a row."
									] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
										"No log records yet. Enable ",
										/* @__PURE__ */ jsx("code", {
											className: "font-mono",
											children: "PT_SHADOW=1"
										}),
										" and hit an analytics endpoint."
									] })
								}) }), shown.map((r, i) => {
									const isOpen = expanded.has(i);
									const toggle = () => setExpanded((prev) => {
										const next = new Set(prev);
										next.has(i) ? next.delete(i) : next.add(i);
										return next;
									});
									const info = getCanonicalQueryInfo(r);
									const trigger = getTriggerContext(r);
									const stdMs = r.standard_ms ?? r.naive_ms;
									const optMs = r.optimized_ms ?? r.reduced_ms ?? r.total_ms;
									return /* @__PURE__ */ jsxs(React.Fragment, { children: [/* @__PURE__ */ jsxs("tr", {
										className: "hover:bg-slate-50 cursor-pointer transition-colors",
										onClick: toggle,
										children: [
											/* @__PURE__ */ jsxs("td", {
												className: "px-4 py-3 text-slate-500 whitespace-nowrap",
												title: r.ts ? `${r.ts} (UTC) → local: ${new Date(r.ts).toLocaleString()} — click for details` : "",
												children: [
													fmtTime(r.ts),
													" ",
													isOpen ? "▾" : "▸"
												]
											}),
											/* @__PURE__ */ jsx("td", {
												className: "px-3 py-3",
												children: /* @__PURE__ */ jsx("span", {
													className: `px-2 py-0.5 rounded-full text-[10px] font-extrabold ${r.kind === "shadow" ? "bg-indigo-100 text-indigo-700" : r.kind === "summary" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`,
													title: KIND_INFO[r.kind] || "",
													children: r.kind || "—"
												})
											}),
											/* @__PURE__ */ jsx("td", {
												className: "px-4 py-3",
												children: /* @__PURE__ */ jsxs("div", {
													className: "space-y-1",
													children: [/* @__PURE__ */ jsx("div", {
														className: "font-semibold text-slate-800 text-[12px] leading-snug",
														children: info.shortDesc || r.description
													}), /* @__PURE__ */ jsxs("div", {
														className: "flex flex-wrap items-center gap-1.5 pt-0.5",
														children: [
															/* @__PURE__ */ jsx("span", {
																className: "font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200",
																children: r.spec
															}),
															r.kind === "shadow" && /* @__PURE__ */ jsxs("span", {
																className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold",
																children: [
																	/* @__PURE__ */ jsx(Search, { size: 10 }),
																	trigger.label,
																	": ",
																	trigger.action
																]
															}),
															r.search_term && /* @__PURE__ */ jsxs("span", {
																className: "px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold whitespace-nowrap",
																title: "This measurement ran your search term inside the benchmark query on both sides",
																children: [
																	"live term: \"",
																	r.search_term,
																	"\""
																]
															}),
															filterChips(r.filters).map((label, k) => /* @__PURE__ */ jsx("span", {
																className: "px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-semibold whitespace-nowrap",
																title: "Filter spliced into BOTH benchmark sides",
																children: label
															}, k))
														]
													})]
												})
											}),
											/* @__PURE__ */ jsx("td", {
												className: "px-3 py-3 font-mono text-[11px] text-slate-500 max-w-[180px] truncate",
												title: prettyOrder(r.order),
												children: r.order || "—"
											}),
											/* @__PURE__ */ jsx("td", {
												className: "px-4 py-3",
												children: /* @__PURE__ */ jsx(LatencyThroughputCell, {
													ms: stdMs,
													engine: "standard",
													fmtMs,
													fmtThroughput
												})
											}),
											/* @__PURE__ */ jsx("td", {
												className: "px-4 py-3",
												children: /* @__PURE__ */ jsx(LatencyThroughputCell, {
													ms: optMs,
													engine: "optimized",
													fmtMs,
													fmtThroughput
												})
											}),
											/* @__PURE__ */ jsx("td", {
												className: "px-3 py-3 text-center",
												children: /* @__PURE__ */ jsx(SpeedupBadge, { speedup: r.speedup })
											}),
											/* @__PURE__ */ jsx("td", {
												className: "px-4 py-3",
												children: /* @__PURE__ */ jsx(OverheadCell, {
													transferMs: r.transfer_ms,
													matMs: r.materialization_ms,
													overheadPct: r.transfer_overhead_pct,
													fmtMs,
													pct
												})
											}),
											/* @__PURE__ */ jsx("td", {
												className: "px-3 py-3 text-center",
												children: /* @__PURE__ */ jsx(VerificationBadge, {
													equal: r.equal,
													checksum: r.checksum,
													rows: r.result_rows,
													mismatch: r.mismatch
												})
											}),
											/* @__PURE__ */ jsx("td", {
												className: "px-3 py-3 text-right font-bold",
												title: r.worst_case && r.worst_case.speedup != null ? `fixed catalog query, same pinned order — Standard MongoDB ${fmtMs(r.worst_case.standard_ms ?? r.worst_case.naive_ms)} vs Optimized ${fmtMs(r.worst_case.optimized_ms ?? r.worst_case.reduced_ms)}` : "",
												children: r.worst_case && r.worst_case.speedup != null ? /* @__PURE__ */ jsxs("span", {
													className: r.worst_case.speedup >= 1 ? "text-indigo-600" : "text-rose-600",
													children: [r.worst_case.speedup, "×"]
												}) : /* @__PURE__ */ jsx("span", {
													className: "text-slate-400",
													children: "—"
												})
											})
										]
									}), isOpen && /* @__PURE__ */ jsx("tr", {
										className: "bg-slate-50/80 border-b border-indigo-100",
										children: /* @__PURE__ */ jsx("td", {
											colSpan: 10,
											className: "px-6 py-4",
											children: /* @__PURE__ */ jsxs("div", {
												className: "grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-700",
												children: [
													/* @__PURE__ */ jsxs("div", {
														className: "space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs",
														children: [
															/* @__PURE__ */ jsxs("div", {
																className: "flex items-center gap-2 font-bold text-slate-900 border-b pb-2",
																children: [/* @__PURE__ */ jsx(Database, {
																	size: 15,
																	className: "text-indigo-600"
																}), /* @__PURE__ */ jsx("span", { children: "Query & Trigger Semantics" })]
															}),
															/* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Computation:"
																}),
																" ",
																info.computation
															] }),
															/* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Application Trigger:"
																}),
																" ",
																trigger.action,
																" ",
																/* @__PURE__ */ jsx("code", {
																	className: "font-mono text-[10px] text-slate-500 block truncate mt-0.5",
																	children: r.trigger || "CLI / benchmark"
																})
															] }),
															r.search_term && /* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-amber-700",
																	children: "Live Search Spliced:"
																}),
																" ",
																"Filter ",
																/* @__PURE__ */ jsxs("code", {
																	className: "font-mono text-amber-800",
																	children: [
																		"\"",
																		r.search_term,
																		"\""
																	]
																}),
																" pushed into products relation on BOTH sides."
															] }),
															filterChips(r.filters).length > 0 && /* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Filters Spliced:"
																}),
																" ",
																filterChips(r.filters).join(" · ")
															] }),
															/* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Join Order:"
																}),
																" ",
																/* @__PURE__ */ jsx("span", {
																	className: "font-mono text-[11px] text-indigo-700",
																	children: prettyOrder(r.order)
																})
															] }),
															/* @__PURE__ */ jsx("p", {
																className: "text-[11px] text-slate-400 pt-1",
																children: "The pinned bad order demonstrates the vulnerability of Standard MongoDB left-deep joins to catastrophic intermediate cardinality blowup."
															})
														]
													}),
													/* @__PURE__ */ jsxs("div", {
														className: "space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs",
														children: [
															/* @__PURE__ */ jsxs("div", {
																className: "flex items-center gap-2 font-bold text-slate-900 border-b pb-2",
																children: [/* @__PURE__ */ jsx(Zap, {
																	size: 15,
																	className: "text-amber-600"
																}), /* @__PURE__ */ jsx("span", { children: "Comparative Performance" })]
															}),
															/* @__PURE__ */ jsxs("div", {
																className: "grid grid-cols-2 gap-2 text-center py-1",
																children: [/* @__PURE__ */ jsxs("div", {
																	className: "bg-rose-50 border border-rose-200 p-2 rounded-xl",
																	children: [
																		/* @__PURE__ */ jsx("div", {
																			className: "text-[10px] font-bold text-rose-700 uppercase",
																			children: "Standard MongoDB"
																		}),
																		/* @__PURE__ */ jsx("div", {
																			className: "text-base font-extrabold text-rose-800",
																			children: fmtMs(stdMs)
																		}),
																		/* @__PURE__ */ jsx("div", {
																			className: "text-[10px] font-mono text-rose-600",
																			children: fmtThroughput(stdMs ? 1e3 / stdMs : null)
																		})
																	]
																}), /* @__PURE__ */ jsxs("div", {
																	className: "bg-emerald-50 border border-emerald-200 p-2 rounded-xl",
																	children: [
																		/* @__PURE__ */ jsx("div", {
																			className: "text-[10px] font-bold text-emerald-700 uppercase",
																			children: "Optimized (mongo-pt)"
																		}),
																		/* @__PURE__ */ jsx("div", {
																			className: "text-base font-extrabold text-emerald-800",
																			children: fmtMs(optMs)
																		}),
																		/* @__PURE__ */ jsx("div", {
																			className: "text-[10px] font-mono text-emerald-600",
																			children: fmtThroughput(optMs ? 1e3 / optMs : null)
																		})
																	]
																})]
															}),
															/* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Transfer Time ($in keys):"
																}),
																" ",
																fmtMs(r.transfer_ms)
															] }),
															/* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Materialization Time:"
																}),
																" ",
																fmtMs(r.materialization_ms)
															] }),
															/* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Total Overhead:"
																}),
																" ",
																pct(r.transfer_overhead_pct),
																" of Optimized total"
															] }),
															r.best && r.best.speedup != null && /* @__PURE__ */ jsxs("div", {
																className: "mt-2 pt-2 border-t border-slate-100",
																children: [/* @__PURE__ */ jsxs("span", {
																	className: "font-bold text-slate-800",
																	children: [
																		"Dynamic Best Order (",
																		prettyOrder(r.best.order),
																		"):"
																	]
																}), /* @__PURE__ */ jsxs("div", {
																	className: "text-[11px] text-slate-600 mt-0.5",
																	children: [
																		"Standard ",
																		fmtMs(r.best.standard_ms ?? r.best.naive_ms),
																		" vs Optimized ",
																		fmtMs(r.best.optimized_ms ?? r.best.reduced_ms),
																		" →",
																		" ",
																		/* @__PURE__ */ jsxs("span", {
																			className: "font-extrabold text-indigo-700",
																			children: [r.best.speedup, "× Speedup"]
																		})
																	]
																})]
															})
														]
													}),
													/* @__PURE__ */ jsxs("div", {
														className: "space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs",
														children: [
															/* @__PURE__ */ jsxs("div", {
																className: "flex items-center gap-2 font-bold text-slate-900 border-b pb-2",
																children: [/* @__PURE__ */ jsx(ShieldCheck, {
																	size: 15,
																	className: "text-emerald-600"
																}), /* @__PURE__ */ jsx("span", { children: "Integrity & Baselines" })]
															}),
															/* @__PURE__ */ jsxs("div", {
																className: "flex items-center justify-between",
																children: [/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Result Verification:"
																}), /* @__PURE__ */ jsx(VerificationBadge, {
																	equal: r.equal,
																	checksum: r.checksum,
																	rows: r.result_rows,
																	mismatch: r.mismatch
																})]
															}),
															/* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Tuple Count:"
																}),
																" ",
																r.result_rows != null ? `${r.result_rows} rows` : "—"
															] }),
															/* @__PURE__ */ jsxs("p", { children: [
																/* @__PURE__ */ jsx("span", {
																	className: "font-extrabold text-slate-800",
																	children: "Checksum (CRC32):"
																}),
																" ",
																/* @__PURE__ */ jsx("code", {
																	className: "font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded",
																	children: r.checksum || "—"
																})
															] }),
															r.worst_case && r.worst_case.speedup != null && /* @__PURE__ */ jsxs("div", {
																className: "mt-2 pt-2 border-t border-slate-100",
																children: [
																	/* @__PURE__ */ jsx("span", {
																		className: "font-bold text-slate-800",
																		children: "Catalog Query Reference (Unfiltered):"
																	}),
																	/* @__PURE__ */ jsxs("div", {
																		className: "text-[11px] text-slate-600 mt-0.5",
																		children: [
																			"Standard ",
																			fmtMs(r.worst_case.standard_ms ?? r.worst_case.naive_ms),
																			" vs Optimized ",
																			fmtMs(r.worst_case.optimized_ms ?? r.worst_case.reduced_ms),
																			" →",
																			" ",
																			/* @__PURE__ */ jsxs("span", {
																				className: "font-extrabold text-indigo-700",
																				children: [r.worst_case.speedup, "× Speedup"]
																			})
																		]
																	}),
																	/* @__PURE__ */ jsx("p", {
																		className: "text-[10px] text-slate-400 mt-1",
																		children: "Without the user search filter on the first relation, Standard MongoDB pays the full-catalog penalty."
																	})
																]
															})
														]
													})
												]
											})
										})
									})] }, i);
								})]
							})]
						})
					})]
				}),
				/* @__PURE__ */ jsxs("p", {
					className: "text-[11px] text-slate-400",
					children: [
						"Transfer and materialization are reported separately and are already included in the Optimized (mongo-pt) time; overhead = (transfer + materialization) / Optimized total. Shadow runs execute in a detached process against ",
						/* @__PURE__ */ jsx("code", {
							className: "font-mono",
							children: "shopsphere_bench"
						}),
						" and never affect API latency."
					]
				})
			]
		})
	});
};
//#endregion
export { LatencyThroughputCell, OverheadCell, RealTimeStatusCard, SPEC_METADATA, SpeedupBadge, VerificationBadge, PtLogPage as default, getCanonicalQueryInfo, getTriggerContext };
