"use client";

import { useState, useEffect } from 'react';
import { SearchResult, SearchResultType } from '@/types/search';
import Avatar from './Avatar';
import NoteCard from './NoteCard';
import Link from 'next/link';
import { CheckCircleIcon, PlusIcon, HashtagIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { nip19 } from 'nostr-tools';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  activeTab: SearchResultType;
  onTabChange: (tab: SearchResultType) => void;
  onRefresh?: () => void;
}

export default function SearchResults({
  results,
  isLoading,
  error,
  activeTab,
  onTabChange,
  onRefresh
}: SearchResultsProps) {
  const [userResults, setUserResults] = useState<SearchResult[]>([]);
  const [postResults, setPostResults] = useState<SearchResult[]>([]);
  const [hashtagResults, setHashtagResults] = useState<SearchResult[]>([]);
  
  useEffect(() => {
    // Filter results by type
    setUserResults(results.filter(result => result.type === 'user'));
    setPostResults(results.filter(result => result.type === 'post'));
    setHashtagResults(results.filter(result => result.type === 'hashtag'));
  }, [results]);

  const tabs: { key: SearchResultType; label: string; count: number }[] = [
    { key: 'user', label: 'Users', count: userResults.length },
    { key: 'post', label: 'Posts', count: postResults.length },
    { key: 'hashtag', label: 'Hashtags', count: hashtagResults.length },
  ];

  // Render states in a fixed-height container to prevent layout shifts
  const renderStateContainer = () => {
    // Create a stable container that maintains height
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        {renderStateContent()}
      </div>
    );
  };

  // Render the appropriate state content
  const renderStateContent = () => {
    // Always show error first if present
    if (error) {
      return (
        <div className="text-center py-10 animate-fade-in w-full">
          <p className="text-red-500">{error}</p>
          <button
            onClick={onRefresh}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Try Again
          </button>
        </div>
      );
    }

    // Show loading state only when absolutely no results and loading
    if (isLoading && results.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 animate-fade-in w-full">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">Searching across the Nostr network...</p>
        </div>
      );
    }

    // Show no results found when not loading and no results
    if (results.length === 0 && !isLoading) {
      return (
        <div className="text-center py-10 animate-fade-in w-full">
          <p className="text-gray-500 dark:text-gray-400">No results found</p>
          <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
            Try a different search term or check your connected relays
          </p>
        </div>
      );
    }

    // If we have results to show, return null to allow rendering the results
    return null;
  };

  // Render user results
  const renderUserResults = () => {
    if (activeTab !== 'user' || userResults.length === 0) return null;

    return (
      <div className="space-y-4">
        {userResults.map((result, index) => {
          const user = result;
          if (user.type !== 'user') return null;

          const npub = nip19.npubEncode(user.pubkey);
          
          return (
            <Link
              href={`/profile/${npub}`}
              key={user.id}
              className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors animate-slide-in stagger-item transition-all-smooth"
            >
              <Avatar
                size={48}
                picture={user.picture || ""}
                pubkey={user.pubkey}
                className="shrink-0"
              />
              <div className="ml-4 flex-1">
                <div className="flex items-center">
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    {user.displayName || user.name || "Anonymous"}
                  </h3>
                  {user.nip05 && (
                    <div className="ml-2 flex items-center text-xs text-green-600 dark:text-green-400">
                      <CheckCircleIcon className="h-4 w-4 mr-1" />
                      {user.nip05}
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {npub.slice(0, 8)}...{npub.slice(-4)}
                </p>
                {user.about && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                    {user.about}
                  </p>
                )}
              </div>
              <button className="ml-2 p-1 text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors">
                <PlusIcon className="h-5 w-5" />
              </button>
            </Link>
          );
        })}
      </div>
    );
  };

  // Render post results
  const renderPostResults = () => {
    if (activeTab !== 'post' || postResults.length === 0) return null;

    return (
      <div className="space-y-4 transition-all-smooth">
        {postResults.map((result, index) => {
          const post = result;
          if (post.type !== 'post') return null;

          return (
            <div key={post.id} className="border-b border-gray-200 dark:border-gray-700 pb-4 animate-slide-in stagger-item">
              <NoteCard event={post.event} />
            </div>
          );
        })}
      </div>
    );
  };

  // Render hashtag results
  const renderHashtagResults = () => {
    if (activeTab !== 'hashtag' || hashtagResults.length === 0) return null;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 transition-all-smooth">
        {hashtagResults.map((result, index) => {
          const hashtag = result;
          if (hashtag.type !== 'hashtag') return null;

          return (
            <Link
              href={`/search?q=%23${hashtag.tag}`}
              key={hashtag.id}
              className="flex items-center p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors animate-slide-in stagger-item"
            >
              <HashtagIcon className="h-5 w-5 text-indigo-500 mr-2" />
              <span className="font-medium">#{hashtag.tag}</span>
              {typeof hashtag.count === 'number' && hashtag.count > 0 && (
                <span className="ml-auto bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full text-xs">
                  {hashtag.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow transition-all-smooth">
      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`whitespace-nowrap py-4 px-4 border-b-2 font-medium text-sm flex-1 text-center ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                    activeTab === tab.key
                      ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {tab.count.toString()}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Results Container - Fixed height to prevent layout shifts */}
      <div className="relative min-h-[300px]">
        {/* Status Messages Container - Absolute positioned */}
        {(results.length === 0 || error) && (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center p-4">
            {renderStateContainer()}
          </div>
        )}
        
        {/* Results Content - Only visible when we have results */}
        <div className={`p-4 ${results.length === 0 ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
          {renderUserResults()}
          {renderPostResults()}
          {renderHashtagResults()}
        </div>
      </div>
    </div>
  );
}
