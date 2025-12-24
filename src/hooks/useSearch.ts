"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { bech32 } from '@scure/base';
import { SearchResult, SearchResultType, UserSearchResult, PostSearchResult, HashtagSearchResult, SearchFilters, NostrBandSearchResponse } from '@/types/search';
import { nip19 } from 'nostr-tools';
import { AnyNostrEvent } from '@/types/nostr';

// Default popular relays to search across
const SEARCH_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://nostr.wine'
];

// External search API endpoints
const NOSTR_BAND_API = 'https://api.nostr.band/v0';

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SearchResultType>('user');
  const { manager } = useRelay();

  // Detect what kind of search query we have
  const detectQueryType = (query: string): { type: string, value: string } => {
    query = query.trim();
    
    // Check if it's a direct NIP-19 identifier
    if (query.startsWith('npub1') || query.startsWith('note1') || query.startsWith('nprofile1')) {
      return { type: 'nip19', value: query };
    }
    
    // Check if it's a NIP-05 identifier
    if (query.includes('@') && !query.startsWith('@')) {
      return { type: 'nip05', value: query };
    }
    
    // Check if it's a hashtag
    if (query.startsWith('#')) {
      return { type: 'hashtag', value: query.substring(1) };
    }
    
    // Check if it's a username mention
    if (query.startsWith('@')) {
      return { type: 'username', value: query.substring(1) };
    }
    
    // Default to text search
    return { type: 'text', value: query };
  };

  // Handle NIP-19 identifiers
  const handleNip19 = async (value: string) => {
    try {
      // Try to decode the NIP-19 identifier
      const decoded = nip19.decode(value);
      
      switch (decoded.type) {
        case 'npub':
          // It's a public key, search for profiles
          await searchProfiles([decoded.data]);
          setActiveTab('user');
          break;
        case 'note':
          // It's a note ID, search for a specific note
          await searchNotes([decoded.data]);
          setActiveTab('post');
          break;
        case 'nprofile':
          // It's a profile, search for it
          await searchProfiles([decoded.data.pubkey]);
          setActiveTab('user');
          break;
        default:
          setError(`Unsupported NIP-19 type: ${decoded.type}`);
      }
    } catch (e) {
      setError(`Invalid NIP-19 identifier: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Search for user profiles
  const searchProfiles = useCallback(async (pubkeys?: string[], nameQuery?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Make sure at least some relays are connected
      SEARCH_RELAYS.forEach(relay => {
        try {
          manager.addRelay(relay);
        } catch (e) {
          console.warn(`Failed to add relay ${relay}:`, e);
        }
      });

      const foundProfiles: Map<string, UserSearchResult> = new Map();
      const searchId = `profile-search-${Date.now()}`;
      
      // Create a promise that will resolve after the search timeout
      const searchPromise = new Promise<UserSearchResult[]>((resolve) => {
        // Set up filter based on what we're searching for
        const filter: any = {
          kinds: [0], // Profile metadata
          limit: 50
        };
        
        // If specific pubkeys are provided, search only those
        if (pubkeys && pubkeys.length > 0) {
          filter.authors = pubkeys;
        }
        
        // Subscribe to profile events
        manager.subscribe(searchId, filter, (event: AnyNostrEvent) => {
          if (event.kind !== 0) return;
          
          try {
            // Parse the profile content
            const profile = JSON.parse(event.content);
            const { name, displayName, display_name, nip05, picture, about } = profile;
            
            // Skip if we're searching by name and it doesn't match
            if (nameQuery) {
              const displayNameToUse = display_name || displayName;
              const searchLower = nameQuery.toLowerCase();
              
              const nameMatch = name?.toLowerCase().includes(searchLower);
              const displayMatch = displayNameToUse?.toLowerCase().includes(searchLower);
              const nip05Match = nip05?.toLowerCase().includes(searchLower);
              
              if (!nameMatch && !displayMatch && !nip05Match) {
                return;
              }
            }
            
            // Add to results if we haven't seen this pubkey yet
            if (!foundProfiles.has(event.pubkey)) {
              foundProfiles.set(event.pubkey, {
                type: 'user',
                id: event.pubkey,
                pubkey: event.pubkey,
                name: name,
                displayName: display_name || displayName,
                nip05: nip05,
                picture: picture,
                about: about,
                event: event
              });
            }
          } catch (e) {
            console.error('Failed to parse profile content:', e);
          }
        });
        
        // Resolve after a timeout or when we've found enough results
        setTimeout(() => {
          manager.unsubscribe(searchId);
          resolve(Array.from(foundProfiles.values()));
        }, 5000); // 5 second timeout for profile search
      });
      
      const profiles = await searchPromise;
      setResults(prev => {
        // Merge new results with existing results of different types
        const nonProfileResults = prev.filter(r => r.type !== 'user');
        return [...nonProfileResults, ...profiles];
      });
    } catch (e) {
      setError(`Profile search failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoading(false);
    }
  }, [manager]);

  // Search for notes/posts
  const searchNotes = useCallback(async (ids?: string[], contentQuery?: string, hashtag?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Add search relays
      SEARCH_RELAYS.forEach(relay => manager.addRelay(relay));
      
      const foundNotes: Map<string, PostSearchResult> = new Map();
      const searchId = `note-search-${Date.now()}`;
      
      // Create a promise that will resolve after the search timeout
      const searchPromise = new Promise<PostSearchResult[]>((resolve) => {
        const filter: any = {
          kinds: [1], // Text notes
          limit: 50
        };
        
        // If specific note IDs are provided, search only those
        if (ids && ids.length > 0) {
          filter.ids = ids;
        }
        
        // If searching by hashtag, add tag filter
        if (hashtag) {
          filter['#t'] = [hashtag];  // Tag search needs an exact match
        }
        
        // Subscribe to note events
        manager.subscribe(searchId, filter, (event: AnyNostrEvent) => {
          if (event.kind !== 1) return;
          
          // For content search, check if the content contains the query
          if (contentQuery && !event.content.toLowerCase().includes(contentQuery.toLowerCase())) {
            return;
          }
          
          // Add to results if we haven't seen this note yet
          if (!foundNotes.has(event.id)) {
            foundNotes.set(event.id, {
              type: 'post',
              id: event.id,
              event: event,
              authorPubkey: event.pubkey,
              content: event.content,
              createdAt: event.created_at
            });
          }
        });
        
        // Resolve after a timeout or when we've found enough results
        setTimeout(() => {
          manager.unsubscribe(searchId);
          resolve(Array.from(foundNotes.values()));
        }, 8000); // 8 second timeout for note search (a bit longer than profile search)
      });
      
      const notes = await searchPromise;
      setResults(prev => {
        // Merge new results with existing results of different types
        const nonNoteResults = prev.filter(r => r.type !== 'post');
        return [...nonNoteResults, ...notes];
      });
    } catch (e) {
      setError(`Note search failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoading(false);
    }
  }, [manager]);

  // Search for hashtags
  const searchHashtags = useCallback(async (hashtag?: string) => {
    // For direct hashtag search, we'll just create a single result
    if (hashtag) {
      const hashtagResult: HashtagSearchResult = {
        type: 'hashtag',
        id: hashtag,
        tag: hashtag,
        count: 1
      };
      
      setResults(prev => {
        // Merge with existing results of different types
        const nonHashtagResults = prev.filter(r => r.type !== 'hashtag');
        return [...nonHashtagResults, hashtagResult];
      });
      
      // We don't need to do external API calls for a direct hashtag search
      return;
    }
    
    // Otherwise, attempt to find popular hashtags from the query
    // This is typically handled better by external APIs since most relays
    // don't index hashtags well
  }, []);

  // Fallback to external search API when relay search is insufficient
  const searchExternalAPI = useCallback(async (query: string) => {
    if (!query || query.length < 3) return;
    
    setIsLoading(true);
    try {
      // Call nostr.band API
      const response = await fetch(`${NOSTR_BAND_API}/search?query=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error(`Search API returned ${response.status}`);
      }
      
      const data = await response.json() as NostrBandSearchResponse;
      const externalResults: SearchResult[] = [];
      
      // Process profiles
      if (data.profiles && data.profiles.length > 0) {
        data.profiles.forEach(profile => {
          try {
            const parsed = profile.content ? JSON.parse(profile.content) : {};
            
            externalResults.push({
              type: 'user',
              id: profile.pubkey || profile.id,
              pubkey: profile.pubkey || profile.id,
              name: parsed.name,
              displayName: parsed.display_name || parsed.displayName,
              nip05: parsed.nip05,
              picture: parsed.picture,
              about: parsed.about,
              event: profile as AnyNostrEvent
            });
          } catch (e) {
            console.error('Failed to parse external profile:', e);
          }
        });
      }
      
      // Process notes
      if (data.notes && data.notes.length > 0) {
        data.notes.forEach(note => {
          if (!note.pubkey || !note.created_at) return;
          
          externalResults.push({
            type: 'post',
            id: note.id,
            event: note as AnyNostrEvent,
            authorPubkey: note.pubkey,
            content: note.content || '',
            createdAt: note.created_at
          });
        });
      }
      
      // Process hashtags
      if (data.hashtags && data.hashtags.length > 0) {
        data.hashtags.forEach(({ tag, count }) => {
          externalResults.push({
            type: 'hashtag',
            id: tag,
            tag: tag,
            count: count
          });
        });
      }
      
      setResults(prev => {
        // For external results, we'll replace any existing results of the same type
        const currentTypes = new Set(externalResults.map(r => r.type));
        const filteredPrev = prev.filter(r => !currentTypes.has(r.type));
        return [...filteredPrev, ...externalResults];
      });
      
    } catch (e) {
      console.error('External API search failed:', e);
      // Don't set error here since external search is a fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Main search function
  const search = useCallback(async (searchQuery: string, filters?: SearchFilters) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    
    // Only update query if it's different to avoid unnecessary re-renders
    if (searchQuery !== query) {
      setQuery(searchQuery);
    }
    
    // Set loading state and record start time
    if (!isLoading || searchQuery !== query) {
      setIsLoading(true);
      setLoadingStartTime(Date.now());
      setError(null);
    }
    
    const { type, value } = detectQueryType(searchQuery);
    
    try {
      // Search based on detected query type
      switch (type) {
        case 'nip19':
          await handleNip19(value);
          break;
          
        case 'nip05':
          // Search for profiles with matching NIP-05
          await searchProfiles(undefined, value);
          setActiveTab('user');
          break;
          
        case 'hashtag':
          // Search for notes with the hashtag and create a hashtag result
          await Promise.all([
            searchNotes(undefined, undefined, value),
            searchHashtags(value)
          ]);
          setActiveTab('hashtag');
          break;
          
        case 'username':
          // Search for profiles with matching names
          await searchProfiles(undefined, value);
          setActiveTab('user');
          break;
          
        case 'text':
          // For text search, try to search for all types
          await Promise.all([
            searchProfiles(undefined, value),
            searchNotes(undefined, value)
          ]);
          
          // Try external API search after a short delay
          setTimeout(() => {
            if (results.length === 0) {
              searchExternalAPI(value);
            }
          }, 2000);
          
          break;
      }
    } catch (e) {
      setError(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      // Ensure loading state persists for at least 750ms to avoid visual jitter
      const endTime = Date.now();
      const loadStarted = loadingStartTime || endTime;
      const loadingDuration = endTime - loadStarted;
      const minLoadingTime = 750; // minimum milliseconds to show loading state
      
      if (loadingDuration < minLoadingTime) {
        setTimeout(() => {
          setIsLoading(false);
          setLoadingStartTime(null);
        }, minLoadingTime - loadingDuration);
      } else {
        setIsLoading(false);
        setLoadingStartTime(null);
      }
    }
  }, [handleNip19, searchProfiles, searchNotes, searchHashtags, searchExternalAPI, results.length]);
  
  // Reset search
  const resetSearch = () => {
    setQuery('');
    setResults([]);
    setError(null);
    setIsLoading(false);
  };
  
  // Filter results by type
  const filteredResults = results.filter(result => 
    result.type === activeTab || activeTab === 'user' && result.type === 'user'
  );
  
  return {
    query,
    results: filteredResults,
    allResults: results,
    isLoading,
    error,
    search,
    resetSearch,
    activeTab,
    setActiveTab
  };
}
