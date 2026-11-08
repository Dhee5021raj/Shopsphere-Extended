import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Store, User, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RegisterPage = ({ onToast }) => {
  const { registerCustomer, registerVendor } = useAuth();
  const navigate = useNavigate();

  const [roleTab, setRoleTab] = useState('customer'); // 'customer' or 'vendor'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const isSubmittingRef = useRef(false);

  const validate = () => {
    if (!name.trim()) {
      return 'Please enter your full name.';
    }
    if (!email.trim()) {
      return 'Please enter your email address.';
    }
    if (!EMAIL_REGEX.test(email.trim().toLowerCase())) {
      return 'Please enter a valid email address (e.g. name@domain.com).';
    }
    if (!password) {
      return 'Password is required.';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters long.';
    }
    if (roleTab === 'vendor' && !storeName.trim()) {
      return 'Please enter a store / business name for your seller account.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current || loading) return;

    const validationMsg = validate();
    if (validationMsg) {
      setFormError(validationMsg);
      if (onToast) onToast(validationMsg, 'error');
      return;
    }

    setFormError(null);
    isSubmittingRef.current = true;
    setLoading(true);

    try {
      if (roleTab === 'customer') {
        await registerCustomer(name.trim(), email.trim().toLowerCase(), password);
        if (onToast) onToast('Customer account created!');
        navigate('/products');
      } else {
        await registerVendor(name.trim(), email.trim().toLowerCase(), password, storeName.trim(), description.trim());
        if (onToast) onToast('Vendor account created! Welcome to ShopSphere Seller Hub.');
        navigate('/vendor/dashboard');
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed. Please check your details and try again.';
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
        <h1 className="text-3xl font-extrabold text-slate-900">Join ShopSphere</h1>
        <p className="text-xs text-slate-500">Create an account to start buying or selling</p>
      </div>

      {/* Role Selection Toggle */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setRoleTab('customer');
            setFormError(null);
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
            roleTab === 'customer'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <User size={16} />
          <span>Customer</span>
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setRoleTab('vendor');
            setFormError(null);
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
            roleTab === 'vendor'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Store size={16} />
          <span>Seller / Vendor</span>
        </button>
      </div>

      {/* Error Message Box */}
      {formError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2 shadow-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
          <div>
            <span className="font-bold">Registration issue: </span>
            <span>{formError}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 text-xs shadow-sm">
        <div>
          <label className="block text-slate-700 font-bold uppercase mb-1">Full Name</label>
          <input
            type="text"
            required
            disabled={loading}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="John Doe"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-bold uppercase mb-1">Email Address</label>
          <input
            type="email"
            required
            disabled={loading}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="john@example.com"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-bold uppercase mb-1">Password</label>
          <input
            type="password"
            required
            disabled={loading}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="At least 6 characters"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
          />
          <span className="text-[10px] text-slate-400 mt-1 block">Minimum 6 characters</span>
        </div>

        {/* Vendor Additional Store Details */}
        {roleTab === 'vendor' && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-amber-700 font-bold uppercase mb-1">Store / Business Name</label>
              <input
                type="text"
                required
                disabled={loading}
                value={storeName}
                onChange={(e) => {
                  setStoreName(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="Apex Gadgets Lab"
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-amber-700 font-bold uppercase mb-1">Store Description</label>
              <textarea
                rows={2}
                disabled={loading}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe products you plan to list..."
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
              ></textarea>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full gradient-button text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Creating Account...</span>
            </>
          ) : (
            <>
              <UserPlus size={18} />
              <span>Register as {roleTab === 'vendor' ? 'Seller' : 'Customer'}</span>
            </>
          )}
        </button>

        <div className="text-center pt-2 text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-emerald-600 font-bold hover:underline">
            Sign In
          </Link>
        </div>
      </form>
    </div>
  );
};

export default RegisterPage;
