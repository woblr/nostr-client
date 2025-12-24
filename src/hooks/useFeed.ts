"use client";
import { useEffect, useState, useMemo } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { AnyNostrEvent, NostrEvent } from '@/types/nostr';
import { useUserStore } from '@/store/useUserStore';

export default function useFeed(limit = 30, authors?: string | string[]) {
  const { manager } = useRelay();
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasContacts, setHasContacts] = useState<boolean | null>(null);
  const [followRecommendations, setFollowRecommendations] = useState<NostrEvent[]>([]);
  const [contactsList, setContactsList] = useState<string[]>([]);
  // Flag to control if we're in discover mode (no contacts or explicit request)
  const [isDiscoverMode, setIsDiscoverMode] = useState(false);
  const pubkey = useUserStore(state => {
    const activeAccountId = state.activeAccountId;
    if (!activeAccountId) return null;
    const account = state.accounts.find(a => a.id === activeAccountId);
    return account?.pubkey || null;
  });
  
  // Check if the user has any contacts (kind:3) events
  useEffect(() => {
    if (!pubkey) {
      // If no public key, set hasContacts to false to show discover feed
      setHasContacts(false);
      return;
    }
    
    const contactsId = `contacts-check-${pubkey}`;
    setHasContacts(null); // reset while checking
    
    manager.subscribe(contactsId, {
      kinds: [3],
      authors: [pubkey],
      limit: 1
    }, (ev: AnyNostrEvent) => {
      if (ev.kind === 3) {
        const contacts = ev.tags.filter(t => t[0] === 'p').map(t => t[1]);
        setContactsList(contacts);
        setHasContacts(contacts.length > 0);
        setIsDiscoverMode(contacts.length === 0);
      }
    });
    
    // Fallback: assume no contacts after 3 seconds if we don't get a kind:3 event
    const timeout = setTimeout(() => {
      setHasContacts(false);
      setIsDiscoverMode(true);
    }, 3000);
    
    return () => {
      clearTimeout(timeout);
      manager.unsubscribe(contactsId);
    };
  }, [pubkey, manager]);
  
  // Load follow recommendations when we need them
  useEffect(() => {
    if (hasContacts !== false) return; // Only fetch recommendations when we know user has no contacts
    
    const recommendationsId = 'follow-recommendations';
    setFollowRecommendations([]);
    
    // Popular relays for discovery
    const discoverRelays = [
      'wss://relay.damus.io', 
      'wss://relay.nostr.band',
      'wss://nostr.wine'
    ];
    
    // Add popular relays to increase chances of finding content
    discoverRelays.forEach(url => manager.addRelay(url));
    
    // Get popular users (those with many followers or zaps in the last week)
    manager.subscribe(recommendationsId, {
      kinds: [0],  // Profile metadata
      limit: 10
    }, (ev: AnyNostrEvent) => {
      if (ev.kind === 0) {
        setFollowRecommendations(prev => {
          if (prev.find(e => e.id === ev.id)) return prev;
          return [...prev, ev as NostrEvent].slice(0, 10);
        });
      }
    });
    
    return () => {
      manager.unsubscribe(recommendationsId);
    };
  }, [hasContacts, manager]);

  // Main feed logic - fallback to discover feed if no contacts
  useEffect(() => {
    const authorKey = Array.isArray(authors) ? authors.join('-') : authors ?? 'all';
    const id = `feed-${authorKey}`; // Stable ID to avoid unnecessary re-subscriptions

    // Reset state when deps change
    setEvents([]);
    setLoading(true);

    // Make sure we're connected to popular relays regardless of mode
    const popularRelays = [
      'wss://relay.damus.io', 
      'wss://relay.nostr.band', 
      'wss://nostr.wine',
      'wss://nos.lol',
      'wss://purplepag.es'
    ];
    popularRelays.forEach(url => manager.addRelay(url));
    
    const filter: any = {
      kinds: [1],
      limit: 50, // Increase limit to get more posts
      since: Math.floor(Date.now() / 1000) - 3600 * 48, // Expand time window to 48 hours
    };

    // -------------------------------------------------------------
    // PROFILE FEED MODE
    // If an explicit `authors` parameter is provided, we always
    // prioritise it and skip discover / following logic. This is
    // essential for profile pages so that they only render notes
    // created by the profile being viewed.
    // -------------------------------------------------------------
    if (authors) {
      // Ensure the filter only pulls events from the requested author(s)
      filter.authors = Array.isArray(authors) ? authors : [authors];
      filter.limit = limit * 2; // request a few more to cover later trims

      let allEvents: Record<string, NostrEvent> = {};
      let initialized = false;

      manager.subscribe(id, filter, (ev: AnyNostrEvent) => {
        if (ev.kind !== 1) return;
        allEvents[ev.id] = ev as NostrEvent;

        // On first batch (>5 events) push immediately for snappier UX
        if (!initialized && Object.keys(allEvents).length >= 5) {
          setEvents(
            Object.values(allEvents)
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, limit)
          );
          setLoading(false);
          initialized = true;
        }
      });

      // Periodically refresh so any late-arriving events are shown
      const updateInterval = setInterval(() => {
        if (Object.keys(allEvents).length === 0) {
          if (loading) setLoading(false);
          return;
        }

        setEvents(
          Object.values(allEvents)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, limit)
        );
      }, 500);

      // Cleanup
      return () => {
        clearInterval(updateInterval);
        manager.unsubscribe(id);
      };
    }
    
    // If user has no contacts or we're still checking, use discover feed logic
    if (hasContacts === false || hasContacts === null) {
      console.log('Using discover feed logic');
      
      // Create a buffer for collecting events before updating the state
      const eventBuffer: NostrEvent[] = [];
      
      // Subscribe to all notes with a wider time window
      manager.subscribe(id, filter, (ev: AnyNostrEvent) => {
        if (ev.kind !== 1) return;
        
        // Add to buffer instead of immediately updating state
        if (!eventBuffer.find(e => e.id === ev.id)) {
          eventBuffer.push(ev as NostrEvent);
        }
      });
      
      // Set an update interval to process buffered events
      const updateInterval = setInterval(() => {
        if (eventBuffer.length > 0) {
          // Sort events by time and apply them all at once
          const sortedEvents = [...eventBuffer].sort((a, b) => b.created_at - a.created_at);
          
          setEvents(prev => {
            // Combine existing events with new ones, avoiding duplicates
            const combined = [...prev];
            
            sortedEvents.forEach(event => {
              if (!combined.find(e => e.id === event.id)) {
                combined.push(event);
              }
            });
            
            return combined
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, limit);
          });
          
          // Clear the processed events
          eventBuffer.length = 0;
          setLoading(false);
        } else if (loading && !events.length) {
          // If we've waited for a bit and still have no events
          setTimeout(() => setLoading(false), 2000);
        }
      }, 2000); // Update every 2 seconds instead of immediately
      
      // Safety timeout to ensure we show something
      const safetyTimeout = setTimeout(() => {
        setLoading(false);
        
        // If we still don't have posts, try another approach
        if (events.length === 0) {
          console.log('No events found, trying global feed');
          // Try subscribing to global feed with no filters
          const globalId = `global-${Date.now()}`;
          const globalBuffer: NostrEvent[] = [];
          
          manager.subscribe(globalId, { kinds: [1], limit: 10 }, (ev: AnyNostrEvent) => {
            if (ev.kind === 1 && !globalBuffer.find(e => e.id === ev.id)) {
              globalBuffer.push(ev as NostrEvent);
            }
          });
          
          // Process global events in batches as well
          setTimeout(() => {
            if (globalBuffer.length > 0) {
              setEvents(globalBuffer
                .sort((a, b) => b.created_at - a.created_at)
                .slice(0, limit));
            }
          }, 3000);
        }
      }, 5000);
      
      // Clean up subscriptions and intervals
      return () => {
        clearInterval(updateInterval);
        clearTimeout(safetyTimeout);
      };
    } else if (authors) {
      // Profile page posts - reliable loading without disappearing posts
      let allEvents: Record<string, NostrEvent> = {}; // Use a map to avoid duplicates
      let initialized = false;
      
      filter.authors = Array.isArray(authors) ? authors : [authors];
      filter.limit = limit * 2; // Request more posts to ensure we get enough
      
      manager.subscribe(id, filter, (ev: AnyNostrEvent) => {
        if (ev.kind !== 1) return;
        
        // Add to our collection keyed by id to prevent duplicates
        allEvents[ev.id] = ev as NostrEvent;
        
        // Convert to array, sort, and update state
        const sortedEvents = Object.values(allEvents)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, limit);
        
        // For stability, only do immediate updates on initial load
        if (!initialized && Object.keys(allEvents).length >= 5) {
          setEvents(sortedEvents);
          setLoading(false);
          initialized = true;
        }
      });
      
      // Process periodic updates for smoother loading
      const updateInterval = setInterval(() => {
        if (Object.keys(allEvents).length > 0 && initialized) {
          // Update state with the latest sorted events
          const sortedEvents = Object.values(allEvents)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, limit);
            
          setEvents(sortedEvents);
          setLoading(false);
        } else if (loading && !initialized && Object.keys(allEvents).length > 0) {
          // Show what we have after a short delay if not much is coming in
          setEvents(Object.values(allEvents)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, limit));
          setLoading(false);
          initialized = true;
        } else if (loading && Object.keys(allEvents).length === 0) {
          // Set loading to false after a timeout even if we have no events
          setTimeout(() => setLoading(false), 800);
        }
      }, 500); // Update every half second
      
      return () => {
        clearInterval(updateInterval);
      };
    } else if (hasContacts === true) {
      // Get posts from followed users - using batched updates
      // Use the contactsList from the previous contactCheck subscription
      const followedPubkeys = contactsList || [];
      const feedBuffer: NostrEvent[] = [];
      const repliesBuffer: NostrEvent[] = [];
      const repliesId = 'feed-replies';
      
      if (followedPubkeys.length > 0) {
        filter.authors = followedPubkeys;
        manager.subscribe(id, filter, (ev: AnyNostrEvent) => {
          if (ev.kind !== 1) return;
          if (!feedBuffer.find(e => e.id === ev.id)) {
            feedBuffer.push(ev as NostrEvent);
          }
        });
      }
      
      // After a brief delay, also check for any replies to current user
      if (pubkey) {
        setTimeout(() => {
          // Get posts that tag the user
          manager.subscribe(repliesId, {
            kinds: [1],
            '#p': [pubkey],
            limit,
            since: Math.floor(Date.now() / 1000) - 3600 * 24 * 7,
          }, (ev: AnyNostrEvent) => {
            if (ev.kind !== 1) return;
            if (!repliesBuffer.find(e => e.id === ev.id)) {
              repliesBuffer.push(ev as NostrEvent);
            }
          });
        }, 500);
      }
      
      // Process both main feed and replies on interval
      const updateInterval = setInterval(() => {
        const hasNewItems = feedBuffer.length > 0 || repliesBuffer.length > 0;
        
        if (hasNewItems) {
          setEvents(prev => {
            const combined = [...prev];
            
            // Process main feed buffer
            feedBuffer.forEach(event => {
              if (!combined.find(e => e.id === event.id)) {
                combined.push(event);
              }
            });
            feedBuffer.length = 0;
            
            // Process replies buffer
            repliesBuffer.forEach(event => {
              if (!combined.find(e => e.id === event.id)) {
                combined.push(event);
              }
            });
            repliesBuffer.length = 0;
            
            return combined
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, limit);
          });
          
          setLoading(false);
        } else if (loading && events.length === 0) {
          // If we've been loading for a while with no events
          setTimeout(() => setLoading(false), 2000);
        }
      }, 2000);
      
      return () => {
        clearInterval(updateInterval);
        manager.unsubscribe(repliesId);
        manager.unsubscribe(id);
      };
    }

    // Fallback: stop loading indicator after 5s if no events
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => {
      clearTimeout(timeout);
      manager.unsubscribe(id);
    };
  }, [manager, limit, Array.isArray(authors) ? authors.join(',') : authors, hasContacts, pubkey]);

  return { 
    events, 
    loading, 
    hasContacts, 
    followRecommendations, 
    isDiscoverMode: hasContacts === false 
  };
}
