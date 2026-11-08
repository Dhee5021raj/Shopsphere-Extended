import React, { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, X } from 'lucide-react';

const SearchBar = ({ onSearch, initialQuery = '', debounceMs = 400, autoSearch = true }) => {
  const [query, setQuery] = useState(initialQuery);
  const debounceTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  // Synchronize internal query state if initialQuery changes externally (e.g. filter reset)
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (autoSearch && onSearch) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          onSearch(value.trim());
        }
      }, debounceMs);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (onSearch) {
      onSearch(query.trim());
    }
  };

  const handleClear = () => {
    setQuery('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (onSearch) {
      onSearch('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="absolute left-4 text-slate-400" size={20} />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search products across vendors (e.g. 'Laptop', 'Earbuds', 'Leather', 'Serum')..."
          className="w-full bg-white border border-slate-300 rounded-2xl py-3.5 pl-12 pr-32 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm transition-all"
        />
        <div className="absolute right-2 flex items-center gap-1.5">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
          <button
            type="submit"
            className="gradient-button text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
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
