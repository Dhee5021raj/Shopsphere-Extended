import React, { useState, useEffect } from 'react';
import { Package, Heart, User, MapPin, Clock, CheckCircle2, Truck, XCircle, Store } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';

const CustomerDashboardPage = ({ onToast }) => {
  const { user, updateProfile } = useAuth();
  const { wishlist } = useWishlist();

  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Profile Form State
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileAvatar, setProfileAvatar] = useState(user?.avatar || '');

  // Address Form State
  const [street, setStreet] = useState(user?.addresses?.[0]?.street || '');
  const [city, setCity] = useState(user?.addresses?.[0]?.city || '');
  const [state, setState] = useState(user?.addresses?.[0]?.state || '');
  const [zipCode, setZipCode] = useState(user?.addresses?.[0]?.zipCode || '');

  useEffect(() => {
    const fetchOrders = async () => {
      setLoadingOrders(true);
      try {
        const { data } = await api.get('/orders/my-orders');
        setOrders(data || []);
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setLoadingOrders(false);
      }
    };
    fetchOrders();
  }, []);

  const handleCancelOrder = async (orderId) => {
    try {
      const { data } = await api.put(`/orders/${orderId}/cancel`);
      setOrders(orders.map((o) => (o._id === orderId ? data.order : o)));
      if (onToast) onToast('Order cancelled');
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Cancel failed', 'error');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      await updateProfile({
        name: profileName,
        avatar: profileAvatar,
        addresses: [
          { title: 'Primary', street, city, state, zipCode, isDefault: true }
        ]
      });
      if (onToast) onToast('Profile & Address saved');
    } catch (err) {
      if (onToast) onToast('Failed to update profile', 'error');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Delivered':
        return <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Delivered</span>;
      case 'Shipped':
        return <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold flex items-center gap-1"><Truck size={13} /> Shipped</span>;
      case 'Cancelled':
        return <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1"><XCircle size={13} /> Cancelled</span>;
      default:
        return <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold flex items-center gap-1"><Clock size={13} /> Processing</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      
      {/* Customer Profile Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <img
            src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
            alt={user?.name}
            className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500"
          />
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{user?.name}</h1>
            <p className="text-xs text-slate-500">{user?.email}</p>
            <span className="inline-block mt-1 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Customer Account
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'orders' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package size={15} />
            <span>My Orders ({orders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'profile' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User size={15} />
            <span>Profile & Address</span>
          </button>
        </div>
      </div>

      {/* TAB CONTENT: ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {loadingOrders ? (
            <div className="text-center py-12 text-slate-500">Loading order history...</div>
          ) : orders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-500 shadow-sm">
              You haven't placed any orders yet.
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map((ord) => (
                <div key={ord._id} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
                  
                  {/* Order Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <div className="text-xs text-slate-500">Order ID: <span className="font-mono text-slate-900 font-bold">{ord._id}</span></div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Placed on {new Date(ord.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(ord.orderStatus)}
                      <span className="text-base font-extrabold text-slate-900">₹{ord.totalAmount?.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className="space-y-3">
                    {ord.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                        <div className="flex items-center gap-3">
                          <img
                            src={item.product?.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=150'}
                            alt={item.name}
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                          />
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">{item.name}</h4>
                            <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                              <Store size={12} />
                              <span>Seller: {item.vendor?.storeName || 'Vendor'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-900">{item.quantity} x ₹{item.price?.toLocaleString('en-IN')}</div>
                          <span className="text-[10px] text-slate-500 block mt-0.5">Status: {item.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Cancel Button */}
                  {(ord.orderStatus === 'Pending' || ord.orderStatus === 'Processing') && (
                    <div className="pt-2 border-t border-slate-100 text-right">
                      <button
                        onClick={() => handleCancelOrder(ord._id)}
                        className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                      >
                        Cancel Order
                      </button>
                    </div>
                  )}

                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: PROFILE */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 max-w-2xl shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 pb-3 border-b border-slate-100">Account Details & Address</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Full Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Avatar Image URL</label>
              <input
                type="text"
                value={profileAvatar}
                onChange={(e) => setProfileAvatar(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
              />
            </div>

            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 mb-3">Primary Delivery Address</h4>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-600 font-medium mb-1">Street Address</label>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">ZIP Code</label>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            className="gradient-button text-white font-bold text-xs py-3 px-6 rounded-xl shadow-sm"
          >
            Save Profile
          </button>
        </form>
      )}

    </div>
  );
};

export default CustomerDashboardPage;
