"use client";
import { useState, useEffect } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { AnyNostrEvent } from '@/types/nostr';

/**
 * Returns the list of pubkeys that the given user follows (kind 3 contact list).
 */
export default function useContactList(pubkey: string) {
  const { manager } = useRelay();
  const [list, setList] = useState<string[]>([]);

  useEffect(() => {
    if (!pubkey) return;
    const id = `contact-list-${pubkey}`;
    manager.subscribe(
      id,
      { kinds: [3], authors: [pubkey], limit: 1 },
      (ev: AnyNostrEvent) => {
        if (ev.kind !== 3) return;
        const ps = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
        setList(ps);
      }
    );
    return () => manager.unsubscribe(id);
  }, [pubkey, manager]);

  return list;
}
