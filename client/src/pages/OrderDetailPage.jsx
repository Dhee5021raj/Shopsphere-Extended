import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, CreditCard, Store, Star, Check } from 'lucide-react';
import api from '../services/api';
import OrderStatusBadge from '../components/OrderStatusBadge';

const STEPS = ['Placed', 'Processing', 'Shipped', 'Delivered'];
const STEP_OF = { Pending: 0, Confirmed: 0, Processing: 1, Shipped: 2, Delivered: 3 };
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Per-item progress tracker; cancelled items show a single cancelled state.
const ItemProgress = ({ status }) => {
  if (status === 'Cancelled') {
    return <p className="text-[11px] font-bold text-rose-600">This item was cancelled</p>;
  }
  const current = STEP_OF[status] ?? 0;
  return (
    <ol className="flex items-center w-full" aria-label={`Item status: ${status}`}>
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  done ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-400'
                }`}
                aria-current={i === current ? 'step' : undefined}
              >
                {done ? <Check size={12} aria-hidden="true" /> : i + 1}
              </span>
              <span className={`text-[10px] font-semibold ${done ? 'text-emerald-700' : 'text-slate-400'}`}>{step}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`flex-1 h-0.5 mx-1 mb-4 ${i < current ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
};

const OrderDetailPage = ({ onToast }) => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/orders/${id}`)
      .then(({ data }) => { if (active) setOrder(data); })
      .catch((err) => {
        if (!active) return;
        const status = err.response?.status;
        setError(status === 403 || status === 404 ? 'Order not found.' : 'Could not load this order. Please try again.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const handleCancel = async () => {
    if (!window.confirm('Cancel all items in this order that have not shipped yet?')) return;
    setCancelling(true);
    try {
      const { data } = await api.put(`/orders/${id}/cancel`);
      // The cancel response populates fewer fields; keep the richer product data.
      setOrder((prev) => ({
        ...prev,
        orderStatus: data.order.orderStatus,
        paymentStatus: data.order.paymentStatus,
        items: prev.items.map((it) => ({ ...it, status: data.order.items.find((x) => x._id === it._id)?.status || it.status }))
      }));
      if (onToast) onToast(data.message || 'Order cancelled');
    } catch (err) {
      if (onToast) onToast(err.response?.data?.message || 'Cancel failed', 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-sm text-slate-500">Loading order…</div>;
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-base font-bold text-slate-800">{error || 'Order not found.'}</p>
        <Link to="/dashboard" className="text-xs font-bold text-emerald-600 hover:text-emerald-700">Back to my orders</Link>
      </div>
    );
  }

  const itemsSubtotal = order.items.reduce((s, it) => s + it.price * it.quantity, 0);
  const extras = Math.max(0, order.totalAmount - itemsSubtotal);
  const canCancel = order.orderStatus === 'Pending' || order.orderStatus === 'Processing';
  const addr = order.shippingAddress || {};

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-emerald-600">
        <ArrowLeft size={14} aria-hidden="true" /> My orders
      </Link>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-slate-900">Order details</h1>
          <p className="text-xs text-slate-500 mt-1 break-all">
            Order <span className="font-mono font-bold text-slate-800">{order._id}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Placed on {new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={order.orderStatus} />
          <span className="text-lg font-extrabold text-slate-900">{inr(order.totalAmount)}</span>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4" aria-labelledby="items-heading">
        <h2 id="items-heading" className="text-sm font-bold text-slate-900">Items ({order.items.length})</h2>
        <ul className="space-y-4">
          {order.items.map((item) => {
            const productId = item.product?._id || item.product;
            return (
              <li key={item._id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <img
                      src={item.product?.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=150'}
                      alt=""
                      className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                    />
                    <div className="min-w-0">
                      {item.product ? (
                        <Link to={`/products/${productId}`} className="text-sm font-bold text-slate-900 hover:text-emerald-600 line-clamp-2">
                          {item.name}
                        </Link>
                      ) : (
                        <span className="text-sm font-bold text-slate-900">{item.name}</span>
                      )}
                      <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                        <Store size={12} aria-hidden="true" />
                        {item.vendor?.storeSlug ? (
                          <Link to={`/store/${item.vendor.storeSlug}`} className="hover:underline">{item.vendor.storeName}</Link>
                        ) : (
                          <span>{item.vendor?.storeName || 'Seller'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-slate-900">{inr(item.price * item.quantity)}</div>
                    <div className="text-[11px] text-slate-500">{item.quantity} × {inr(item.price)}</div>
                  </div>
                </div>
                <ItemProgress status={item.status} />
                {item.status === 'Delivered' && item.product && (
                  <Link
                    to={`/products/${productId}#reviews`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700"
                  >
                    <Star size={13} aria-hidden="true" /> Write a review
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-2" aria-labelledby="ship-heading">
          <h2 id="ship-heading" className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <MapPin size={16} className="text-emerald-600" aria-hidden="true" /> Shipping address
          </h2>
          <address className="not-italic text-xs text-slate-600 leading-relaxed">
            {addr.street}<br />
            {addr.city}{addr.state ? `, ${addr.state}` : ''} {addr.zipCode}<br />
            {addr.country}
          </address>
        </section>

        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3" aria-labelledby="pay-heading">
          <h2 id="pay-heading" className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CreditCard size={16} className="text-emerald-600" aria-hidden="true" /> Payment
          </h2>
          <dl className="text-xs space-y-1.5">
            <div className="flex justify-between"><dt className="text-slate-500">Method</dt><dd className="font-semibold text-slate-800">{order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentMethod}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-semibold text-slate-800">{order.paymentStatus}</dd></div>
            <div className="flex justify-between pt-2 border-t border-slate-100"><dt className="text-slate-500">Items subtotal</dt><dd className="text-slate-800">{inr(itemsSubtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Shipping &amp; GST</dt><dd className="text-slate-800">{inr(extras)}</dd></div>
            <div className="flex justify-between font-bold text-sm pt-2 border-t border-slate-100"><dt>Order total</dt><dd>{inr(order.totalAmount)}</dd></div>
          </dl>
        </section>
      </div>

      {canCancel && (
        <div className="text-right">
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 border border-rose-200 hover:bg-rose-50 px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {cancelling ? 'Cancelling…' : 'Cancel unshipped items'}
          </button>
        </div>
      )}
    </div>
  );
};

export default OrderDetailPage;
