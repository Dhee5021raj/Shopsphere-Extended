import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Sparkles, SlidersHorizontal, PackageX, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../services/api';
import ProductCard from '../components/ProductCard';
import FilterSidebar from '../components/FilterSidebar';
import SearchBar from '../components/SearchBar';
import { ProductSkeleton } from '../components/SkeletonLoader';
import { useAuth } from '../context/AuthContext';

// Live shadow-comparison badge (Step 7): the benchmark NEVER runs inside the
// visible UI — it fires detached after your search finishes so it can never
// slow the request. This badge makes that invisible work discoverable: it
// polls the same live status endpoint the log page uses, shows a pulsing chip
// while a comparison is running, and links straight to /admin/pt-log.
// Hidden automatically for non-admin viewers (the status endpoint is admin-only).
function ShadowStatusBadge() {
  const { user, isAdmin } = useAuth();
  const [st, setSt] = useState(null); // null = unknown / no access → hide

  useEffect(() => {
    // 1. Guard: Only authenticated admins are permitted to poll the admin PT status endpoint
    if (!user || !isAdmin) {
      setSt(null);
      return;
    }

    let alive = true;
    let timerId = null;

    const load = async () => {
      try {
        const { data } = await api.get('/admin/pt-status');
        if (alive) {
          setSt(data && typeof data === 'object' ? data : { running: false });
        }
      } catch (err) {
        if (!alive) return;
        setSt(null);
        // 4. Stop polling immediately after 401 (Unauthorized) or 403 (Forbidden)
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          if (timerId) {
            clearInterval(timerId);
            timerId = null;
          }
        }
      }
    };

    load();
    timerId = setInterval(load, 4000);

    // 3. Clear polling interval on unmount
    return () => {
      alive = false;
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    };
  }, [user, isAdmin]);

  if (!st) return null;
  const elapsed = st.startedAt ? Math.max(0, Math.round((Date.now() - new Date(st.startedAt).getTime()) / 1000)) : null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {st.running ? (
        <Link
          to="/admin/pt-log"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-extrabold bg-amber-500/95 text-white shadow-lg hover:bg-amber-600 transition-colors"
          title="A Standard MongoDB vs Optimized (mongo-pt) comparison of your search is being measured detached in the background — click to watch it live"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Shadow comparison running{elapsed != null ? ` · ${elapsed}s elapsed` : ''} — view live log
        </Link>
      ) : (
        <Link
          to="/admin/pt-log"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold bg-white/90 text-slate-600 border border-slate-200 shadow-sm hover:border-emerald-400 hover:text-emerald-700 transition-colors"
          title="Shadow benchmarks idle — open the live Standard MongoDB vs Optimized (mongo-pt) comparison log"
        >
          ⚡ Shadow log — open live comparisons
        </Link>
      )}
    </div>
  );
}

const ProductDiscoveryPage = ({ onToast }) => {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    category: searchParams.get('category') || 'all',
    vendor: searchParams.get('vendor') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minRating: searchParams.get('minRating') || '',
    inStock: searchParams.get('inStock') || 'false',
    featured: searchParams.get('featured') || 'false',
    sort: searchParams.get('sort') || 'newest'
  });

  // Fetch Categories & Vendors metadata once
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [catRes, vendRes] = await Promise.all([
          api.get('/categories'),
          api.get('/vendors')
        ]);
        setCategories(catRes.data || []);
        setVendors(vendRes.data || []);
      } catch (err) {
        console.error('Failed to load filter metadata:', err);
      }
    };
    fetchMetadata();
  }, []);

  // Fetch Products whenever filters or page change
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const params = {
          page,
          limit: 12,
          sort: filters.sort
        };

        if (filters.search) params.search = filters.search;
        if (filters.category && filters.category !== 'all') params.category = filters.category;
        if (filters.vendor) params.vendor = filters.vendor;
        if (filters.minPrice) params.minPrice = filters.minPrice;
        if (filters.maxPrice) params.maxPrice = filters.maxPrice;
        if (filters.minRating) params.minRating = filters.minRating;
        if (filters.inStock === 'true') params.inStock = 'true';
        if (filters.featured === 'true') params.featured = 'true';

        const { data } = await api.get('/products', { params });
        setProducts(data.products || []);
        setTotalPages(data.pages || 1);
        setTotalProducts(data.total || 0);
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [filters, page]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleSearch = (query) => {
    setFilters((prev) => ({ ...prev, search: query }));
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      category: 'all',
      vendor: '',
      minPrice: '',
      maxPrice: '',
      minRating: '',
      inStock: 'false',
      featured: 'false',
      sort: 'newest'
    });
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Header & Search Bar */}
      <div className="space-y-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Marketplace Catalog</span>
          <h1 className="text-3xl font-extrabold text-slate-900">Explore Products</h1>
        </div>
        <div className="max-w-2xl">
          <SearchBar onSearch={handleSearch} initialQuery={filters.search} />
        </div>
      </div>

      {/* Main Content Grid: Filter Sidebar + Product Listing */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Filter Sidebar */}
        <div className="lg:col-span-1">
          <FilterSidebar
            categories={categories}
            vendors={vendors}
            filters={filters}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
          />
        </div>

        {/* Product Grid & Controls */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Top Bar Controls */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="text-xs font-medium text-slate-600">
              Showing <span className="font-bold text-slate-900">{totalProducts}</span> products
              {filters.search && <span> for "<strong className="text-emerald-600">{filters.search}</strong>"</span>}
            </div>

            {/* Sorting Select */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Sort by:</span>
              <select
                value={filters.sort}
                onChange={(e) => handleFilterChange('sort', e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 focus:border-emerald-500 focus:outline-none"
              >
                <option value="newest">Newest Arrivals</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="rating">Highest Rated</option>
                <option value="popularity">Most Popular (SoldCount)</option>
              </select>
            </div>
          </div>

          {/* Product Grid / Loading / Empty State */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <ProductSkeleton key={n} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <PackageX size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">No products found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                We couldn't find any products matching your search criteria. Try adjusting your filters or resetting search terms.
              </p>
              <button
                onClick={handleResetFilters}
                className="gradient-button text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((prod) => (
                <ProductCard key={prod._id} product={prod} onToast={onToast} />
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-6 border-t border-slate-200">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-emerald-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs font-semibold text-slate-700 px-4">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-emerald-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

        </div>

      </div>

      {isAdmin && <ShadowStatusBadge />}
    </div>
  );
};

export default ProductDiscoveryPage;
