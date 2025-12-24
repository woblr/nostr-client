"use client";
import { useState, useEffect } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { AnyNostrEvent } from '@/types/nostr';

/**
 * Returns the list of pubkeys that follow the given user (kind 3 contact lists containing pubkey).
 */
export default function useFollowersList(pubkey: string) {
  const { manager } = useRelay();
  const [followers, setFollowers] = useState<string[]>([]);

  useEffect(() => {
    if (!pubkey) return;
    const id = `followers-of-${pubkey}`;
    const seen = new Set<string>();

    manager.subscribe(
      id,
      { kinds: [3], '#p': [pubkey] },
      (ev: AnyNostrEvent) => {
        if (ev.kind !== 3) return;
        if (!seen.has(ev.pubkey)) {
          seen.add(ev.pubkey);
          setFollowers(Array.from(seen));
        }
      }
    );
    return () => manager.unsubscribe(id);
  }, [pubkey, manager]);

  return followers;
}
