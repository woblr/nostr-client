"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SearchBar from '@/components/SearchBar';
import SearchResults from '@/components/SearchResults';
import { useSearch } from '@/hooks/useSearch';
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

function SearchPageContent() {
  const searchParams = useSearchParams();
  const queryParam = searchParams?.get('q') || '';
  const [debouncedQuery, setDebouncedQuery] = useState(queryParam);
  const [showWelcome, setShowWelcome] = useState(!queryParam);
  
  const {
    query,
    results,
    isLoading,
    error,
    search,
    resetSearch,
    activeTab,
    setActiveTab
  } = useSearch();
  
  // Handle initial query from URL with a single search execution
  useEffect(() => {
    if (queryParam) {
      setDebouncedQuery(queryParam);
      // We'll let the debounced query effect handle the actual search
    }
  }, [queryParam]);
  
  // Execute search when debounced query changes, with a slight delay
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (debouncedQuery) {
      // Short delay to avoid flickering during typing
      timer = setTimeout(() => {
        search(debouncedQuery);
      }, 100);
    } else {
      resetSearch();
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [debouncedQuery, search, resetSearch]);
  
  // Initial search on mount if query exists
  useEffect(() => {
    if (queryParam) {
      search(queryParam);
    }
  }, []);
  
  // Handle search manually (from search bar)
  const handleSearch = (query: string) => {
    setDebouncedQuery(query);
    setShowWelcome(false);
    
    // Update URL with search query
    const url = new URL(window.location.href);
    url.searchParams.set('q', query);
    window.history.pushState({}, '', url);
  };
  
  // Welcome view component
  const WelcomeView = () => (
    <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-8 animate-fade-in">
      <div className="mx-auto w-16 h-16 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center mb-6">
        <MagnifyingGlassIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h2 className="text-xl font-bold mb-4 text-center dark:text-white">Decentralized Nostr Search</h2>
      <p className="text-gray-600 dark:text-gray-300 mb-8 text-center">
        Search across the Nostr network using the search bar above.
      </p>
      
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
          <h3 className="font-medium mb-2 dark:text-white">Find Users</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Search by username, npub, or NIP-05 identifier to find user profiles
          </p>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
          <h3 className="font-medium mb-2 dark:text-white">Discover Posts</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Search for keywords, phrases, or specific note IDs
          </p>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
          <h3 className="font-medium mb-2 dark:text-white">Explore Hashtags</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter # followed by a topic to find trending hashtags
          </p>
        </div>
      </div>
    </div>
  );
  
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Search</h1>
        
        <div className="max-w-2xl">
          <SearchBar
            onSearch={handleSearch}
            onClear={resetSearch}
            initialQuery={queryParam}
            expandable={false}
            className="w-full"
          />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Search for users, posts, hashtags, or enter an npub/note identifier
          </p>
        </div>
      </div>
      
      {showWelcome && !debouncedQuery ? (
        <WelcomeView />
      ) : debouncedQuery ? (
        <SearchResults
          results={results}
          isLoading={isLoading}
          error={error}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onRefresh={() => search(debouncedQuery)}
        />
      ) : (
        <div className="text-center py-16">
          <div className="mx-auto h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <MagnifyingGlassIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Enter a search term
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Try searching for usernames, hashtags, or keywords.
            You can also search directly for Nostr identifiers like npub1... or note1...
          </p>
        </div>
      )}
    </div>
  );
};

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading search...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}
