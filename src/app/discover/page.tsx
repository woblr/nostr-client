"use client";
import { useState, useEffect } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { useUserStore } from '@/store/useUserStore';
import FollowRecommendations from '@/components/FollowRecommendations';
import { AnyNostrEvent, NostrEvent } from '@/types/nostr';
import NoteCard from '@/components/NoteCard';
import NoteSkeleton from '@/components/NoteSkeleton';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function DiscoverPage() {
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [recommendations, setRecommendations] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { manager } = useRelay();
  
  // Get current user pubkey from store
  const pubkey = useUserStore(state => {
    const activeAccountId = state.activeAccountId;
    if (!activeAccountId) return null;
    const account = state.accounts.find(a => a.id === activeAccountId);
    return account?.pubkey || null;
  });
  
  // Fetch recommendations
  useEffect(() => {
    if (refreshing) return;
    
    // Connect to popular relays for discovery
    const discoverRelays = [
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://purplepag.es',
      'wss://nos.lol',
      'wss://nostr.wine'
    ];
    
    discoverRelays.forEach(relay => manager.addRelay(relay));
    
    // Subscription for profile recommendations
    const profileSubId = `discover-profiles-${Date.now()}`;
    const profilesDeduper = new Set<string>();
    
    manager.subscribe(profileSubId, {
      kinds: [0], // Profile metadata
      limit: 25,
    }, (event: AnyNostrEvent) => {
      try {
        if (event.kind !== 0) return;
        
        // Parse profile metadata
        const meta = JSON.parse(event.content);
        
        // Only consider profiles with pictures and names
        if (meta.picture && 
            (meta.name || meta.display_name) && 
            !profilesDeduper.has(event.pubkey)) {
          
          profilesDeduper.add(event.pubkey);
          
          setRecommendations(prev => {
            // Avoid duplicates
            if (prev.some(p => p.pubkey === event.pubkey)) return prev;
            
            // Sort by creation time (newest first)
            return [...prev, event as NostrEvent]
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, 10); // Keep only top 10
          });
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });
    
    // Timeout to close profile subscription after 5 seconds
    const profileTimeout = setTimeout(() => {
      manager.unsubscribe(profileSubId);
    }, 5000);
    
    return () => {
      clearTimeout(profileTimeout);
      manager.unsubscribe(profileSubId);
    };
  }, [manager, refreshing]);
  
  // Fetch trending posts
  useEffect(() => {
    if (refreshing) return;
    
    setLoading(true);
    setEvents([]);
    
    // Connect to popular relays for discovery
    const discoverRelays = [
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://purplepag.es',
      'wss://nos.lol',
      'wss://nostr.wine'
    ];
    
    discoverRelays.forEach(relay => manager.addRelay(relay));
    
    // Subscribe to trending posts
    const feedId = `discover-feed-${Date.now()}`;
    
    manager.subscribe(feedId, {
      kinds: [1], // Only text notes
      limit: 40,
      since: Math.floor(Date.now() / 1000) - 86400 * 2 // Last 48 hours
    }, (event: AnyNostrEvent) => {
      if (event.kind === 1) {
        // Filter for posts with media or hashtags which are more engaging
        const hasHashtags = event.tags.some(tag => tag[0] === 't');
        const hasImages = event.content.includes('https://') && 
          /\.(jpg|jpeg|png|gif|webp)/i.test(event.content);
        
        // Add posts with media/hashtags or posts with higher engagement
        if (hasHashtags || hasImages) {
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
  
  // Calculate if we show the top banner with follow suggestions
  const shouldShowTopRecommendations = recommendations.length > 0;
  
  return (
    <main className="max-w-2xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">Discover</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Find interesting people to follow and engaging content across Nostr.
        </p>
      </div>
      
      {/* Follow Recommendations */}
      {shouldShowTopRecommendations && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">Suggested People to Follow</h2>
          <FollowRecommendations 
            recommendations={recommendations.slice(0, 5)} 
            onDismiss={() => {}} 
          />
        </div>
      )}
      
      {/* Discover Posts Feed */}
      {/* Feed Navigation */}
      <div className="flex mt-2 mb-4 gap-2 overflow-x-auto pb-1">
        <Link href="/" 
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 rounded-full font-medium transition-colors">
          Global
        </Link>
        
        <Link href="/feed"
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 rounded-full font-medium transition-colors">
          Following
        </Link>
        
        <Link href="/discover"
          className="px-3 py-1 text-sm bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-full font-medium">
          Discover
        </Link>
      </div>
      
      <div className="my-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Popular Posts</h2>
          
          {!loading && (
            <button 
              onClick={refreshFeed}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
              disabled={refreshing}
            >
              <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>
        
        {/* Loading state */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <NoteSkeleton key={i} />
            ))}
          </div>
        )}
        
        {/* Posts */}
        {!loading && events.length > 0 && (
          <div className="space-y-4">
            {events.map((post: NostrEvent) => (
              <div key={post.id} className="post-card-container">
                <NoteCard event={post} />
              </div>
            ))}
          </div>
        )}
        
        {/* Empty state */}
        {!loading && events.length === 0 && (
          <div className="py-10 text-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-100 dark:border-gray-700/30">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No posts found</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Try refreshing or check back later for interesting content.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
