import React, { useState, useEffect } from 'react';
import { 
  Store, 
  Package, 
  ShoppingBag, 
  DollarSign, 
  TrendingUp, 
  Plus, 
  Edit, 
  Trash2, 
  Star, 
  CheckCircle2, 
  BarChart3,
  X
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const VendorDashboardPage = ({ onToast }) => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit Product Modal State
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDiscountPrice, setProdDiscountPrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodIsFeatured, setProdIsFeatured] = useState(false);
  const [savingProd, setSavingProd] = useState(false);

  const fetchVendorData = async () => {
    setLoading(true);
    try {
      const [statsRes, ordersRes, analyticsRes, catRes] = await Promise.all([
        api.get('/vendors/dashboard/stats'),
        api.get('/vendors/orders'),
        api.get('/analytics/vendor'),
        api.get('/categories')
      ]);

      setStats(statsRes.data);
      setOrders(ordersRes.data || []);
      setAnalytics(analyticsRes.data);
      setCategories(catRes.data || []);

      // Fetch products listed by this vendor
      if (user?.vendor?._id) {
        const prodRes = await api.get('/products', { params: { vendor: user.vendor._id, limit: 100 } });
        setProducts(prodRes.data.products || []);
      }
    } catch (err) {
      console.error('Error loading vendor dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendorData();
  }, [user]);

  const handleOpenAddModal = () => {
    setEditingProductId(null);
    setProdName('');
    setProdDesc('');
    setProdPrice('');
    setProdDiscountPrice('');
    setProdStock('10');
    setProdCategory(categories[0]?._id || '');
    setProdImageUrl('');
    setProdIsFeatured(false);
    setProductModalOpen(true);
  };

  const handleOpenEditModal = (prod) => {
    setEditingProductId(prod._id);
    setProdName(prod.name);
    setProdDesc(prod.description);
    setProdPrice(String(prod.price));
    setProdDiscountPrice(String(prod.discountPrice || ''));
    setProdStock(String(prod.stock));
    setProdCategory(prod.category?._id || prod.category);
    setProdImageUrl(prod.images?.[0] || '');
    setProdIsFeatured(prod.isFeatured || false);
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setSavingProd(true);
    try {
      const payload = {
        name: prodName,
        description: prodDesc,
        price: Number(prodPrice),
        discountPrice: prodDiscountPrice ? Number(prodDiscountPrice) : 0,
        stock: Number(prodStock),
        category: prodCategory,
        images: [prodImageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'],
        isFeatured: prodIsFeatured
      };

      if (editingProductId) {
        await api.put(`/products/${editingProductId}`, payload);
        if (onToast) onToast('Product updated successfully');
      } else {
        await api.post('/products', payload);
        if (onToast) onToast('New product created!');
      }

      setProductModalOpen(false);
      fetchVendorData();
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSavingProd(false);
    }
  };

  const handleDeleteProduct = async (prodId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await api.delete(`/products/${prodId}`);
      if (onToast) onToast('Product removed');
      fetchVendorData();
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Delete failed', 'error');
    }
  };

  const handleUpdateItemStatus = async (orderId, itemId, newStatus) => {
    try {
      await api.put(`/vendors/orders/${orderId}/items/${itemId}/status`, { status: newStatus });
      if (onToast) onToast(`Item status updated to ${newStatus}`);
      fetchVendorData();
    } catch (err) {
      if (onToast) onToast('Status update failed', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-500">Loading Seller Portal & Analytics...</p>
        </div>
      </div>
    );
  }

  // Monthly Revenue Chart Data formatting
  const monthlyChartData = analytics?.monthlyRevenue ? analytics.monthlyRevenue.map((item) => ({
    name: `M${item._id.month}/${item._id.year}`,
    revenue: item.revenue,
    sales: item.totalUnitsSold
  })) : [];

  const topProductsChartData = analytics?.bestSellingProducts ? analytics.bestSellingProducts.map((item) => ({
    name: item.productName ? item.productName.substring(0, 15) + '...' : 'Product',
    units: item.totalUnitsSold,
    revenue: item.totalRevenue
  })) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      
      {/* Seller Store Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <img
            src={user?.vendor?.logo || 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=150'}
            alt={stats?.storeName}
            className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400 bg-slate-50 shadow-xs"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900">{stats?.storeName || 'Seller Hub'}</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">
                {stats?.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Manage products, fulfill buyer orders & track MongoDB analytics</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'overview' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'products' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Products ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'orders' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Orders ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'analytics' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Analytics
          </button>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          
          {/* Key Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Gross Revenue</span>
                <DollarSign size={20} className="text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">₹{(stats?.totalRevenue || 0).toLocaleString('en-IN')}</div>
              <div className="text-[11px] text-emerald-600 font-medium">Aggregated from orders</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Total Sales</span>
                <ShoppingBag size={20} className="text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{stats?.totalSalesCount || 0} Units</div>
              <div className="text-[11px] text-slate-500">Across {stats?.totalOrders || 0} customer orders</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Active Inventory</span>
                <Package size={20} className="text-teal-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{stats?.totalProducts || 0} Products</div>
              <div className="text-[11px] text-teal-600 font-medium">Live on marketplace</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Store Rating</span>
                <Star size={20} className="text-amber-500 fill-amber-400" />
              </div>
              <div className="text-2xl font-black text-slate-900">{stats?.rating || 4.8} / 5.0</div>
              <div className="text-[11px] text-amber-600 font-medium">{stats?.numRatings || 120} buyer ratings</div>
            </div>
          </div>

          {/* Quick Recent Orders Overview */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Recent Customer Orders</h3>
            {orders.length === 0 ? (
              <p className="text-xs text-slate-400">No orders received yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {orders.slice(0, 5).map((ord) => (
                  <div key={ord._id} className="py-3 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-slate-900">Order #{ord._id.substring(0, 8)}</div>
                      <div className="text-slate-500">{ord.customer?.name} • {ord.items.length} item(s)</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-600">₹{ord.vendorSubtotal?.toLocaleString('en-IN')}</div>
                      <div className="text-slate-400">{new Date(ord.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* PRODUCTS TAB */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-900">Inventory Management</h3>
            <button
              onClick={handleOpenAddModal}
              className="gradient-button text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"
            >
              <Plus size={16} />
              <span>Add New Product</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="p-4">Product</th>
                  <th className="p-4">Price</th>
                  <th className="p-4">Stock</th>
                  <th className="p-4">Sold</th>
                  <th className="p-4">Rating</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((prod) => (
                  <tr key={prod._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <img
                        src={prod.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100'}
                        alt={prod.name}
                        className="w-10 h-10 rounded-xl object-cover bg-slate-50 border border-slate-200"
                      />
                      <div>
                        <div className="font-bold text-slate-900">{prod.name}</div>
                        <div className="text-[11px] text-slate-500">{prod.category?.name || 'Category'}</div>
                      </div>
                    </td>
                    <td className="p-4 font-bold text-slate-900">₹{prod.price?.toLocaleString('en-IN')}</td>
                    <td className="p-4">
                      <span className={`font-bold ${prod.stock <= 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {prod.stock} units
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 font-medium">{prod.soldCount || 0}</td>
                    <td className="p-4 font-bold text-amber-500">★ {prod.rating || 0}</td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEditModal(prod)}
                        className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                        title="Edit product"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(prod._id)}
                        className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                        title="Delete product"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ORDERS TAB */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-slate-900">Orders Containing Your Products</h3>

          <div className="space-y-4">
            {orders.map((ord) => (
              <div key={ord._id} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3 text-xs">
                  <div>
                    <span className="text-slate-500">Order ID:</span> <span className="font-mono text-slate-900 font-bold">{ord._id}</span>
                    <div className="text-slate-400 mt-0.5">Customer: {ord.customer?.name} ({ord.customer?.email})</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-emerald-600">Subtotal: ₹{ord.vendorSubtotal?.toLocaleString('en-IN')}</div>
                    <div className="text-slate-400">{new Date(ord.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>

                {/* Items Status Management */}
                <div className="space-y-3">
                  {ord.items.map((item) => (
                    <div key={item._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      <div>
                        <div className="text-xs font-bold text-slate-900">{item.name}</div>
                        <div className="text-[11px] text-slate-500">{item.quantity} x ₹{item.price?.toLocaleString('en-IN')}</div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 font-medium">Status:</span>
                        <select
                          value={item.status}
                          onChange={(e) => handleUpdateItemStatus(ord._id, item._id, e.target.value)}
                          className="bg-white border border-slate-200 text-slate-900 text-xs rounded-xl px-3 py-1.5 focus:border-emerald-500 focus:outline-none shadow-xs font-medium"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Confirmed">Confirmed</option>
                          <option value="Processing">Processing</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Delivered">Delivered</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            ))}
          </div>
        </div>
      )}

      {/* ANALYTICS TAB (POWERED BY MONGODB AGGREGATIONS) */}
      {activeTab === 'analytics' && (
        <div className="space-y-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Native MongoDB Aggregation Framework</span>
            <h3 className="text-2xl font-bold text-slate-900">Sales & Revenue Aggregations</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Monthly Revenue Chart */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-600" />
                <span>Monthly Sales Revenue (₹)</span>
              </h4>
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', fontSize: '12px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={3} dot={{ fill: '#059669' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Best Selling Products Bar Chart */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 size={16} className="text-amber-500" />
                <span>Top Selling Products (Units Sold)</span>
              </h4>
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProductsChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', fontSize: '12px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="units" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setProductModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-bold text-slate-900">
              {editingProductId ? 'Edit Listed Product' : 'Add Product to Inventory'}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Category</label>
                <select
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                >
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Discount Price</label>
                  <input
                    type="number"
                    value={prodDiscountPrice}
                    onChange={(e) => setProdDiscountPrice(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Stock</label>
                  <input
                    type="number"
                    required
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Image URL</label>
                <input
                  type="text"
                  required
                  value={prodImageUrl}
                  onChange={(e) => setProdImageUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <textarea
                  rows={3}
                  required
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                ></textarea>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingProd}
                  className="w-full gradient-button text-white font-bold py-3 rounded-xl shadow-sm"
                >
                  {savingProd ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default VendorDashboardPage;
