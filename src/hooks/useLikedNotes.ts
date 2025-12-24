"use client";
import { useEffect, useState } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { AnyNostrEvent } from '@/types/nostr';

export default function useLikedNotes(pubkey: string) {
  const { manager } = useRelay();
  const [events, setEvents] = useState<AnyNostrEvent[]>([]);
  const [likedEventIds, setLikedEventIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // First, get all reaction events (kind 7) from this user
    const subId = `likes-${pubkey}`;
    setLoading(true);
    setEvents([]);
    setLikedEventIds([]);

    // Step 1: Subscribe to reactions from the user
    manager.subscribe(
      subId,
      { kinds: [7], authors: [pubkey] },
      (ev: AnyNostrEvent) => {
        const eTag = ev.tags.find(t => t[0] === 'e');
        if (eTag && eTag[1]) {
          setLikedEventIds(prev => {
            if (prev.includes(eTag[1])) return prev;
            return [...prev, eTag[1]];
          });
        }
      }
    );

    return () => {
      manager.unsubscribe(subId);
    };
  }, [pubkey, manager]);

  // Step 2: Once we have liked event IDs, fetch those posts
  useEffect(() => {
    if (likedEventIds.length === 0) {
      setLoading(false);
      return;
    }

    const notesSubId = `liked-notes-${pubkey}`;
    
    manager.subscribe(
      notesSubId,
      { kinds: [1], ids: likedEventIds },
      (ev: AnyNostrEvent) => {
        setEvents(prev => {
          if (prev.some(e => e.id === ev.id)) return prev;
          return [...prev, ev];
        });
        setLoading(false);
      }
    );

    // If we don't get any events after a timeout, stop loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => {
      manager.unsubscribe(notesSubId);
      clearTimeout(timeout);
    };
  }, [likedEventIds, manager, pubkey]);

  return { events, loading };
}
