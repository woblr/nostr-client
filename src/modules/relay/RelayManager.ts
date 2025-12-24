import { SimplePool, type Filter, Event as NostrToolsEvent } from 'nostr-tools';

type Subscription = { close: (reason?: string) => void };
import { AnyNostrEvent } from '@/types/nostr';

export class RelayManager {
  // Track connection status
  private connectionStatus: Record<string, 'connected' | 'connecting' | 'error'> = {};
  private pool: SimplePool;
  private subs: Record<string, Subscription> = {};

  /**
   * Get a copy of the current relay list.
   */
  getRelays(): string[] {
    return [...this.relays];
  }

  constructor(private relays: string[] = []) {
    this.pool = new SimplePool();
    
    // Initialize connection status for each relay
    this.relays.forEach(url => {
      this.connectionStatus[url] = 'connecting';
    });
  }

  addRelay(url: string) {
    if (!this.relays.includes(url)) {
      this.relays.push(url);
      this.connectionStatus[url] = 'connecting';
    }
  }

  removeRelay(url: string) {
    this.relays = this.relays.filter((r) => r !== url);
    delete this.connectionStatus[url];
  }

  async publish(event: AnyNostrEvent) {
    try {
      // Try to publish to all relays with a timeout
      const publishPromise = this.pool.publish(this.relays, event as NostrToolsEvent);
      
      // Add a timeout to prevent hanging UI
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Global publish timeout')), 5000);
      });
      
      // Race the publish against the timeout
      return await Promise.race([publishPromise, timeoutPromise])
        .catch(err => {
          console.warn('Relay publish error (handled):', err.message);
          // Return the successful relays if any, otherwise empty array
          return [];
        });
    } catch (error) {
      // Catch and log any other errors without crashing the app
      console.warn('Relay publish exception (handled):', error);
      return [];
    }
  }

  subscribe(id: string, filter: Filter, onEvent: (ev: AnyNostrEvent) => void) {
    this.unsubscribe(id);
    this.subs[id] = this.pool.subscribe(this.relays, filter, {
      onevent: (ev: NostrToolsEvent) => onEvent(ev as AnyNostrEvent),
    }) as unknown as Subscription;
  }

  unsubscribe(id: string) {
    if (this.subs[id]) {
      this.subs[id].close();
      delete this.subs[id];
    }
  }

  /**
   * Get connection status statistics
   */
  getStatus() {
    const stats = {
      connected: 0,
      connecting: 0,
      error: 0,
      total: this.relays.length
    };
    
    // Count relays by status
    Object.values(this.connectionStatus).forEach(status => {
      stats[status]++;
    });
    
    return stats;
  }
  
  close() {
    Object.values(this.subs).forEach((sub) => sub.close());
    this.pool.close(this.relays);
  }
}
