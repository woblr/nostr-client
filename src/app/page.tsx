'use client';
import { useEffect, useState } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { useUserStore } from '@/store/useUserStore';
import ComposeNote from '@/components/ComposeNote';
import NoteSkeleton from '@/components/NoteSkeleton';
import NoteCard from '@/components/NoteCard';
import { UserIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { AnyNostrEvent, NostrEvent } from '@/types/nostr';

export default function HomePage() {
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { manager } = useRelay();
  
  // Get user's public key
  const pubkey = useUserStore(state => {
    const activeAccountId = state.activeAccountId;
    if (!activeAccountId) return null;
    const account = state.accounts.find(a => a.id === activeAccountId);
    return account?.pubkey || null;
  });
  
  // User authentication status
  const isLoggedIn = !!pubkey;

  // Direct subscription to global feed (most reliable approach)
  useEffect(() => {
    if (refreshing) return; // Don't subscribe while refreshing
    
    setLoading(true);
    setEvents([]);
    
    // Connect to popular relays
    const popularRelays = [
      'wss://relay.damus.io',
      'wss://nostr.wine',
      'wss://relay.nostr.band',
      'wss://nos.lol'
    ];
    popularRelays.forEach(relay => manager.addRelay(relay));
    
    // Simple global feed subscription - most reliable method
    const feedId = `home-feed-${Date.now()}`;
    manager.subscribe(feedId, {
      kinds: [1], // Only get text notes
      limit: 30,
      since: Math.floor(Date.now() / 1000) - 86400 // Last 24 hours
    }, (event: AnyNostrEvent) => {
      if (event.kind === 1) {
        setEvents(prev => {
          // Don't add duplicates
          if (prev.some(e => e.id === event.id)) return prev;
          
          // Add new event and sort by timestamp
          const updated = [...prev, event as NostrEvent].sort(
            (a, b) => b.created_at - a.created_at
          );
          
          // Keep only 30 most recent
          return updated.slice(0, 30);
        });
        setLoading(false);
      }
    });

    // Stop loading after 5 seconds even if we get no events
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => {
      clearTimeout(timeout);
      manager.unsubscribe(feedId);
    };
  }, [manager, refreshing]);

  // Function to refresh the feed
  const refreshFeed = () => {
    setRefreshing(true);
    
    // Close current subscriptions
    manager.close();
    
    // Wait a bit before restarting
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  return (
    <main className="max-w-2xl mx-auto p-4">
      {/* Compose Area */}
      <div className="mb-6">
        <ComposeNote />
      </div>
      
      {/* Feed Header with Status & Refresh */}
      <div className="flex flex-col mb-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-700 dark:text-gray-300">
            Global Feed
          </h2>
          <button
            onClick={refreshFeed}
            disabled={loading || refreshing}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
        
        {/* Feed Navigation */}
        <div className="flex mt-2 gap-2 overflow-x-auto pb-1">
          <Link href="/" 
            className="px-3 py-1 text-sm bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-full font-medium">
            Global
          </Link>
          
          <Link href="/feed"
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 rounded-full font-medium transition-colors">
            Following
          </Link>
          
          <Link href="/discover"
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 rounded-full font-medium transition-colors">
            Discover
          </Link>
        </div>
      </div>
      
      {/* Feed Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <NoteSkeleton key={i} />
          ))}
        </div>
      ) : events && events.length > 0 ? (
        <div className="space-y-4">
          {events.map(event => (
            <NoteCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="mt-8 text-center py-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-100 dark:border-gray-700/30">
          <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">Feed is empty</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            We couldn't find any posts to show you right now.
          </p>
          <div className="mt-6 space-y-2">
            <button 
              onClick={refreshFeed}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <ArrowPathIcon className={`mr-1 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> 
              Try Again
            </button>
            
            <Link 
              href="/discover"
              className="inline-flex items-center px-4 py-2 mt-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Explore Discover Page
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
