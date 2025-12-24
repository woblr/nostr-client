"use client";
import { useEffect, useState } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { AnyNostrEvent } from '@/types/nostr';

export default function useContactStats(pubkey: string) {
  const { manager } = useRelay();
  const [following, setFollowing] = useState<number | null>(null);
  const [followers, setFollowers] = useState<number | null>(null);

  // Following list (people that this pubkey follows)
  useEffect(() => {
    const id = `following-${pubkey}`;
    manager.subscribe(
      id,
      { kinds: [3], authors: [pubkey], limit: 1 },
      (ev: AnyNostrEvent) => {
        if (ev.kind !== 3) return;
        const ps = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
        setFollowing(ps.length);
      }
    );
    return () => manager.unsubscribe(id);
  }, [pubkey, manager]);

  // Followers count (people whose contact list includes this pubkey)
  useEffect(() => {
    const id = `followers-of-${pubkey}`;
    const seen = new Set<string>();
    manager.subscribe(
      id,
      { kinds: [3], '#p': [pubkey], limit: 500 },
      (ev: AnyNostrEvent) => {
        if (ev.kind !== 3) return;
        if (!seen.has(ev.pubkey)) {
          seen.add(ev.pubkey);
          setFollowers(seen.size);
        }
      }
    );
    return () => manager.unsubscribe(id);
  }, [pubkey, manager]);

  return { following, followers };
}
