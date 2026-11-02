import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Store, 
  Package, 
  ShoppingBag, 
  DollarSign, 
  Check, 
  X, 
  Ban, 
  Unlock, 
  Plus, 
  TrendingUp, 
  PieChart, 
  Layers,
  Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import api from '../services/api';

const AdminDashboardPage = ({ onToast }) => {
  const [activeTab, setActiveTab] = useState('overview');

  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Category Form Modal State
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catIcon, setCatIcon] = useState('Package');
  const [catImage, setCatImage] = useState('');

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, usersRes, vendorsRes, catRes, ordersRes] = await Promise.all([
        api.get('/analytics/admin'),
        api.get('/admin/users'),
        api.get('/admin/vendors'),
        api.get('/categories'),
        api.get('/admin/orders')
      ]);

      setAnalytics(analyticsRes.data);
      setUsers(usersRes.data || []);
      setVendors(vendorsRes.data || []);
      setCategories(catRes.data || []);
      setOrders(ordersRes.data || []);
    } catch (err) {
      console.error('Error fetching admin control panel data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleToggleBlockUser = async (userId) => {
    try {
      const { data } = await api.put(`/admin/users/${userId}/block`);
      if (onToast) onToast(data.message);
      fetchAdminData();
    } catch (err) {
      if (onToast) onToast('Action failed', 'error');
    }
  };

  const handleUpdateVendorStatus = async (vendorId, status) => {
    try {
      const { data } = await api.put(`/admin/vendors/${vendorId}/status`, { status });
      if (onToast) onToast(data.message);
      fetchAdminData();
    } catch (err) {
      if (onToast) onToast('Status update failed', 'error');
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      await api.post('/categories', {
        name: catName,
        description: catDesc,
        icon: catIcon,
        image: catImage || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600'
      });
      if (onToast) onToast('Category created successfully');
      setCatModalOpen(false);
      setCatName('');
      setCatDesc('');
      setCatImage('');
      fetchAdminData();
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Create category failed', 'error');
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm('Delete category?')) return;
    try {
      await api.delete(`/categories/${catId}`);
      if (onToast) onToast('Category deleted');
      fetchAdminData();
    } catch (err) {
      if (onToast) onToast('Delete failed', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-500">Loading Admin Control Center...</p>
        </div>
      </div>
    );
  }

  const summary = analytics?.summary || {};

  // Analytics Chart Data
  const monthlyRevenueData = analytics?.monthlyOverview ? analytics.monthlyOverview.map((item) => ({
    name: `M${item._id.month}/${item._id.year}`,
    revenue: item.totalRevenue,
    orders: item.totalOrders
  })) : [];

  const topVendorsData = analytics?.topVendors ? analytics.topVendors.map((item) => ({
    name: item.storeName || 'Vendor',
    sales: item.totalSalesAmount,
    units: item.totalUnitsSold
  })) : [];

  const topCategoriesData = analytics?.topCategories ? analytics.topCategories.map((item) => ({
    name: item.categoryName || 'Category',
    revenue: item.totalRevenue
  })) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      
      {/* Admin Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
            <ShieldCheck size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Marketplace Master Control Panel</h1>
            <p className="text-xs text-slate-500">Admin oversight, vendor approvals, category management & global aggregations</p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'overview' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Overview & Analytics
          </button>
          <button
            onClick={() => setActiveTab('vendors')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all relative ${
              activeTab === 'vendors' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Vendors ({vendors.length})
            {summary.pendingVendors > 0 && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold">
                {summary.pendingVendors} pending
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'users' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'categories' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Categories ({categories.length})
          </button>
          <Link
            to="/admin/pt-log"
            className="px-4 py-2 rounded-xl text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 transition-all"
          >
            <Activity size={14} /> mongo-pt Log
          </Link>
        </div>
      </div>

      {/* OVERVIEW & ANALYTICS TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          
          {/* Summary Stat Widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Gross GMV Revenue</span>
                <DollarSign size={20} className="text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">₹{(summary.grossRevenue || 0).toLocaleString('en-IN')}</div>
              <div className="text-[11px] text-emerald-600 font-medium">Aggregated across all vendors</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Total Orders</span>
                <ShoppingBag size={20} className="text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{summary.totalOrders || 0} Orders</div>
              <div className="text-[11px] text-slate-500">Total customer checkouts</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Vendor Stores</span>
                <Store size={20} className="text-amber-500" />
              </div>
              <div className="text-2xl font-black text-slate-900">{summary.totalVendors || 0} Active</div>
              <div className="text-[11px] text-amber-600 font-medium">{summary.pendingVendors || 0} awaiting approval</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Total Products</span>
                <Package size={20} className="text-teal-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{summary.totalProducts || 0} Items</div>
              <div className="text-[11px] text-teal-600 font-medium">Catalog items</div>
            </div>
          </div>

          {/* Aggregation Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Global Revenue Line Chart */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-600" />
                <span>Marketplace Gross Revenue Over Time</span>
              </h4>
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyRevenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', fontSize: '12px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={3} dot={{ fill: '#059669' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Vendors Bar Chart */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Store size={16} className="text-emerald-600" />
                <span>Top Vendor Stores by Sales Amount</span>
              </h4>
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topVendorsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', fontSize: '12px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="sales" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* VENDORS TAB */}
      {activeTab === 'vendors' && (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-slate-900">Vendor Approval & Management</h3>

          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="p-4">Store</th>
                  <th className="p-4">Owner Email</th>
                  <th className="p-4">Rating</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Approval Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => (
                  <tr key={v._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <img src={v.logo} alt={v.storeName} className="w-10 h-10 rounded-xl object-cover border border-slate-200" />
                      <div>
                        <div className="font-bold text-slate-900">{v.storeName}</div>
                        <div className="text-[11px] text-slate-500">{v.storeSlug}</div>
                      </div>
                    </td>
                    <td className="p-4 text-slate-600 font-medium">{v.user?.email}</td>
                    <td className="p-4 font-bold text-amber-500">★ {v.rating || 0}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                        v.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {v.status !== 'approved' && (
                        <button
                          onClick={() => handleUpdateVendorStatus(v._id, 'approved')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors shadow-xs"
                        >
                          Approve Store
                        </button>
                      )}
                      {v.status !== 'rejected' && (
                        <button
                          onClick={() => handleUpdateVendorStatus(v._id, 'rejected')}
                          className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 transition-colors"
                        >
                          Reject
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-slate-900">Platform Users & Access</h3>

          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="p-4">User</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Account Status</th>
                  <th className="p-4 text-right">Access Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover border border-slate-200" />
                      <span className="font-bold text-slate-900">{u.name}</span>
                    </td>
                    <td className="p-4 text-slate-600 font-medium">{u.email}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold uppercase text-[10px]">
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        u.isBlocked ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {u.isBlocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => handleToggleBlockUser(u._id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            u.isBlocked ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {u.isBlocked ? 'Unblock User' : 'Block User'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CATEGORIES TAB */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-900">Marketplace Categories</h3>
            <button
              onClick={() => setCatModalOpen(true)}
              className="gradient-button text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"
            >
              <Plus size={16} />
              <span>New Category</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map((c) => (
              <div key={c._id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <img src={c.image} alt={c.name} className="w-10 h-10 rounded-xl object-cover bg-slate-50 border border-slate-100" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{c.name}</h4>
                    <span className="text-[11px] text-slate-500">{c.slug}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCategory(c._id)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Category Modal */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 relative shadow-2xl">
            <button onClick={() => setCatModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700">
              <X size={20} />
            </button>
            <h3 className="text-xl font-bold text-slate-900">Create Category</h3>

            <form onSubmit={handleCreateCategory} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:outline-none focus:border-brand-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Image URL</label>
                <input
                  type="text"
                  required
                  value={catImage}
                  onChange={(e) => setCatImage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:outline-none focus:border-brand-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <textarea
                  rows={3}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:outline-none focus:border-brand-500 focus:bg-white transition-colors"
                ></textarea>
              </div>

              <button type="submit" className="w-full gradient-button text-white font-bold py-3 rounded-xl shadow-sm">
                Create Category
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboardPage;
