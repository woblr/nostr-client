import { KeyManager } from './KeyManager';
import { publishEvent } from './events';
import { useUserStore } from '@/store/useUserStore';

const STORAGE_KEY = 'following_pubkeys';

export function getFollowing(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function isFollowing(pubkey: string): boolean {
  return getFollowing().includes(pubkey);
}

/**
 * Publish updated contact list (kind:3) and persist locally.
 */
async function updateContactList(newList: string[]): Promise<void> {
  // Save optimistically to localStorage so UI updates even if publish fails later
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));

  try {
    const state = useUserStore.getState();
    const active = state.accounts.find(a => a.id === state.activeAccountId);
    if (!active) throw new Error('No active account');

    // Build event
    const event: any = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags: newList.map(pk => ['p', pk]),
      content: ''
    };

    // Sign
    const signed = await KeyManager.signEvent(event, active.pubkey);

    // Publish (throws if all relays reject)
    await publishEvent(signed);
  } catch (err) {
    console.error('[follow] Failed to publish contact list:', err);
    // Optionally revert localStorage on error; leaving as-is keeps UI consistent
  }
}

export async function follow(pubkey: string): Promise<void> {
  const current = new Set(getFollowing());
  current.add(pubkey);
  await updateContactList(Array.from(current));
}

export async function unfollow(pubkey: string): Promise<void> {
  const list = getFollowing().filter((p) => p !== pubkey);
  await updateContactList(list);
}
