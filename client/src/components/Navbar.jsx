import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  ShoppingBag, 
  Heart, 
  User, 
  Store, 
  ShieldCheck, 
  LogOut, 
  Menu, 
  X, 
  Search, 
  Sparkles,
  ChevronDown,
  Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';

const Navbar = ({ onToast }) => {
  const { user, logout, login } = useAuth();
  const { totalItemCount } = useCart();
  const { wishlist } = useWishlist();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const handleDemoLogin = async (role) => {
    try {
      let data;
      if (role === 'admin') {
        data = await login('admin@shopsphere.com', 'adminpassword123');
        if (onToast) onToast('Logged in as Marketplace Admin!');
        setDemoModalOpen(false);
        navigate('/admin/dashboard');
      } else if (role === 'vendor') {
        data = await login('nexus@vendors.com', 'password123');
        if (onToast) onToast('Logged in as Nexus Tech Lab Vendor!');
        setDemoModalOpen(false);
        navigate('/vendor/dashboard');
      } else if (role === 'customer') {
        data = await login('alex@gmail.com', 'password123');
        if (onToast) onToast('Logged in as Customer (Alex)!');
        setDemoModalOpen(false);
        navigate('/products');
      }
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Login failed. Run npm run seed first.', 'error');
    }
  };

  // Close modal on Escape key press
  useEffect(() => {
    if (!demoModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setDemoModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [demoModalOpen]);

  return (
    <header className="sticky top-0 z-50 glass-header border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo Branding */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl gradient-button flex items-center justify-center text-white font-black text-xl shadow-md group-hover:scale-105 transition-transform">
              S
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-slate-900 flex items-center gap-1">
                Shop<span className="gradient-text">Sphere</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold block -mt-1">
                Multi-Vendor Hub
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <Link to="/" className={`hover:text-emerald-700 transition-colors ${location.pathname === '/' ? 'text-emerald-600 font-bold' : ''}`}>
              Home
            </Link>
            <Link to="/products" className={`hover:text-emerald-700 transition-colors ${location.pathname === '/products' ? 'text-emerald-600 font-bold' : ''}`}>
              Explore Products
            </Link>
            <Link to="/vendors" className={`hover:text-emerald-700 transition-colors ${location.pathname === '/vendors' ? 'text-emerald-600 font-bold' : ''}`}>
              Stores
            </Link>
          </nav>

          {/* User Action Right Bar */}
          <div className="flex items-center gap-4">
            
            {/* Viva Demo Quick Login Modal Trigger */}
            <button
              onClick={() => setDemoModalOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold hover:bg-emerald-100 transition-all shadow-sm"
              title="Quickly switch demo accounts for Viva examination"
            >
              <Sparkles size={14} className="text-emerald-600" />
              <span>Viva Demo Switcher</span>
            </button>

            {/* Wishlist Icon */}
            <Link
              to="/wishlist"
              className="relative p-2.5 rounded-xl text-slate-600 hover:text-emerald-700 hover:bg-slate-100 transition-colors"
              title="Wishlist"
            >
              <Heart size={20} />
              {wishlist.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                  {wishlist.length}
                </span>
              )}
            </Link>

            {/* Cart Icon */}
            <Link
              to="/cart"
              className="relative p-2.5 rounded-xl text-slate-600 hover:text-emerald-700 hover:bg-slate-100 transition-colors"
              title="Shopping Cart"
            >
              <ShoppingBag size={20} />
              {totalItemCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                  {totalItemCount}
                </span>
              )}
            </Link>

            {/* User Profile / Auth State */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-all shadow-sm"
                >
                  <img
                    src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={user.name}
                    className="w-8 h-8 rounded-lg object-cover"
                  />
                  <span className="text-xs font-semibold text-slate-800 hidden sm:inline-block max-w-[100px] truncate">
                    {user.name}
                  </span>
                  <ChevronDown size={14} className="text-slate-500" />
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-xs text-slate-500">Signed in as</p>
                      <p className="text-sm font-bold text-slate-900 truncate">{user.email}</p>
                      <span className="inline-block mt-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {user.role}
                      </span>
                    </div>

                    <div className="py-1">
                      <Link
                        to="/dashboard"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        <User size={15} />
                        <span>My Account</span>
                      </Link>

                      {user.role === 'vendor' && (
                        <Link
                          to="/vendor/dashboard"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-xs text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          <Store size={15} />
                          <span>Seller Dashboard</span>
                        </Link>
                      )}

                      {user.role === 'admin' && (
                        <Link
                          to="/admin/dashboard"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-xs text-rose-700 hover:bg-rose-50 transition-colors"
                        >
                          <ShieldCheck size={15} />
                          <span>Admin Control Panel</span>
                        </Link>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-1">
                      <button
                        onClick={() => {
                          setUserDropdownOpen(false);
                          logout();
                          if (onToast) onToast('Logged out successfully');
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <LogOut size={15} />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-xs font-semibold text-slate-700 hover:text-emerald-700 px-3 py-2 rounded-xl transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="gradient-button text-white text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Join Market
                </Link>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-4 space-y-3 shadow-md">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-slate-700 hover:text-emerald-600 py-1"
          >
            Home
          </Link>
          <Link
            to="/products"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-slate-700 hover:text-emerald-600 py-1"
          >
            Explore Products
          </Link>
          <Link
            to="/vendors"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-slate-700 hover:text-emerald-600 py-1"
          >
            Vendor Stores
          </Link>

          <button
            onClick={() => {
              setMobileMenuOpen(false);
              setDemoModalOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold shadow-xs"
          >
            <Sparkles size={14} />
            <span>Viva Demo Account Switcher</span>
          </button>
        </div>
      )}

      {/* Viva Demo Account Quick Switcher Modal */}
      {demoModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDemoModalOpen(false); }}
        >
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative animate-in zoom-in-95">
            <button
              onClick={() => setDemoModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700"
            >
              <X size={20} />
            </button>

            <div className="text-center space-y-1">
              <div className="inline-flex p-3 rounded-2xl bg-emerald-50 text-emerald-600 mb-2">
                <Layers size={28} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Viva Quick Login Switcher</h3>
              <p className="text-xs text-slate-500">
                Click any role to test ShopSphere instantly with pre-seeded database accounts.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleDemoLogin('admin')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-rose-50 border border-rose-200 hover:bg-rose-100 text-left transition-all"
              >
                <div>
                  <h4 className="text-sm font-bold text-rose-800">1. Admin Account</h4>
                  <p className="text-[11px] text-slate-500">admin@shopsphere.com</p>
                </div>
                <span className="text-xs font-bold text-rose-700">Log In →</span>
              </button>

              <button
                onClick={() => handleDemoLogin('vendor')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-amber-50 border border-amber-200 hover:bg-amber-100 text-left transition-all"
              >
                <div>
                  <h4 className="text-sm font-bold text-amber-800">2. Seller / Vendor Account</h4>
                  <p className="text-[11px] text-slate-500">nexus@vendors.com (Nexus Tech Lab)</p>
                </div>
                <span className="text-xs font-bold text-amber-700">Log In →</span>
              </button>

              <button
                onClick={() => handleDemoLogin('customer')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-left transition-all"
              >
                <div>
                  <h4 className="text-sm font-bold text-emerald-800">3. Customer Account</h4>
                  <p className="text-[11px] text-slate-500">alex@gmail.com (Alex Johnson)</p>
                </div>
                <span className="text-xs font-bold text-emerald-700">Log In →</span>
              </button>
            </div>

            <div className="text-center pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">
                Password for all demo accounts: <code className="text-emerald-700 font-bold">password123</code> / <code className="text-emerald-700 font-bold">adminpassword123</code>
              </span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
