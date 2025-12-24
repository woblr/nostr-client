import { SimplePool, type Filter, type Event } from 'nostr-tools';
import { AnyNostrEvent } from '@/types/nostr';

// Define the Relay type that's used in DirectMessages component
export interface Relay {
  url: string;
  status: 'connected' | 'connecting' | 'error';
}

// SimplePool from nostr-tools for managing relay connections
const pool = new SimplePool();

// Active subscriptions
const subscriptions: Record<string, { close: () => void }> = {};

/**
 * Subscribe to events on relays with reliable connection handling
 */
export function subscribeToEvents(
  subId: string,
  relayUrls: string[],
  filter: Filter | Filter[],
  onEvent: (event: AnyNostrEvent, relay: Relay) => void
): { close: () => void } {
  // Clean up any existing subscription with this ID
  unsubscribe(subId);
  
  console.log(`Subscribing to ${subId} on relays:`, relayUrls);
  
  // Function to handle relay connection errors
  const handleConnectionError = (relay: string, error: any) => {
    console.error(`Relay connection error (${relay}):`, error);
  };

  // Create a new relay pool for this subscription to ensure fresh connections
  const subscriptionPool = new SimplePool();
  
  // Set a timeout to consider a subscription failed if no connection in 5 seconds
  const timeoutId = setTimeout(() => {
    console.warn(`Subscription ${subId} connection timeout after 5 seconds. Falling back to alternate relays.`);
    
    // Try alternate relays if initial ones fail
    const fallbackRelays = [
      'wss://relay.nostr.band', 
      'wss://nos.lol',
      'wss://purplepag.es'
    ];
    
    try {
      const fallbackSub = subscriptionPool.subscribe(fallbackRelays, filter as any, {
        onevent: handleEvent,
        onnotice: handleNotice,
        oneose: () => console.log(`Subscription ${subId} received EOSE from fallback relays`)
      } as any);
      
      // Replace the original subscription with the fallback
      if (subscriptions[subId]) {
        subscriptions[subId].close();
      }
      subscriptions[subId] = fallbackSub;
    } catch (fallbackError) {
      console.error('Fallback relay subscription also failed:', fallbackError);
    }
  }, 5000);
  
  // Event handler function
  const handleEvent = (event: any, relay: any) => {
    // Clear the timeout since we received an event
    clearTimeout(timeoutId);
    
    onEvent(event as unknown as AnyNostrEvent, {
      url: relay as string,
      status: 'connected'
    });
  };
  
  // Notice handler function
  const handleNotice = (notice: string, relay: any) => {
    // Suppress "blocked: pubkey not admitted" errors so they don't bubble up
    if (typeof notice === 'string' && notice.toLowerCase().includes('blocked')) {
      console.warn(`Relay notice (ignored): ${notice} @ ${relay}`);
      return;
    }
    console.warn(`Relay notice: ${notice} @ ${relay}`);
  };
  
  // Use any to bypass type checking for nostr-tools compatibility
  try {
    const sub = subscriptionPool.subscribe(relayUrls, filter as any, {
      onevent: handleEvent,
      onnotice: handleNotice,
      oneose: () => {
        console.log(`Subscription ${subId} received EOSE`);
        clearTimeout(timeoutId); // Clear the timeout on EOSE
      }
    } as any);
    
    // Store the subscription
    subscriptions[subId] = sub;
    
    // Return a wrapper object that matches the expected interface
    return {
      close: () => {
        clearTimeout(timeoutId); // Clear the timeout if we manually close
        if (sub) sub.close();
      }
    };
  } catch (error) {
    console.error('Failed to create subscription:', error);
    clearTimeout(timeoutId);
    
    // Return a dummy close function
    return {
      close: () => {}
    };
  }
}

/**
 * Unsubscribe from events
 */
export function unsubscribe(subId: string) {
  if (subscriptions[subId]) {
    subscriptions[subId].close();
    delete subscriptions[subId];
  }
}

/**
 * Publish an event to relays with enhanced reliability
 */
export async function publishToRelays(event: AnyNostrEvent, relayUrls: string[]) {
  console.log('Publishing event to relays:', relayUrls);
  
  // Create a separate pool for each publish operation to avoid connection sharing issues
  const publishPool = new SimplePool();
  
  // Define fallback relays to try if initial ones fail
  const fallbackRelays = [
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://purplepag.es'
  ];
  
  try {
    // Set a timeout for the publish operation
    const publishPromise = publishPool.publish(relayUrls, event);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Publish timed out after 5 seconds')), 5000);
    });
    
    // Race between the publish and the timeout
    return await Promise.race([publishPromise, timeoutPromise]);
  } catch (error) {
    console.error('Error publishing to primary relays:', error);
    console.log('Attempting to publish to fallback relays:', fallbackRelays);
    
    // If the original publish fails, try the fallback relays
    try {
      return await publishPool.publish(fallbackRelays, event);
    } catch (fallbackError) {
      console.error('Error publishing to fallback relays:', fallbackError);
      throw new Error('Failed to publish to any relay');
    }
  }
}

/**
 * Close all connections
 */
export function closeAllConnections() {
  Object.values(subscriptions).forEach(sub => sub.close());
}
