/**
 * Direct Message implementation for Nostr (NIP-04)
 * Provides utilities for sending, receiving, and managing encrypted private messages
 */

import { KeyManager } from './KeyManager';

import { AnyNostrEvent } from '@/types/nostr';
import { publishEvent } from './events';
import { useUserStore } from '@/store/useUserStore';



/**
 * Conversation represents a direct message conversation between two users
 */
export interface Conversation {
  /** The pubkey of the other participant */
  pubkey: string;
  /** Display name of the other participant */
  displayName?: string;
  /** Profile picture of the other participant */
  profilePicture?: string;
  /** Last message in the conversation */
  lastMessage?: {
    content: string;
    timestamp: number;
    sent: boolean;
  };
  /** Count of unread messages */
  unread: number;
}

/**
 * DirectMessage represents a single message in a conversation
 */
export interface DirectMessage {
  /** Unique ID of the message (event ID) */
  id: string;
  /** Content of the message (decrypted) */
  content: string;
  /** Timestamp of when the message was created */
  created_at: number;
  /** Sender's pubkey */
  sender: string;
  /** Receiver's pubkey */
  receiver: string;
  /** Whether the message has been read */
  read: boolean;
}

/**
 * Send an encrypted direct message to a recipient
 * @param content Plain text content to encrypt and send
 * @param recipientPubkey Recipient's public key
 * @returns The published event
 */
export async function sendDirectMessage(
  content: string, 
  recipientPubkey: string
): Promise<AnyNostrEvent & { relayResults?: { [relay: string]: 'ok' | 'error' | string } }> {
  // Get active user's pubkey
  const { accounts, activeAccountId } = useUserStore.getState();
  const activeAccount = accounts.find(a => a.id === activeAccountId);
  
  if (!activeAccount) {
    throw new Error('No active account found');
  }
  
  // Encrypt the message content using NIP-04
  let encryptedContent: string;
  
  try {
    // Try with browser extension if available
    if ((window as any).nostr?.nip04?.encrypt) {
      encryptedContent = await (window as any).nostr!.nip04!.encrypt(
        recipientPubkey,
        content
      );
    } else {
      // Otherwise use our KeyManager
      encryptedContent = await KeyManager.encrypt(
        recipientPubkey,
        content,
        activeAccount.pubkey
      );
    }
  } catch (error) {
    console.error('Failed to encrypt message:', error);
    throw new Error('Could not encrypt message. Make sure your keys are available.');
  }
  
  // Create the direct message event (kind 4)
  const event = {
    kind: 4,
    pubkey: activeAccount.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkey]], // Tag with recipient's pubkey
    content: encryptedContent
  };
  
  // Sign the event
  const signedEvent = await KeyManager.signEvent(event, activeAccount.pubkey);
  
  // Use reliable relays that are known to work well with DMs
  const reliableRelays = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.snort.social',
    'wss://nostr-pub.wellorder.net',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.nostr.info',
    'wss://nostr.zebedee.cloud',
    'wss://nostr.bitcoiner.social',
  ];
  
  console.log('Publishing DM to relays:', reliableRelays);
  const relayResults: { [relay: string]: 'ok' | 'error' | string } = {};
  let atLeastOneSuccess = false;
  await Promise.all(reliableRelays.map(async (relay) => {
    try {
      await publishEvent(signedEvent, [relay]);
      relayResults[relay] = 'ok';
      atLeastOneSuccess = true;
    } catch (error) {
      relayResults[relay] = (error instanceof Error ? error.message : String(error)) || 'error';
      console.warn(`Relay ${relay} failed:`, error);
    }
  }));
  if (!atLeastOneSuccess) {
    throw new Error('Failed to send message to any relay. Check your relay list or try again.');
  }
  return { ...signedEvent, relayResults };
}

/**
 * Decrypt a direct message
 * @param event The encrypted DM event
 * @param userPubkey Current user's pubkey
 * @returns Decrypted message content
 */
