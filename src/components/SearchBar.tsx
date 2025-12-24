"use client";

import { useState, useRef, useEffect } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useRouter } from 'next/navigation';
// The hook is exported as a named export, not a default export
import { useOnClickOutside } from '../hooks/useOnClickOutside';

interface SearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  onClear?: () => void;
  initialQuery?: string;
  expandable?: boolean;
  className?: string;
}

export default function SearchBar({
  placeholder = "Search users, posts, hashtags...",
  onSearch,
  onClear,
  initialQuery = "",
  expandable = true,
  className = "",
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [expanded, setExpanded] = useState(!expandable || !!initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Handle outside click to collapse expandable search
  useOnClickOutside(containerRef, () => {
    if (expandable && !query) {
      setExpanded(false);
    }
  });

  // Update query when initialQuery changes
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = () => {
    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      if (onSearch) {
        onSearch(trimmedQuery);
      } else {
        // Navigate to search page with query
        const searchUrl = `/search?q=${encodeURIComponent(trimmedQuery)}`;
        console.log('Navigating to:', searchUrl);
        // Use window.location for a full page navigation to ensure it works
        window.location.href = searchUrl;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleClear = () => {
    setQuery('');
    if (onClear) {
      onClear();
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleFocus = () => {
    if (expandable) {
      setExpanded(true);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative flex items-center ${
        expanded ? "w-full max-w-md" : "w-10"
      } transition-all duration-200 ${className}`}
    >
      {!expanded ? (
        <button 
          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          onClick={() => {
            setExpanded(true);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
        </button>
      ) : (
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </div>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={placeholder}
            className="block w-full p-2 pl-10 pr-10 text-sm border rounded-lg bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 dark:placeholder-gray-400 dark:text-white"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
