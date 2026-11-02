import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, Plus, Minus, Store, ArrowRight, ShieldCheck } from 'lucide-react';
import { useCart } from '../context/CartContext';

const CartPage = ({ onToast }) => {
  const { cart, updateQuantity, removeFromCart } = useCart();
  const navigate = useNavigate();

  const handleUpdate = async (productId, quantity) => {
    try {
      await updateQuantity(productId, quantity);
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Quantity update failed', 'error');
    }
  };

  const handleRemove = async (productId) => {
    try {
      await removeFromCart(productId);
      if (onToast) onToast('Item removed from cart');
    } catch (err) {
      if (onToast) onToast('Failed to remove item', 'error');
    }
  };

  if (!cart.items || cart.items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-white border border-slate-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
          <ShoppingBag size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-slate-900">Your Shopping Cart is Empty</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Explore items from independent sellers across Electronics, Fashion, Home Decor, and more.
          </p>
        </div>
        <Link to="/products" className="gradient-button text-white font-bold px-8 py-3.5 rounded-2xl inline-flex items-center gap-2 shadow-sm">
          <span>Start Shopping</span>
          <ArrowRight size={18} />
        </Link>
      </div>
    );
  }

  // Group items by Vendor to highlight Multi-Vendor structure
  const groupedByVendor = cart.items.reduce((acc, item) => {
    const vId = item.vendor?._id || item.product?.vendor?._id || 'unknown';
    const vName = item.vendor?.storeName || item.product?.vendor?.storeName || 'Vendor';
    if (!acc[vId]) {
      acc[vId] = { storeName: vName, items: [] };
    }
    acc[vId].items.push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Checkout Basket</span>
        <h1 className="text-3xl font-extrabold text-slate-900">Shopping Cart ({cart.items.length} items)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Cart Items grouped by Vendor */}
        <div className="lg:col-span-8 space-y-6">
          {Object.entries(groupedByVendor).map(([vId, group]) => (
            <div key={vId} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
              
              {/* Vendor Header Badge */}
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 text-sm font-bold text-emerald-700">
                <Store size={18} />
                <span>Seller: {group.storeName}</span>
              </div>

              {/* Items List */}
              <div className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <div key={item._id || item.product._id} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row items-center justify-between gap-4">
                    
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <img
                        src={item.product?.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300'}
                        alt={item.product?.name}
                        className="w-20 h-20 rounded-2xl object-cover bg-slate-50 border border-slate-200 shrink-0"
                      />
                      <div>
                        <Link to={`/products/${item.product._id}`} className="text-sm font-bold text-slate-900 hover:text-emerald-600 transition-colors line-clamp-1">
                          {item.product?.name}
                        </Link>
                        <div className="text-xs text-slate-500 mt-1">
                          Unit Price: ₹{item.priceAtAdd.toLocaleString('en-IN')}
                        </div>
                        {item.product?.stock <= 5 && (
                          <div className="text-[11px] text-amber-600 font-semibold mt-0.5">
                            Stock remaining: {item.product?.stock}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quantity Controls & Price */}
                    <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                      <div className="flex items-center rounded-xl bg-slate-100 border border-slate-200">
                        <button
                          onClick={() => handleUpdate(item.product._id, item.quantity - 1)}
                          className="p-2 text-slate-500 hover:text-slate-900"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="px-3 text-xs font-bold text-slate-900">{item.quantity}</span>
                        <button
                          onClick={() => handleUpdate(item.product._id, item.quantity + 1)}
                          className="p-2 text-slate-500 hover:text-slate-900"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-extrabold text-slate-900">
                          ₹{item.itemTotal.toLocaleString('en-IN')}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemove(item.product._id)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                  </div>
                ))}
              </div>

            </div>
          ))}
        </div>

        {/* Right Order Summary */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 sticky top-28 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 pb-3 border-b border-slate-100">Order Summary</h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal ({cart.items.length} items)</span>
                <span className="font-bold text-slate-900">₹{cart.subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Estimated Tax (18% GST)</span>
                <span className="font-bold text-slate-900">₹{cart.tax.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Shipping Fee</span>
                <span className="font-bold text-emerald-600">
                  {cart.shipping === 0 ? 'FREE' : `₹${cart.shipping}`}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-900">Total Amount</span>
                <span className="text-2xl font-black text-emerald-600">₹{cart.total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/checkout')}
              className="w-full gradient-button text-white font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-brand-500/25"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight size={18} />
            </button>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
              <span>Protected by MongoDB ACID Transaction rollback policy</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

export default CartPage;
