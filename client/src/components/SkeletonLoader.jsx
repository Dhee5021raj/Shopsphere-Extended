import React from 'react';

export const ProductSkeleton = () => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 animate-pulse shadow-sm">
    <div className="w-full h-48 bg-slate-100 rounded-xl mb-4"></div>
    <div className="h-4 bg-slate-100 rounded w-3/4 mb-2"></div>
    <div className="h-3 bg-slate-100 rounded w-1/2 mb-4"></div>
    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
      <div className="h-5 bg-slate-100 rounded w-1/3"></div>
      <div className="h-9 bg-slate-100 rounded-xl w-24"></div>
    </div>
  </div>
);

export const DashboardCardSkeleton = () => (
  <div className="bg-white border border-slate-200 rounded-2xl p-6 animate-pulse shadow-sm">
    <div className="h-4 bg-slate-100 rounded w-1/3 mb-4"></div>
    <div className="h-8 bg-slate-100 rounded w-1/2 mb-2"></div>
    <div className="h-3 bg-slate-100 rounded w-2/3"></div>
  </div>
);
