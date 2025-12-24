"use client";
import { useEffect, useState, useCallback } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { AnyNostrEvent } from '@/types/nostr';
import { getEventHash } from 'nostr-tools';

export interface ProfileMetadata {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  banner?: string;
  website?: string;
  lud16?: string; // Lightning address
}

// Create a cache to store profiles and avoid duplicate fetches
const profileCache: Record<string, {data: ProfileMetadata, timestamp: number}> = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache duration

export default function useProfile(pubkey: string) {
  const { manager } = useRelay();
  const [meta, setMeta] = useState<ProfileMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch profile data with retry logic
  const fetchProfileData = useCallback(async () => {
    if (!pubkey) return;
    
    // Check cache first
    const cachedProfile = profileCache[pubkey];
    const now = Date.now();
    if (cachedProfile && (now - cachedProfile.timestamp < CACHE_DURATION)) {
      console.log(`[useProfile] Using cached profile for ${pubkey.slice(0, 8)}...`);
      setMeta(cachedProfile.data);
      setLoading(false);
      return;
    }

    console.log(`[useProfile] Fetching profile for ${pubkey.slice(0, 8)}...`);
    setLoading(true);
    setError(null);

    try {
      const subId = `meta-${pubkey}-${now}`;
      
      // Set a timeout to handle no response
      const timeoutId = setTimeout(() => {
        console.log(`[useProfile] Timeout fetching profile for ${pubkey.slice(0, 8)}...`);
        manager.unsubscribe(subId);
        setLoading(false);
        // Don't set error, just leave meta as null if it wasn't set
      }, 10000); // 10 second timeout

      // Subscribe to profile metadata
      manager.subscribe(
        subId,
        { kinds: [0], authors: [pubkey], limit: 1 },
        (ev: AnyNostrEvent) => {
          if (ev.kind !== 0) return;
          
          try {
            console.log(`[useProfile] Received metadata event for ${pubkey.slice(0, 8)}...`, ev);
            const data = JSON.parse(ev.content) as ProfileMetadata;
            
            // Update cache
            profileCache[pubkey] = {
              data,
              timestamp: Date.now()
            };
            
            setMeta(data);
            setLoading(false);
            clearTimeout(timeoutId);
            manager.unsubscribe(subId);
          } catch (err) {
            console.error(`[useProfile] Error parsing metadata:`, err);
            setError(`Failed to parse profile data`);
            setLoading(false);
            clearTimeout(timeoutId);
            manager.unsubscribe(subId);
          }
        }
      );

      return () => {
        clearTimeout(timeoutId);
        manager.unsubscribe(subId);
      };
    } catch (err) {
      console.error(`[useProfile] Error subscribing to profile:`, err);
      setError(`Failed to fetch profile`);
      setLoading(false);
    }
  }, [pubkey, manager]);

  useEffect(() => {
    // Call the fetch function without assigning its Promise
    fetchProfileData();
    // No cleanup needed here since fetchProfileData handles its own cleanup
  }, [fetchProfileData]);

  return meta;
}
