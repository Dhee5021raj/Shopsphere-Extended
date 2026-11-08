import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const LoginPage = ({ onToast }) => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current || loading) return;

    if (!email.trim() || !password) {
      const msg = 'Please enter both your email address and password.';
      setFormError(msg);
      if (onToast) onToast(msg, 'error');
      return;
    }

    setFormError(null);
    isSubmittingRef.current = true;
    setLoading(true);

    try {
      const data = await login(email.trim().toLowerCase(), password);
      if (onToast) onToast(`Welcome back, ${data.name}!`);
      if (data.role === 'admin') navigate('/admin/dashboard');
      else if (data.role === 'vendor') navigate('/vendor/dashboard');
      else navigate('/products');
    } catch (err) {
      const message = err.response?.data?.message || 'Invalid email or password';
      setFormError(message);
      if (onToast) onToast(message, 'error');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role) => {
    if (isSubmittingRef.current || loading) return;
    setFormError(null);
    isSubmittingRef.current = true;
    setLoading(true);

    try {
      let targetEmail = '';
      let targetPass = '';
      let targetRole = '';

      if (role === 'admin') {
        targetEmail = 'admin@shopsphere.com';
        targetPass = 'adminpassword123';
        targetRole = 'admin';
      } else if (role === 'vendor') {
        targetEmail = 'nexus@vendors.com';
        targetPass = 'password123';
        targetRole = 'vendor';
      } else if (role === 'customer') {
        targetEmail = 'alex@gmail.com';
        targetPass = 'password123';
        targetRole = 'customer';
      }

      setEmail(targetEmail);
      setPassword(targetPass);

      const data = await login(targetEmail, targetPass);
      if (onToast) onToast(`Logged in as ${data.name}!`);

      if (targetRole === 'admin') navigate('/admin/dashboard');
      else if (targetRole === 'vendor') navigate('/vendor/dashboard');
      else navigate('/products');
    } catch (err) {
      const message = err.response?.data?.message || 'Quick login failed. Ensure database has seed data.';
      setFormError(message);
      if (onToast) onToast(message, 'error');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
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
            disabled={loading}
            onClick={() => handleQuickLogin('admin')}
            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all text-center disabled:opacity-50"
          >
            Admin
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleQuickLogin('vendor')}
            className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold transition-all text-center disabled:opacity-50"
          >
            Seller
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleQuickLogin('customer')}
            className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all text-center disabled:opacity-50"
          >
            Customer
          </button>
        </div>
      </div>

      {/* Error Message Box */}
      {formError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2 shadow-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
          <div>
            <span className="font-bold">Authentication issue: </span>
            <span>{formError}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm text-xs">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email Address</label>
          <input
            type="email"
            required
            disabled={loading}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="alex@gmail.com"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Password</label>
          <input
            type="password"
            required
            disabled={loading}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="••••••••"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full gradient-button text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed text-xs"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <LogIn size={18} />
              <span>Sign In</span>
            </>
          )}
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
