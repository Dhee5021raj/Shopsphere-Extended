import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Store, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (roleTab === 'customer') {
        await registerCustomer(name, email, password);
        if (onToast) onToast('Customer account created!');
        navigate('/products');
      } else {
        await registerVendor(name, email, password, storeName, description);
        if (onToast) onToast('Vendor account created! Welcome to ShopSphere Seller Hub.');
        navigate('/vendor/dashboard');
      }
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Registration failed', 'error');
    } finally {
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
          onClick={() => setRoleTab('customer')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
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
          onClick={() => setRoleTab('vendor')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
            roleTab === 'vendor'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Store size={16} />
          <span>Seller / Vendor</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 text-xs shadow-sm">
        <div>
          <label className="block text-slate-700 font-bold uppercase mb-1">Full Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-bold uppercase mb-1">Email Address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="john@example.com"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-bold uppercase mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
          />
        </div>

        {/* Vendor Additional Store Details */}
        {roleTab === 'vendor' && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-amber-700 font-bold uppercase mb-1">Store / Business Name</label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Apex Gadgets Lab"
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-amber-700 font-bold uppercase mb-1">Store Description</label>
              <textarea
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe products you plan to list..."
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
              ></textarea>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full gradient-button text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm"
        >
          <UserPlus size={18} />
          <span>{loading ? 'Creating Account...' : `Register as ${roleTab === 'vendor' ? 'Seller' : 'Customer'}`}</span>
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
