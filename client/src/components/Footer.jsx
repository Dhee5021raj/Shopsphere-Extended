import React from 'react';
import { Link } from 'react-router-dom';
import { Database, ShieldCheck, Zap, Server, Layers, Cpu } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-white border-t border-slate-200 text-slate-600 text-sm">
      {/* Database Highlights Banner */}
      <div className="border-b border-slate-200 bg-slate-50/70 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold uppercase tracking-wider">
              <Database size={14} />
              MongoDB Database Architecture Showcase
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-2">
              Engineered with Advanced MongoDB Capabilities
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-center shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <ShieldCheck size={18} />
              </div>
              <h4 className="text-xs font-bold text-slate-900">ACID Transactions</h4>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">Atomic multi-vendor stock verification & rollback</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-center shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-2">
                <Zap size={18} />
              </div>
              <h4 className="text-xs font-bold text-slate-900">Text Search Index</h4>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">Full-text search engine across title & description</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-center shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <Layers size={18} />
              </div>
              <h4 className="text-xs font-bold text-slate-900">Compound Indexes</h4>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">Optimized multi-filter category & price range execution</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-center shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2">
                <Server size={18} />
              </div>
              <h4 className="text-xs font-bold text-slate-900">TTL Guest Carts</h4>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">Automatic 24-hr session purge via expireAfterSeconds</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-center col-span-2 md:col-span-1 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-2">
                <Cpu size={18} />
              </div>
              <h4 className="text-xs font-bold text-slate-900">Aggregation Analytics</h4>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">$match, $unwind, $group pipelines for charts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-button flex items-center justify-center text-white font-bold text-lg">
                S
              </div>
              <span className="text-lg font-extrabold text-slate-900">
                Shop<span className="gradient-text">Sphere</span>
              </span>
            </Link>
            <p className="text-xs text-slate-500 leading-relaxed">
              One Marketplace. Endless Possibilities.<br />
              A next-generation multi-vendor e-commerce platform empowering independent sellers and global buyers.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Marketplace</h4>
            <ul className="space-y-2.5 text-xs text-slate-600">
              <li><Link to="/products" className="hover:text-emerald-600 transition-colors">Explore All Products</Link></li>
              <li><Link to="/vendors" className="hover:text-emerald-600 transition-colors">Verified Vendor Stores</Link></li>
              <li><Link to="/cart" className="hover:text-emerald-600 transition-colors">Shopping Cart</Link></li>
              <li><Link to="/wishlist" className="hover:text-emerald-600 transition-colors">My Wishlist</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Sell on ShopSphere</h4>
            <ul className="space-y-2.5 text-xs text-slate-600">
              <li><Link to="/register-vendor" className="hover:text-emerald-600 transition-colors">Become a Seller</Link></li>
              <li><Link to="/login" className="hover:text-emerald-600 transition-colors">Seller Portal Login</Link></li>
              <li><Link to="/vendor/dashboard" className="hover:text-emerald-600 transition-colors">Sales & Revenue Analytics</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Technology Stack</h4>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-medium">MongoDB</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-medium">Express.js</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-medium">React 18</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-medium">Node.js</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-medium">Tailwind CSS</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-medium">JWT Auth</span>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} ShopSphere Multi-Vendor Marketplace. Full-Stack MERN Project.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
