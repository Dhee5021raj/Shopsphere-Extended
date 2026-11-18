import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Store, Search, Star } from 'lucide-react';
import api from '../services/api';

const SORTS = {
  rating: { label: 'Top Rated', fn: (a, b) => (b.rating || 0) - (a.rating || 0) },
  reviews: { label: 'Most Reviewed', fn: (a, b) => (b.numRatings || 0) - (a.numRatings || 0) },
  name: { label: 'Name (A–Z)', fn: (a, b) => a.storeName.localeCompare(b.storeName) }
};

const VendorCard = ({ vendor }) => (
  <Link
    to={`/store/${vendor.storeSlug}`}
    className="group bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg flex flex-col"
  >
    <div className="h-28 bg-slate-100 relative overflow-hidden">
      <img
        src={vendor.banner}
        alt=""
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      />
      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-white/95 text-amber-500 text-xs font-bold flex items-center gap-1 shadow-sm">
        <Star size={12} className="fill-amber-400 text-amber-400" />
        <span>{vendor.rating ? vendor.rating.toFixed(1) : 'New'}</span>
      </div>
    </div>
    <div className="p-5 flex items-start gap-4 -mt-6 relative flex-1">
      <img
        src={vendor.logo}
        alt={`${vendor.storeName} logo`}
        className="w-14 h-14 rounded-2xl object-cover border-2 border-white bg-white shadow-md shrink-0"
      />
      <div className="min-w-0 pt-6">
        <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-600 transition-colors truncate">
          {vendor.storeName}
        </h3>
        <p className="text-xs text-slate-500 line-clamp-2 mt-1">{vendor.description}</p>
        <p className="text-[11px] text-slate-400 mt-2">
          {vendor.numRatings ? `${vendor.numRatings} ratings` : 'No ratings yet'}
        </p>
      </div>
    </div>
  </Link>
);

const VendorsPage = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('rating');

  useEffect(() => {
    let active = true;
    api.get('/vendors')
      .then(({ data }) => { if (active) setVendors(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setError('Could not load stores. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? vendors.filter((v) =>
          v.storeName?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q))
      : vendors;
    return [...filtered].sort(SORTS[sort].fn);
  }, [vendors, query, sort]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Independent Sellers</span>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-2">
            <Store size={28} className="text-emerald-600" />
            Verified Vendor Stores
          </h1>
          {!loading && !error && (
            <p className="text-sm text-slate-500 mt-1">{vendors.length} approved stores on ShopSphere</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <label className="relative">
            <span className="sr-only">Search stores</span>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stores…"
              className="w-full sm:w-64 bg-white border border-slate-200 text-sm rounded-xl pl-9 pr-3 py-2.5 focus:border-emerald-500 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Sort by:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2.5 focus:border-emerald-500 focus:outline-none"
            >
              {Object.entries(SORTS).map(([key, s]) => (
                <option key={key} value={key}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-56 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-center text-sm text-rose-600 py-16">{error}</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-base font-bold text-slate-800">No stores match “{query}”</p>
          <button type="button" onClick={() => setQuery('')} className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((v) => <VendorCard key={v._id} vendor={v} />)}
        </div>
      )}
    </div>
  );
};

export default VendorsPage;
