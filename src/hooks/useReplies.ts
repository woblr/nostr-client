import { useEffect, useState } from 'react';
import { AnyNostrEvent } from '@/types/nostr';
import { useRelay } from '@/context/RelayProvider';

/**
 * Subscribe to replies (kind 1 events) that reference a given event id via the #e tag.
 * Returns a list of replies sorted by creation time ascending.
 */
export default function useReplies(eventId: string) {
  const { manager } = useRelay();
  const [list, setList] = useState<AnyNostrEvent[]>([]);

  useEffect(() => {
    if (!eventId) return;

    const subId = `replies-${eventId}`;
    manager.subscribe(
      subId,
      { kinds: [1], "#e": [eventId] },
      (ev) => {
        if (ev.kind !== 1) return;
        setList((prev) => {
          if (prev.find((p) => p.id === ev.id)) return prev;
          const next = [...prev, ev as AnyNostrEvent].sort((a, b) => a.created_at - b.created_at);
          return next;
        });
      }
    );

    return () => manager.unsubscribe(subId);
  }, [eventId, manager]);

  return list;
}
