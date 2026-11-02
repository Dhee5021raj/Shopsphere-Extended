import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';

import HomePage from './pages/HomePage';
import ProductDiscoveryPage from './pages/ProductDiscoveryPage';
import ProductDetailPage from './pages/ProductDetailPage';
import VendorStorefrontPage from './pages/VendorStorefrontPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import WishlistPage from './pages/WishlistPage';
import CustomerDashboardPage from './pages/CustomerDashboardPage';
import VendorDashboardPage from './pages/VendorDashboardPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import PtLogPage from './pages/PtLogPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

function App() {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  return (
    <Router>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-brand-500 selection:text-white">
              
              {/* Toast Notification Alert */}
              {toast && (
                <div
                  className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md text-xs font-bold border transition-all animate-in slide-in-from-bottom-5 ${
                    toast.type === 'error'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-rose-500/10'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
                    <span>{toast.message}</span>
                  </div>
                </div>
              )}

              <Navbar onToast={showToast} />

              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<HomePage onToast={showToast} />} />
                  <Route path="/products" element={<ProductDiscoveryPage onToast={showToast} />} />
                  <Route path="/products/:id" element={<ProductDetailPage onToast={showToast} />} />
                  <Route path="/store/:slug" element={<VendorStorefrontPage onToast={showToast} />} />
                  <Route path="/vendors" element={<HomePage onToast={showToast} />} />
                  <Route path="/cart" element={<CartPage onToast={showToast} />} />

                  {/* Protected Routes */}
                  <Route
                    path="/checkout"
                    element={
                      <ProtectedRoute>
                        <CheckoutPage onToast={showToast} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/wishlist"
                    element={
                      <ProtectedRoute>
                        <WishlistPage onToast={showToast} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <CustomerDashboardPage onToast={showToast} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/vendor/dashboard"
                    element={
                      <ProtectedRoute allowedRoles={['vendor', 'admin']}>
                        <VendorDashboardPage onToast={showToast} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/dashboard"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminDashboardPage onToast={showToast} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/pt-log"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <PtLogPage onToast={showToast} />
                      </ProtectedRoute>
                    }
                  />

                  {/* Auth Routes */}
                  <Route path="/login" element={<LoginPage onToast={showToast} />} />
                  <Route path="/register" element={<RegisterPage onToast={showToast} />} />
                  <Route path="/register-vendor" element={<RegisterPage onToast={showToast} />} />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>

              <Footer />

            </div>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
