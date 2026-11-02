import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Sparkles, ShieldCheck, Store, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const LoginPage = ({ onToast }) => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      if (onToast) onToast(`Welcome back, ${data.name}!`);
      if (data.role === 'admin') navigate('/admin/dashboard');
      else if (data.role === 'vendor') navigate('/vendor/dashboard');
      else navigate('/products');
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Invalid credentials', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role) => {
    try {
      if (role === 'admin') {
        setEmail('admin@shopsphere.com');
        setPassword('adminpassword123');
        const data = await login('admin@shopsphere.com', 'adminpassword123');
        if (onToast) onToast('Logged in as Admin');
        navigate('/admin/dashboard');
      } else if (role === 'vendor') {
        setEmail('nexus@vendors.com');
        setPassword('password123');
        const data = await login('nexus@vendors.com', 'password123');
        if (onToast) onToast('Logged in as Vendor');
        navigate('/vendor/dashboard');
      } else if (role === 'customer') {
        setEmail('alex@gmail.com');
        setPassword('password123');
        const data = await login('alex@gmail.com', 'password123');
        if (onToast) onToast('Logged in as Customer');
        navigate('/products');
      }
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Login failed', 'error');
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold text-slate-900">Sign In to ShopSphere</h1>
        <p className="text-xs text-slate-500">Enter credentials or select a demo account role below</p>
      </div>

      {/* Quick Viva Demo Login Buttons */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-sm">
        <div className="text-[11px] font-bold text-amber-600 flex items-center gap-1.5 mb-2">
          <Sparkles size={14} />
          <span>Quick Viva Demo Logins</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleQuickLogin('admin')}
            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all text-center"
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => handleQuickLogin('vendor')}
            className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold transition-all text-center"
          >
            Seller
          </button>
          <button
            type="button"
            onClick={() => handleQuickLogin('customer')}
            className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all text-center"
          >
            Customer
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email Address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@gmail.com"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full gradient-button text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm"
        >
          <LogIn size={18} />
          <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
        </button>

        <div className="text-center pt-2 text-xs text-slate-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-emerald-600 font-bold hover:underline">
            Register Now
          </Link>
        </div>
      </form>
    </div>
  );
};

export default LoginPage;
