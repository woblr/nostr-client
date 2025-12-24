"use client";
import React, { useState } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { useUserStore } from '@/store/useUserStore';
import { KeyManager } from '@/lib/nostr/KeyManager';
import Avatar from './Avatar';
import { PlusIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { NostrEvent, AnyNostrEvent } from '@/types/nostr';
import { Event as NostrToolsEvent } from 'nostr-tools';

interface Props {
  recommendations: NostrEvent[];
  onDismiss: () => void;
}

export default function FollowRecommendations({ recommendations, onDismiss }: Props) {
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const { manager } = useRelay();
  
  // Active user's public key
  const pubkey = useUserStore(state => {
    const activeAccountId = state.activeAccountId;
    if (!activeAccountId) return null;
    const account = state.accounts.find(a => a.id === activeAccountId);
    return account?.pubkey || null;
  });
  
  // Parse profile content JSON from kind:0 events
  const getProfileData = (event: NostrEvent) => {
    try {
      return JSON.parse(event.content);
    } catch {
      return {};
    }
  };
  
  const handleFollow = async (profilePubkey: string) => {
    if (!pubkey) return;
    
    // Mark as loading
    setIsLoading(prev => ({ ...prev, [profilePubkey]: true }));
    
    try {
      // Get current contact list
      const contactsId = `get-contacts-for-follow-${Date.now()}`;
      let existingContacts: string[] = [];
      
      // Create a promise to get contacts
      const getContactsPromise = new Promise<string[]>((resolve) => {
        manager.subscribe(contactsId, {
          kinds: [3],
          authors: [pubkey],
          limit: 1
        }, (ev) => {
          if (ev.kind === 3) {
            const contacts = ev.tags.filter(t => t[0] === 'p').map(t => t[1]);
            resolve(contacts);
            manager.unsubscribe(contactsId);
          }
        });
        
        // Timeout to resolve with empty list if no contacts found
        setTimeout(() => {
          resolve([]);
          manager.unsubscribe(contactsId);
        }, 3000);
      });
      
      existingContacts = await getContactsPromise;
      
      // Skip if already followed
      if (existingContacts.includes(profilePubkey)) {
        setFollowed(prev => new Set([...prev, profilePubkey]));
        return;
      }
      
      // Create updated contact list event
      const updatedContacts = [...existingContacts, profilePubkey];
      const tags = updatedContacts.map(pk => ['p', pk]);
      
      // Get the active account to determine key type
      const activeAccount = useUserStore.getState().accounts.find(
        a => a.pubkey === pubkey
      );
      
      // Create the unsigned event
      const unsignedEvent = {
        kind: 3,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: '',
        pubkey
      };
      
      // Sign the event based on account type
      let signedEvent;
      
      if (activeAccount?.keyType === 'extension' && window.nostr) {
        // Use NIP-07 browser extension
        try {
          // NIP-07 implementation expects just the event object
          signedEvent = await window.nostr.signEvent(unsignedEvent);
        } catch (err) {
          console.error('Error signing with extension:', err);
          throw new Error('Failed to sign with extension');
        }
      } else if (activeAccount?.keyType === 'local') {
        // Use local KeyManager
        try {
          // KeyManager.signEvent requires both event and pubkey
          signedEvent = await KeyManager.signEvent(unsignedEvent, pubkey);
        } catch (err) {
          console.error('Error signing with local key:', err);
          throw new Error('Failed to sign with local key');
        }
      } else {
        throw new Error('No signing method available');
      }
      
      // Publish the signed event
      // RelayManager.publish expects AnyNostrEvent and handles conversion internally
      await manager.publish(signedEvent as AnyNostrEvent);
      
      // Update UI
      setFollowed(prev => new Set([...prev, profilePubkey]));
    } catch (error) {
      console.error('Failed to follow user:', error);
    } finally {
      setIsLoading(prev => ({ ...prev, [profilePubkey]: false }));
    }
  };
  
  // Can dismiss when at least one user is followed
  const canDismiss = followed.size > 0;
  
  if (recommendations.length === 0) {
    return null;
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700/30 overflow-hidden mb-6">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700/30 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Suggested Users to Follow</h2>
        {canDismiss && (
          <button 
            onClick={onDismiss} 
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            aria-label="Dismiss recommendations"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>
      
      <div className="divide-y divide-gray-100 dark:divide-gray-700/30">
        {recommendations.map(event => {
          const profile = getProfileData(event);
          const isFollowing = followed.has(event.pubkey);
          const loading = isLoading[event.pubkey];
          
          return (
            <div key={event.id} className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <Avatar 
                    pubkey={event.pubkey} 
                    size={44} 
                    picture={profile.picture} 
                    className="ring-2 ring-white dark:ring-gray-700" 
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {profile.display_name || profile.name || event.pubkey.substring(0, 8)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {profile.nip05 || `@${event.pubkey.substring(0, 8)}`}
                  </p>
                  {profile.about && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                      {profile.about}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleFollow(event.pubkey)}
                disabled={isFollowing || loading}
                className={`ml-4 flex-shrink-0 px-3 py-1 text-xs font-medium rounded-full ${
                  isFollowing 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/40'
                } flex items-center gap-1 transition-colors`}
              >
                {loading ? (
                  <ArrowPathIcon className="h-3 w-3 animate-spin" />
                ) : isFollowing ? (
                  'Following'
                ) : (
                  <>
                    <PlusIcon className="h-3 w-3" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
      
      {!canDismiss && (
        <div className="p-3 bg-gray-50 dark:bg-gray-700/30 text-center text-xs text-gray-500 dark:text-gray-400">
          Follow at least one user to access your personalized feed
        </div>
      )}
    </div>
  );
}
