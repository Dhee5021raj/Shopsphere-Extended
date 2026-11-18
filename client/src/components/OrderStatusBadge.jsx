import React from 'react';
import { Clock, CheckCircle2, Truck, XCircle } from 'lucide-react';

const STYLES = {
  Delivered: ['bg-emerald-50 text-emerald-700 border-emerald-200', CheckCircle2],
  Shipped: ['bg-teal-50 text-teal-700 border-teal-200', Truck],
  Cancelled: ['bg-rose-50 text-rose-700 border-rose-200', XCircle]
};

// Pending / Confirmed / Processing all render as "Processing" for customers.
const OrderStatusBadge = ({ status }) => {
  const [cls, Icon] = STYLES[status] || ['bg-amber-50 text-amber-700 border-amber-200', Clock];
  const label = STYLES[status] ? status : 'Processing';
  return (
    <span className={`px-3 py-1 rounded-full border text-xs font-bold inline-flex items-center gap-1 ${cls}`}>
      <Icon size={13} aria-hidden="true" /> {label}
    </span>
  );
};

export default OrderStatusBadge;
