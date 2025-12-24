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

export default function FollowerFeedPage() {
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contacts, setContacts] = useState<string[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { manager } = useRelay();
  
  // Get user's public key
  const pubkey = useUserStore(state => {
    const activeAccountId = state.activeAccountId;
    if (!activeAccountId) return null;
    const account = state.accounts.find(a => a.id === activeAccountId);
    return account?.pubkey || null;
  });

  // User authentication check
  const isLoggedIn = !!pubkey;

  // First, fetch the user's contact list
  useEffect(() => {
    if (!pubkey || refreshing) return;
    
    console.log('Fetching contacts for pubkey:', pubkey);
    setLoading(true);
    setError(null);
    setContactsLoaded(false);
    
    // Try multiple relay groups to maximize chances of finding contacts
    const relayGroups = [
      // Group 1: Fast and reliable relays
      ['wss://relay.damus.io', 'wss://nos.lol', 'wss://nostr.wine'],
      // Group 2: Additional relays with good contact data
      ['wss://relay.nostr.band', 'wss://purplepag.es', 'wss://relay.current.fyi']
    ];
    
    // Connect to all relays
    relayGroups.flat().forEach(relay => manager.addRelay(relay));
    
    let contactsFound = false;
    const contactsId = `contacts-fetch-${Date.now()}`;
    
    // Try to fetch contacts with a 10-second timeout
    const fetchContactsWithTimeout = () => {
      return new Promise<string[]>((resolve) => {
        const foundContacts: string[] = [];
        
        manager.subscribe(contactsId, {
          kinds: [3], // Contact lists
          authors: [pubkey],
          limit: 2 // Allow for multiple contact lists in case there are updates
        }, (event: AnyNostrEvent) => {
          if (event.kind === 3) {
            contactsFound = true;
            
            const contactPubkeys = event.tags
              .filter(tag => tag[0] === 'p')
              .map(tag => tag[1]);
            
            console.log(`Found ${contactPubkeys.length} contacts in event ${event.id}`);
            
            // Merge with existing contacts (might get multiple contact events)
            foundContacts.push(...contactPubkeys);
            
            // Update the state with what we have so far
            // Use a Set to deduplicate
            const uniqueContacts = [...new Set(foundContacts)];
            setContacts(uniqueContacts);
            
            if (uniqueContacts.length > 0) {
              setContactsLoaded(true);
            }
          }
        });
        
        // Resolve after 10 seconds with whatever contacts we found
        setTimeout(() => {
          // Deduplicate contacts before resolving
          const uniqueContacts = [...new Set(foundContacts)];
          resolve(uniqueContacts);
        }, 10000);
      });
    };
    
    // Execute the fetch and handle the result
    fetchContactsWithTimeout().then(contacts => {
      // Update UI based on results
      console.log(`Finished contact fetch with ${contacts.length} contacts`);
      setContactsLoaded(true);
      
      // Close the subscription when done
      manager.unsubscribe(contactsId);
      
      // If no contacts were found, make sure state reflects that
      if (!contactsFound) {
        console.log('No contacts found within timeout');
        setContacts([]);
      }
    }).catch(err => {
      console.error('Error fetching contacts:', err);
      setError('Failed to fetch contacts');
      setContacts([]);
      setContactsLoaded(true);
      manager.unsubscribe(contactsId);
    });
    
    // Cleanup function
    return () => {
      manager.unsubscribe(contactsId);
    };
  }, [pubkey, manager, refreshing]);
  
  // Then, use the contact list to fetch posts
  useEffect(() => {
    // Only run this effect when contacts have been loaded and user is logged in
    if (!isLoggedIn || refreshing || !contactsLoaded) {
      return;
    }
    
    console.log('Starting post subscription with contacts:', contacts.length);
    
    // Clear previous posts when starting a new subscription
    setEvents([]);
    setError(null);
    
    // If no contacts, don't try to fetch posts
    if (contacts.length === 0) {
      setLoading(false);
      console.log('No contacts to fetch posts from');
      return;
    }
    
    setLoading(true);
    
    // Use multiple relay groups for redundancy - we'll try all of them
    const relayGroups = [
      // Group 1: Primary relays
      ['wss://relay.damus.io', 'wss://nos.lol', 'wss://nostr.wine'],
      // Group 2: Backup relays
      ['wss://relay.nostr.band', 'wss://purplepag.es', 'wss://relay.current.fyi']
    ];
    
    // Connect to all relays to maximize chance of finding posts
    relayGroups.flat().forEach(relay => {
      try {
        manager.addRelay(relay);
      } catch (e) {
        console.warn(`Failed to add relay ${relay}:`, e);
      }
    });
    
    // Instead of trying to subscribe to all contacts at once (which might be too many),
    // split them into smaller chunks to improve stability
    const CHUNK_SIZE = 50;
    const contactChunks: string[][] = [];
    
    // Split contacts into manageable chunks
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      contactChunks.push(contacts.slice(i, i + CHUNK_SIZE));
    }
    
    console.log(`Split ${contacts.length} contacts into ${contactChunks.length} chunks`);
    
    // Use a unique ID prefix for subscription tracking
    const feedIdPrefix = `follower-feed-${Date.now()}`;
    const subIds: string[] = [];
    
    // Batching mechanism to reduce UI updates
    let batchedEvents: NostrEvent[] = [];
    let batchTimeout: NodeJS.Timeout | null = null;
    
    // Function to process batched events and update UI
    const processBatch = () => {
      if (batchedEvents.length > 0) {
        setEvents(prev => {
          // Filter out duplicates
          const newEvents = batchedEvents.filter(
            e => !prev.some(p => p.id === e.id)
          );
          
          // If no new events, don't update state
          if (newEvents.length === 0) return prev;
          
          // Log found posts
          console.log(`Adding ${newEvents.length} new posts to feed`);
          
          // Combine previous and new events, sort by time, and limit
          const updated = [...prev, ...newEvents]
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, 100); // Keep more posts in memory
          
          return updated;
        });
        
        // Clear batch
        batchedEvents = [];
        
        // No longer loading once we have events
        setLoading(false);
      }
    };
    
    // Create one subscription per chunk to avoid overload
    contactChunks.forEach((chunk, i) => {
      // Create a unique ID for each subscription
      const subId = `${feedIdPrefix}-${i}`;
      subIds.push(subId);
      
      console.log(`Creating subscription ${subId} for ${chunk.length} contacts`);
      
      try {
        manager.subscribe(subId, {
          kinds: [1], // Only get text notes
          authors: chunk,
          limit: 25, // Smaller limit per subscription
          since: Math.floor(Date.now() / 1000) - 86400 * 7 // Last week
        }, (event: AnyNostrEvent) => {
          if (event.kind === 1) {
            // Add to batch
            batchedEvents.push(event as NostrEvent);
            
            // Schedule batch processing
            if (!batchTimeout) {
              batchTimeout = setTimeout(() => {
                processBatch();
                batchTimeout = null;
              }, 500);
            }
          }
        });
      } catch (err) {
        console.error(`Error creating subscription ${subId}:`, err);
      }
    });
    
    // Stop loading after 10 seconds even if we get no events
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
      if (events.length === 0) {
        setError('No posts found from the people you follow');
      }
      console.log('Loading timeout reached for follower feed');
      
      // Process any remaining events in batch
      processBatch();
    }, 10000);
    
    return () => {
      // Clean up all resources
      if (batchTimeout) clearTimeout(batchTimeout);
      clearTimeout(loadingTimeout);
      
      // Unsubscribe from all created subscriptions
      subIds.forEach(id => {
        try {
          manager.unsubscribe(id);
        } catch (e) {
          console.warn(`Failed to unsubscribe from ${id}:`, e);
        }
      });
      
      console.log('Cleaned up follower feed subscriptions');
    };
  }, [contacts, contactsLoaded, isLoggedIn, manager, refreshing]); // Added contactsLoaded dependency
  
  // Function to refresh the feed
  const refreshFeed = () => {
    setRefreshing(true);
    
    // Close current subscriptions
    manager.close();
    
    // Wait a bit before restarting
    setTimeout(() => {
      setRefreshing(false);
      setContacts([]);
    }, 1000);
  };
  
  if (!isLoggedIn) {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <div className="mt-8 text-center py-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-100 dark:border-gray-700/30">
          <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">Sign in required</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            You need to sign in to see your follower feed.
          </p>
          <div className="mt-6">
            <Link
              href="/keys"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
    );
  }
  
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
            Following Feed
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
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 rounded-full font-medium transition-colors">
            Global
          </Link>
          
          <Link href="/feed"
            className="px-3 py-1 text-sm bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-full font-medium">
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
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            {contacts.length === 0 ? "You're not following anyone yet" : "No posts from people you follow"}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {contacts.length === 0 
              ? "Follow some profiles to start building your feed"
              : "The people you follow haven't posted recently"}
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
              Find People to Follow
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
