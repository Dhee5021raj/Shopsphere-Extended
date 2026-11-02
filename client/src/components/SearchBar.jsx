import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';

const SearchBar = ({ onSearch, initialQuery = '' }) => {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="absolute left-4 text-slate-400" size={20} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products across vendors (e.g. 'Laptop', 'Earbuds', 'Leather', 'Serum')..."
          className="w-full bg-white border border-slate-300 rounded-2xl py-3.5 pl-12 pr-28 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm transition-all"
        />
        <div className="absolute right-2 flex items-center gap-2">
          <button
            type="submit"
            className="gradient-button text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
          >
            <Sparkles size={14} />
            <span>Search</span>
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 px-3 text-[11px] text-slate-500">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>Powered by <strong>MongoDB Text Index</strong> full-text search engine</span>
      </div>
    </form>
  );
};

export default SearchBar;
