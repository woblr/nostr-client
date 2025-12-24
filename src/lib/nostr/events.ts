import { SimplePool, validateEvent, verifyEvent as nostrVerifyEvent } from 'nostr-tools';
import type { AnyNostrEvent } from '@/types/nostr';

// Default relays to publish to if no RelayManager is available.
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol'
];

// More reliable fallback relays if primary ones fail
const FALLBACK_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.current.fyi'
];

// Reuse a single SimplePool instance across publishes for efficiency.
const pool = new SimplePool();

// Simple in-memory rate limiter: ensure at least 1.5s between publishes.
let lastPublishAt = 0;
const MIN_INTERVAL_MS = 1500;
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Publish an already-signed Nostr event to the provided relays.
 * If no relay list is passed, a default list is used. Returns a list
 * of relay URLs that accepted the event.
 */
export async function publishEvent(
  event: AnyNostrEvent,
  relays: string[] = DEFAULT_RELAYS
): Promise<string[]> {
  // Basic sanity checks to avoid sending malformed data over the wire.
  if (!validateEvent(event) || !nostrVerifyEvent(event)) {
    throw new Error('Invalid or unsigned event');
  }

  // Respect simple global rate limit across publishes
  const now = Date.now();
  if (now - lastPublishAt < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - (now - lastPublishAt));
  }
  lastPublishAt = Date.now();

  // nostr-tools v2: pool.publish now returns a Promise per relay rather than an
  // EventEmitter. We publish to each relay individually and collect results via
  // Promise.allSettled.
  // Add timeout to each publish operation to avoid hanging
  const PUBLISH_TIMEOUT_MS = 3000; // 3 second timeout per relay
  
  const timeoutPromise = (ms: number) => {
    return new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Publish timed out after ${ms}ms`)), ms);
    });
  };
  
  const publishWithRetry = async (relay: string, attempt = 0): Promise<{relay: string, ok: boolean}> => {
    try {
      // Race the publish against a timeout
      await Promise.race([
        pool.publish([relay], event as any),
        timeoutPromise(PUBLISH_TIMEOUT_MS)
      ]);
      return { relay, ok: true } as const;
    } catch (err: any) {
      // If we've retried too many times, just give up on this relay
      if (attempt >= 2) {
        console.warn(`Failed to publish to ${relay} after ${attempt+1} attempts: ${err.message}`);
        return { relay, ok: false } as const;
      }
      
      // If relay complains about rate limiting or timeouts, back off and retry
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('rate-limit') || msg.includes('time') || msg.includes('restrict')) {
        await sleep((attempt + 1) * 1500); // exponential backoff 1.5s, 3s
        return publishWithRetry(relay, attempt + 1);
      }
      
      return { relay, ok: false } as const;
    }
  };

  const publishPromises = relays.map((relay) => publishWithRetry(relay));

  const outcomes = await Promise.allSettled(publishPromises);

  const accepted: string[] = [];
  const failed: string[] = [];

  outcomes.forEach((res) => {
    if (res.status === 'fulfilled') {
      if (res.value.ok) accepted.push(res.value.relay);
      else failed.push(res.value.relay);
    } else {
      failed.push(res.reason?.relay ?? 'unknown');
    }
  });

  // If primary relays all failed, try fallback relays before giving up
  if (accepted.length === 0 && relays !== FALLBACK_RELAYS) {
    console.warn('All primary relays rejected event, trying fallbacks');
    try {
      // Try publishing to fallback relays instead
      const fallbackAccepted = await publishEvent(event, FALLBACK_RELAYS);
      return fallbackAccepted;
    } catch (fallbackError) {
      console.error('Fallback relays also failed:', fallbackError);
      // Return empty array instead of throwing
      return [];
    }
  }

  return accepted;
}
