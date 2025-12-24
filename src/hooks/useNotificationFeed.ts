"use client";
import { useEffect, useState, useCallback } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { AnyNostrEvent, NostrEvent, DMEvent } from '@/types/nostr';
import { KeyManager } from '@/lib/nostr/KeyManager';
import { useActivePublicKey } from '@/store/useUserStore';

// Define notification types
export type NotificationType = 'reply' | 'mention' | 'reaction' | 'zap' | 'dm';

// Group notifications by type and referenced content
export interface NotificationGroup {
  type: NotificationType;
  events: AnyNostrEvent[];
  targetEventId?: string; // For reactions, replies
  createdAt: number; // Most recent event timestamp
  authorPubkeys: string[]; // All pubkeys who created these notifications
  unread: boolean;
  reactionContent?: string; // For reactions (emoji)
  zapAmount?: number; // For zaps (total)
}

// Hook to fetch and manage notifications for a user
export default function useNotificationFeed(limit = 50) {
  const { manager } = useRelay();
  const pubkey = useActivePublicKey();
  
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationGroup[]>([]);
  const [rawEvents, setRawEvents] = useState<Record<string, AnyNostrEvent>>({});
  const [userNoteIds, setUserNoteIds] = useState<string[]>([]);
  
  // Cache of events by ID
  const [eventCache, setEventCache] = useState<Record<string, NostrEvent>>({});
  
  // Track processed notifications to avoid duplicates
  const [processedEventIds, setProcessedEventIds] = useState<Set<string>>(new Set());

  // Fetch user's notes first to build reference for notifications
  const fetchUserNotes = useCallback(() => {
    if (!pubkey) return;
    
    const subId = `user-notes-${pubkey.slice(0, 8)}`;
    manager.subscribe(
      subId,
      {
        kinds: [1],
        authors: [pubkey],
        limit: 200, // Get a reasonable amount of the user's posts
      },
      (ev: AnyNostrEvent) => {
        if (ev.kind !== 1) return;
        setUserNoteIds(prev => {
          if (prev.includes(ev.id)) return prev;
          return [...prev, ev.id];
        });
        
        // Add to event cache
        setEventCache(prev => ({
          ...prev,
          [ev.id]: ev as NostrEvent,
        }));
      }
    );
    
    return () => manager.unsubscribe(subId);
  }, [pubkey, manager]);

  // Group raw events into notification groups
  const processNotifications = useCallback(() => {
    if (!pubkey) return;
    
    const newEvents = Object.values(rawEvents).filter(
      ev => !processedEventIds.has(ev.id)
    );
    
    if (newEvents.length === 0) return;
    
    // Track newly processed event IDs
    const newProcessedIds = new Set(processedEventIds);
    newEvents.forEach(ev => newProcessedIds.add(ev.id));
    setProcessedEventIds(newProcessedIds);
    
    // Group notifications by type and target
    const notificationMap: Record<string, NotificationGroup> = {};
    
    newEvents.forEach(ev => {
      let type: NotificationType | null = null;
      let targetId: string | undefined = undefined;
      
      // Determine notification type
      if (ev.kind === 7) {
        // Reaction (NIP-25)
        type = 'reaction';
        targetId = ev.tags.find(t => t[0] === 'e')?.[1];
        if (!targetId || !userNoteIds.includes(targetId)) return;
      } else if (ev.kind === 1) {
        // Check if reply or mention
        const eTag = ev.tags.find(t => t[0] === 'e');
        const pTag = ev.tags.find(t => t[0] === 'p' && t[1] === pubkey);
        
        if (eTag && userNoteIds.includes(eTag[1])) {
          // Reply to user's note
          type = 'reply';
          targetId = eTag[1];
        } else if (pTag) {
          // Mention of user
          type = 'mention';
        } else {
          return; // Not relevant notification
        }
      } else if (ev.kind === 9735) {
        // Zap (NIP-57)
        type = 'zap';
        targetId = ev.tags.find(t => t[0] === 'e')?.[1];
        const pTag = ev.tags.find(t => t[0] === 'p');
        if (pTag?.[1] !== pubkey && (!targetId || !userNoteIds.includes(targetId))) {
          return; // Not targeted at user
        }
      } else if (ev.kind === 4) {
        // DM (NIP-04)
        const pTag = ev.tags.find(t => t[0] === 'p');
        if (pTag?.[1] === pubkey && ev.pubkey !== pubkey) {
          type = 'dm';
        } else {
          return; // Not for this user
        }
      }
      
      if (!type) return; // Skip unknown types
      
      // Group identifier
      const groupId = `${type}-${targetId || 'direct'}-${Math.floor(ev.created_at / 3600)}`; // Group hourly
      
      if (!notificationMap[groupId]) {
        notificationMap[groupId] = {
          type,
          events: [],
          targetEventId: targetId,
          createdAt: 0,
          authorPubkeys: [],
          unread: true,
          reactionContent: type === 'reaction' ? ev.content : undefined,
          zapAmount: 0,
        };
      }
      
      // Update notification group
      const group = notificationMap[groupId];
      group.events.push(ev);
      group.createdAt = Math.max(group.createdAt, ev.created_at);
      if (!group.authorPubkeys.includes(ev.pubkey)) {
        group.authorPubkeys.push(ev.pubkey);
      }
      
      // Handle zap amounts if this is a zap notification
      if (type === 'zap') {
        const amountTag = ev.tags.find(t => t[0] === 'amount');
        if (amountTag) {
          const amount = parseInt(amountTag[1], 10) || 0;
          group.zapAmount = (group.zapAmount || 0) + amount;
        }
      }
    });
    
    const newGroups = Object.values(notificationMap);
    if (newGroups.length > 0) {
      setNotifications(prev => 
        [...newGroups, ...prev]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit)
      );
    }
  }, [rawEvents, processedEventIds, userNoteIds, pubkey, limit]);

  // Decode encrypted messages if possible
  const decryptMessages = useCallback(async () => {
    if (!pubkey) return;
    
    // Find DM notifications that haven't been decrypted
    const encryptedDMs = notifications
      .filter(n => n.type === 'dm')
      .flatMap(n => n.events)
      .filter((ev): ev is DMEvent => ev.kind === 4 && !(ev as DMEvent).decrypted);
    
    if (encryptedDMs.length === 0) return;
    
    // Attempt to decrypt each message
    const updatedEvents = { ...rawEvents };
    
    for (const ev of encryptedDMs) {
      try {
        const otherPubkey = ev.tags.find(t => t[0] === 'p')?.[1];
        if (!otherPubkey) continue;
        
        const decrypted = await KeyManager.decrypt(
          ev.content,
          otherPubkey,
          pubkey
        );
        
        // Store decrypted content
        updatedEvents[ev.id] = {
          ...ev,
          decrypted,
        };
      } catch (err) {
        console.error('Failed to decrypt message:', err);
      }
    }
    
    setRawEvents(updatedEvents);
  }, [notifications, pubkey, rawEvents]);

  // Subscribe to notification types
  useEffect(() => {
    if (!pubkey) return;
    
    // First get the user's notes
    const cleanupUserNotes = fetchUserNotes();
    
    // Set up the notifications subscription
    const subId = `notifications-${pubkey.slice(0, 8)}`;
    
    // Wait a bit for user notes to be fetched first
    const notifTimer = setTimeout(() => {
      setLoading(true);
      
      // Subscription filters
      const filters = [
        // Replies & mentions
        {
          kinds: [1],
          '#p': [pubkey], // Mentions
          limit: 50,
        },
        // Reactions to user's content
        {
          kinds: [7], // Reactions
          limit: 50,
        },
        // Zaps
        {
          kinds: [9735], // Zap receipts
          '#p': [pubkey],
          limit: 20,
        },
        // DMs
        {
          kinds: [4], // Encrypted DMs
          '#p': [pubkey], // Where user is recipient
          limit: 30,
        },
      ];
      
      // Process all incoming events
      const handleEvent = (ev: AnyNostrEvent) => {
        setRawEvents(prev => ({
          ...prev,
          [ev.id]: ev,
        }));
      };
      
      // Subscribe with multiple filters
      filters.forEach((filter, i) => {
        manager.subscribe(
          `${subId}-${i}`,
          filter,
          handleEvent
        );
      });
      
      // Once we've collected some initial data, process it
      setTimeout(() => {
        setLoading(false);
      }, 2000);
      
      return () => {
        filters.forEach((_, i) => {
          manager.unsubscribe(`${subId}-${i}`);
        });
      };
    }, 500); // Short delay to let user notes load first
    
    return () => {
      if (cleanupUserNotes) cleanupUserNotes();
      clearTimeout(notifTimer);
    };
  }, [pubkey, manager, fetchUserNotes]);
  
  // Process raw events into notification groups
  useEffect(() => {
    processNotifications();
  }, [rawEvents, processNotifications]);
  
  // Try to decrypt DMs when notifications change
  useEffect(() => {
    if (notifications.some(n => n.type === 'dm')) {
      decryptMessages();
    }
  }, [notifications, decryptMessages]);

  // Mark notifications as read
  const markAsRead = useCallback((groupIds: string[]) => {
    setNotifications(prev => 
      prev.map(group => {
        if (groupIds.includes(`${group.type}-${group.targetEventId || 'direct'}`)) {
          return { ...group, unread: false };
        }
        return group;
      })
    );
  }, []);
  
  return {
    notifications,
    loading,
    eventCache,
    markAsRead,
  };
}