export async function decryptDirectMessage(
  event: AnyNostrEvent,
  userPubkey: string
): Promise<string> {
  if (event.kind !== 4) {
    throw new Error('Not a direct message event (kind 4)');
  }
  
  // Determine if we're the sender or the recipient
  const isSender = event.pubkey === userPubkey;
  
  // Find the other party in the conversation
  const otherPubkey = isSender
    ? event.tags.find(tag => tag[0] === 'p')?.[1] // We are sender, get recipient from p tag
    : event.pubkey; // We are recipient, sender's pubkey is the other party
  
  if (!otherPubkey) {
    return '[DM error: Could not determine the other party in this conversation]';
  }
  
  // Check for locked or missing keys
  if (typeof window !== 'undefined' && (window as any).nostr?.nip04?.decrypt) {
    try {
      // If we're the recipient, we decrypt using the sender's pubkey
      // If we're the sender, we decrypt using the recipient's pubkey
      const decrypted = await (window as any).nostr.nip04.decrypt(
        isSender ? otherPubkey : event.pubkey,
        event.content
      );
      return decrypted;
    } catch (e) {
      // Continue to fallback
    }
  }
  
  // Fallback to KeyManager
  try {
    if (KeyManager.isLocked()) {
      return '[DM error: Your keys are locked. Unlock to read DMs.]';
    }
    if (!KeyManager.hasPrivateKey(userPubkey)) {
      return '[DM error: No private key available for this account]';
    }
    // Try normal order
    try {
      const decrypted = await KeyManager.decrypt(
        event.content,
        otherPubkey,
        userPubkey
      );
      return decrypted;
    } catch (e) {
      // Try swapped order if not sender
      if (!isSender) {
        try {
          const swappedDecrypted = await KeyManager.decrypt(
            event.content,
            userPubkey,
            otherPubkey
          );
          return swappedDecrypted;
        } catch (innerErr) {
          // Continue to error
        }
      }
      // If sender, don't swap
    }
    return '[DM error: Could not decrypt message with your key]';
  } catch (error) {
    if (KeyManager.isLocked()) {
      return '[DM error: Your keys are locked. Unlock to read DMs.]';
    }
    if (!KeyManager.hasPrivateKey(userPubkey)) {
      return '[DM error: No private key available for this account]';
    }
    return '[DM error: Could not decrypt message]';
  }
}

/**
 * Get the contact pubkey from a DM event (the other party in the conversation)
 * @param event DM event
 * @param currentUserPubkey Current user's pubkey
 * @returns The pubkey of the other party in the conversation
 */
export function getContactPubkeyFromEvent(event: AnyNostrEvent, currentUserPubkey: string): string {
  if (event.kind !== 4) {
    throw new Error('Not a direct message event');
  }
  
  // If we're the author, the contact is the recipient (p tag)
  if (event.pubkey === currentUserPubkey) {
    const recipientTag = event.tags.find(tag => tag[0] === 'p');
    if (!recipientTag || !recipientTag[1]) {
      throw new Error('Invalid DM event: missing recipient tag');
    }
    return recipientTag[1];
  }
  
  // Otherwise, we're the recipient, and the contact is the author
  return event.pubkey;
}

/**
 * Sort direct message events in chronological order
 * @param events Array of DM events
 * @returns Sorted array with newest messages last
 */
export function sortDirectMessages<T extends { created_at: number }>(events: T[]): T[] {
  return [...events].sort((a, b) => a.created_at - b.created_at);
}

/**
 * Mark a conversation as read
 * This functionality will be expanded when we have persistent storage
 */
export function markConversationAsRead(pubkey: string): void {
  // Placeholder for future implementation
  // Would update a local database or state management store
  console.log(`Marking conversation with ${pubkey} as read`);
}

/**
 * Helper to check if the current user has the necessary keys to send and decrypt messages
 */
export async function canSendDirectMessages(): Promise<boolean> {
  const { accounts, activeAccountId } = useUserStore.getState();
  const activeAccount = accounts.find(a => a.id === activeAccountId);
  
  if (!activeAccount) {
    return false;
  }
  
  // If using an extension, check if nip04 is available
  if (activeAccount.keyType === 'extension') {
    return !!((window as any).nostr?.nip04);
  }
  
  // If using a local key, check if it's unlocked
  if (activeAccount.keyType === 'local') {
    return !KeyManager.isLocked() && KeyManager.hasPrivateKey(activeAccount.pubkey);
  }
  
  return false;
}






