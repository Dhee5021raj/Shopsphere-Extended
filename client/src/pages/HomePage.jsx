import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Sparkles, 
  ArrowRight, 
  Store, 
  TrendingUp, 
  ShieldCheck, 
  Truck, 
  RefreshCw, 
  ShoppingBag,
  Award
} from 'lucide-react';
import api from '../services/api';
import ProductCard from '../components/ProductCard';
import CategoryCard from '../components/CategoryCard';
import SearchBar from '../components/SearchBar';
import { ProductSkeleton } from '../components/SkeletonLoader';

const HomePage = ({ onToast }) => {
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [catRes, featRes, trendRes, vendRes] = await Promise.all([
          api.get('/categories'),
          api.get('/products/featured'),
          api.get('/products/trending'),
          api.get('/vendors')
        ]);

        setCategories(catRes.data || []);
        setFeaturedProducts(featRes.data || []);
        setTrendingProducts(trendRes.data || []);
        setVendors(vendRes.data || []);
      } catch (error) {
        console.error('Failed to load homepage data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSearchSubmit = (query) => {
    if (query.trim()) {
      navigate(`/products?search=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className="space-y-16 pb-16">
      
      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 border-b border-slate-200/80 bg-gradient-to-b from-emerald-50/60 via-slate-50 to-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/80 border border-emerald-300 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                <Sparkles size={14} className="text-emerald-600" />
                <span>Next-Gen Multi-Vendor Marketplace</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
                Shop<span className="gradient-text">Sphere</span>
              </h1>

              <p className="text-xl sm:text-2xl font-bold text-slate-700">
                One Marketplace. <span className="text-emerald-600">Endless Possibilities.</span>
              </p>

              <p className="text-slate-600 text-base max-w-2xl leading-relaxed">
                Connect directly with independent artisan sellers, tech labs, and fashion houses worldwide.
                Browse thousands of curated items across top vendors with atomic single-checkout convenience.
              </p>

              {/* Search Bar Container */}
              <div className="pt-2 max-w-xl mx-auto lg:mx-0">
                <SearchBar onSearch={handleSearchSubmit} />
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-4">
                <Link
                  to="/products"
                  className="gradient-button text-white font-bold px-7 py-3.5 rounded-2xl flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  <span>Explore Products</span>
                  <ArrowRight size={18} />
                </Link>

                <Link
                  to="/register-vendor"
                  className="px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-bold flex items-center gap-2 transition-all shadow-sm hover:border-slate-300"
                >
                  <Store size={18} className="text-amber-500" />
                  <span>Become a Seller</span>
                </Link>
              </div>

              {/* Platform Trust Badges */}
              <div className="pt-6 grid grid-cols-3 gap-4 border-t border-slate-200 max-w-lg mx-auto lg:mx-0">
                <div className="text-center lg:text-left">
                  <div className="text-2xl font-black text-slate-900">5+</div>
                  <div className="text-xs font-semibold text-slate-500">Active Stores</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-2xl font-black text-slate-900">40+</div>
                  <div className="text-xs font-semibold text-slate-500">Curated Products</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-2xl font-black text-emerald-600">100%</div>
                  <div className="text-xs font-semibold text-slate-500">ACID Transactions</div>
                </div>
              </div>
            </div>

            {/* Right Hero Visual Cards */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Featured Marketplace Item</span>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      Verified Stock
                    </span>
                  </div>

                  <div className="aspect-video rounded-2xl overflow-hidden bg-slate-100">
                    <img
                      src="https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800"
                      alt="Cyber Laptop"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div>
                    <span className="text-xs text-emerald-600 font-semibold">Nexus Tech Lab</span>
                    <h3 className="text-lg font-bold text-slate-900">AeroBlade Cyber Gaming Laptop 16 Pro</h3>
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        <span className="text-xl font-extrabold text-slate-900">₹1,69,999</span>
                        <span className="text-xs text-slate-400 line-through ml-2">₹1,85,000</span>
                      </div>
                      <Link
                        to="/products"
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        Buy Now
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* CATEGORIES SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Discover</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Major Categories</h2>
          </div>
          <Link to="/products" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-2 sm:mt-0">
            <span>View All Categories</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.slice(0, 8).map((cat) => (
            <CategoryCard
              key={cat._id}
              category={cat}
              onSelectCategory={(catId) => navigate(`/products?category=${catId}`)}
            />
          ))}
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
              <Award size={14} /> Handpicked Deals
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Featured Marketplace Products</h2>
          </div>
          <Link to="/products?featured=true" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-2 sm:mt-0">
            <span>Explore Featured</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <ProductSkeleton key={n} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.slice(0, 8).map((prod) => (
              <ProductCard key={prod._id} product={prod} onToast={onToast} />
            ))}
          </div>
        )}
      </section>

      {/* TRENDING PRODUCTS (POWERED BY MONGODB AGGREGATION) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1">
                <TrendingUp size={14} /> Real MongoDB Aggregation Analytics Data
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Trending Products</h2>
            </div>
            <Link to="/products?sort=popularity" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-2 sm:mt-0">
              <span>View Most Popular</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {trendingProducts.slice(0, 4).map((prod) => (
              <ProductCard key={prod._id} product={prod} onToast={onToast} />
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED VENDOR STORES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Independent Sellers</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Featured Stores</h2>
          </div>
          <Link to="/vendors" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-2 sm:mt-0">
            <span>Browse All Stores</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {vendors.slice(0, 3).map((v) => (
            <Link
              key={v._id}
              to={`/store/${v.storeSlug}`}
              className="group bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg"
            >
              <div className="h-28 bg-slate-100 relative overflow-hidden">
                <img
                  src={v.banner}
                  alt={v.storeName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-white/95 text-amber-500 text-xs font-bold flex items-center gap-1 shadow-sm">
                  ★ {v.rating}
                </div>
              </div>
              <div className="p-5 flex items-center gap-4 -mt-6 relative">
                <img
                  src={v.logo}
                  alt={v.storeName}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-white bg-white shadow-md"
                />
                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                    {v.storeName}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-1">{v.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* MULTI-VENDOR ADVANTAGE BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 p-8 sm:p-12 border border-emerald-800 overflow-hidden shadow-xl text-white">
          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              Single Checkout for Multiple Sellers
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Buy from 10 Different Sellers in One Order.
            </h2>
            <p className="text-emerald-100 text-sm leading-relaxed">
              ShopSphere automatically segregates your multi-vendor items, runs stock validation inside MongoDB ACID transactions, and coordinates individual vendor order status updates seamlessly.
            </p>
            <div className="pt-2 flex flex-wrap gap-4">
              <Link
                to="/products"
                className="bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-extrabold px-6 py-3 rounded-xl transition-all shadow-md"
              >
                Start Shopping Now
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};

export default HomePage;
