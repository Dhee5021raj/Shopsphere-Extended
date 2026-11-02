import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, CreditCard, Truck, CheckCircle2, Lock, Sparkles, Building2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

const CheckoutPage = ({ onToast }) => {
  const { cart, processCheckout } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [shippingAddress, setShippingAddress] = useState({
    street: user?.addresses?.[0]?.street || '42 Tech Park Avenue',
    city: user?.addresses?.[0]?.city || 'Bengaluru',
    state: user?.addresses?.[0]?.state || 'Karnataka',
    zipCode: user?.addresses?.[0]?.zipCode || '560100',
    country: 'India'
  });

  const [paymentMethod, setPaymentMethod] = useState('Card');
  const [processing, setProcessing] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  const handleSubmitCheckout = async (e) => {
    e.preventDefault();
    setProcessing(true);

    try {
      const result = await processCheckout(shippingAddress, paymentMethod);
      setSuccessResult(result);
      if (onToast) onToast('Order completed via MongoDB ACID Transaction!');
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Checkout transaction aborted', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (successResult) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm animate-in zoom-in-95">
          <CheckCircle2 size={44} />
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold uppercase tracking-wider">
            {successResult.transactionStatus || 'COMMITTED_TRANSACTION'}
          </span>
          <h2 className="text-3xl font-extrabold text-slate-900">Order Confirmed!</h2>
          <p className="text-xs text-slate-500">
            Order ID: <span className="text-slate-900 font-mono font-bold">{successResult.order._id}</span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 text-left space-y-4 text-xs shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-slate-500">Total Amount Paid</span>
            <span className="text-base font-extrabold text-slate-900">₹{successResult.order.totalAmount?.toLocaleString('en-IN')}</span>
          </div>

          <div>
            <h4 className="font-bold text-slate-700 uppercase mb-2">Ordered Multi-Vendor Items</h4>
            <div className="space-y-2">
              {successResult.order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <div className="font-bold text-slate-900">{item.name}</div>
                    <div className="text-[11px] text-emerald-600 font-medium">Seller: {item.vendor?.storeName || 'Vendor'}</div>
                  </div>
                  <div className="font-bold text-slate-800">
                    {item.quantity} x ₹{item.price?.toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 gradient-button text-white font-bold py-3.5 rounded-2xl shadow-sm"
          >
            Track Order History
          </button>
          <button
            onClick={() => navigate('/products')}
            className="flex-1 py-3.5 rounded-2xl bg-white text-slate-700 border border-slate-200 font-bold hover:bg-slate-50 shadow-sm transition-colors"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Multi-Vendor Checkout</span>
        <h1 className="text-3xl font-extrabold text-slate-900">Complete Your Order</h1>
      </div>

      <form onSubmit={handleSubmitCheckout} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Form: Shipping Address & Payment */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Address Box */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
              <Truck size={20} className="text-emerald-600" />
              <span>1. Shipping Address</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-medium mb-1">Street Address</label>
                <input
                  type="text"
                  required
                  value={shippingAddress.street}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">City</label>
                <input
                  type="text"
                  required
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">State</label>
                <input
                  type="text"
                  required
                  value={shippingAddress.state}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">PIN / Zip Code</label>
                <input
                  type="text"
                  required
                  value={shippingAddress.zipCode}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, zipCode: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Country</label>
                <input
                  type="text"
                  readOnly
                  value="India"
                  className="w-full bg-slate-100 border border-slate-200 text-slate-500 rounded-xl p-3 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Payment Method Box */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
              <CreditCard size={20} className="text-emerald-600" />
              <span>2. Payment Option</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {['Card', 'UPI', 'COD'].map((method) => (
                <button
                  type="button"
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`p-4 rounded-2xl border text-center transition-all ${
                    paymentMethod === method
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-500 font-bold shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm">{method === 'Card' ? 'Credit / Debit Card' : method === 'UPI' ? 'Instant UPI' : 'Cash on Delivery'}</div>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right Summary & ACID Transaction Trigger */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 sticky top-28 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Checkout Total</h3>
              <span className="text-xs font-bold text-emerald-600">Atomic Transaction</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-bold text-slate-900">₹{cart.subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST Tax (18%)</span>
                <span className="font-bold text-slate-900">₹{cart.tax.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Shipping</span>
                <span className="font-bold text-emerald-600">
                  {cart.shipping === 0 ? 'FREE' : `₹${cart.shipping}`}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <span className="text-base font-bold text-slate-900">Total Amount</span>
                <span className="text-2xl font-black text-emerald-600">₹{cart.total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={processing}
              className="w-full gradient-button text-white font-extrabold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-brand-500/25 disabled:opacity-50"
            >
              <Lock size={18} />
              <span>{processing ? 'Running ACID Session Transaction...' : 'Place Order (Commit Transaction)'}</span>
            </button>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1">
                <Sparkles size={13} className="text-amber-500" />
                <span>MongoDB ACID Transaction Notice</span>
              </div>
              <p>
                Submitting executes <code className="text-emerald-700 font-mono font-semibold">session.startTransaction()</code> in Express backend. If any seller stock check fails, all database changes automatically rollback!
              </p>
            </div>
          </div>
        </div>

      </form>

    </div>
  );
};

export default CheckoutPage;
