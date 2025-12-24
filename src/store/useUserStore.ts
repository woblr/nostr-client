"use client";
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nip19 } from 'nostr-tools';
import { KeyManager } from '@/lib/nostr/KeyManager';

export type UserAccount = {
  id: string; // Unique identifier for the account
  pubkey: string;
  displayName?: string;
  profilePicture?: string;
  name?: string;
  nip05?: string;
  lud16?: string;
  about?: string;
  keyType: 'local' | 'extension' | 'nostrConnect';
  encryptionStatus: 'none' | 'encrypted';
};

type UserState = {
  accounts: UserAccount[];
  activeAccountId: string | null;
  isLocked: boolean;
  passphraseSet: boolean;
  loadingState: 'idle' | 'loading' | 'success' | 'error';
};

type UserActions = {
  // Account selection
  setActiveAccount: (id: string) => void;
  
  // Login methods
  loginWithExtension: () => Promise<UserAccount | null>;
  loginWithNostrConnect: (uri: string) => Promise<UserAccount | null>;
  setLoadingState: (state: UserState['loadingState']) => void;
  
  // Account management
  addAccount: (account: Omit<UserAccount, 'id'>) => string;
  updateAccountMetadata: (id: string, metadata: Partial<UserAccount>) => void;
  removeAccount: (id: string) => void;
  
  // Security
  setPassphrase: (passphrase: string) => Promise<void>;
  verifyPassphrase: (passphrase: string) => Promise<boolean>;
  lockAccounts: () => void;
  unlockAccounts: (passphrase: string) => Promise<boolean>;
  // Logout
  logout: () => void;
};

export const useUserStore = create<UserState & UserActions>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountId: null,
      isLocked: false,
      passphraseSet: false,
      loadingState: 'idle',

      // Account selection
      setActiveAccount: (id) => {
        const account = get().accounts.find(a => a.id === id);
        if (account) {
          set({ activeAccountId: id });
        }
      },

      // Login methods
      loginWithExtension: async () => {
        try {
          set({ loadingState: 'loading' });
          
          // Check if window.nostr is available (NIP-07)
          if (!window.nostr) {
            throw new Error('Nostr extension not found. Please install a NIP-07 compatible extension.');
          }
          
          // Request public key from extension
          const pubkey = await window.nostr.getPublicKey();
          if (!pubkey) throw new Error('Could not get public key from extension');
          
          // Check if account already exists
          const existingAccount = get().accounts.find(a => a.pubkey === pubkey);
          if (existingAccount) {
            set({ activeAccountId: existingAccount.id, loadingState: 'success' });
            return existingAccount;
          }
          
          // Create a new account
          const accountId = crypto.randomUUID();
          const newAccount: UserAccount = {
            id: accountId,
            pubkey,
            keyType: 'extension',
            encryptionStatus: 'none',
          };
          
          set(state => ({ 
            accounts: [...state.accounts, newAccount],
            activeAccountId: accountId,
            loadingState: 'success'
          }));
          
          return newAccount;
        } catch (error) {
          console.error('Login error:', error);
          set({ loadingState: 'error' });
          return null;
        }
      },
      
      loginWithNostrConnect: async (uri) => {
        try {
          set({ loadingState: 'loading' });
          
          // TODO: Implement NIP-46 Nostr Connect
          // This would require setting up a connection with the remote signer
          // and implementing the protocol flow
          
          throw new Error('Nostr Connect not yet implemented');
          
        } catch (error) {
          console.error('Nostr Connect error:', error);
          set({ loadingState: 'error' });
          return null;
        }
      },
      
      setLoadingState: (state) => {
        set({ loadingState: state });
      },

      // Account management
      addAccount: (accountData) => {
        const id = crypto.randomUUID();
        const account: UserAccount = {
          ...accountData,
          id,
        };
        
        set(state => ({ 
          accounts: [...state.accounts, account],
          activeAccountId: id
        }));
        
        return id;
      },
      
      updateAccountMetadata: (id, metadata) => {
        set(state => ({
          accounts: state.accounts.map(account => 
            account.id === id 
              ? { ...account, ...metadata } 
              : account
          )
        }));
      },
      
      removeAccount: (id) => {
        set(state => {
          // Remove the account
          const newAccounts = state.accounts.filter(a => a.id !== id);
          
          // Update active account if needed
          let activeId = state.activeAccountId;
          if (activeId === id) {
            activeId = newAccounts.length > 0 ? newAccounts[0].id : null;
          }
          
          return {
            accounts: newAccounts,
            activeAccountId: activeId
          };
        });
      },

      // Security
      setPassphrase: async (passphrase) => {
        try {
          // Initialize KeyManager if needed
          await KeyManager.setEncryptionPassphrase(passphrase);
          set({ passphraseSet: true });
        } catch (error) {
          console.error('Error setting passphrase:', error);
          throw error;
        }
      },
      
      verifyPassphrase: async (passphrase) => {
        try {
          // Verify the passphrase against the stored hash/salt
          return await KeyManager.verifyPassphrase(passphrase);
        } catch (error) {
          console.error('Passphrase verification error:', error);
          return false;
        }
      },
      
      lockAccounts: () => {
        set({ isLocked: true });
      },
      
      unlockAccounts: async (passphrase) => {
        try {
          const isValid = await KeyManager.verifyPassphrase(passphrase);
          if (isValid) {
            await KeyManager.setEncryptionPassphrase(passphrase);
            set({ isLocked: false });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error unlocking accounts:', error);
          return false;
        }
      },

      // Logout implementation
      logout: () => {
        KeyManager.lock();
        set({ activeAccountId: null, isLocked: true });
      }
    }),
    {
      name: 'nostr-user-store',
      // Only persist some fields
      partialize: (state) => ({
        accounts: state.accounts.map(account => ({
          ...account,
          // Don't persist any private keys in the store
        })),
        activeAccountId: state.activeAccountId,
        isLocked: true, // Always lock on reload
        passphraseSet: state.passphraseSet
      }),
    }
  )
);

// Helper functions to access current user
export function useActiveAccount() {
  return useUserStore(state => {
    if (!state.activeAccountId) return null;
    return state.accounts.find(a => a.id === state.activeAccountId) || null;
  });
}

export function useActivePublicKey() {
  return useUserStore(state => {
    if (!state.activeAccountId) return null;
    const account = state.accounts.find(a => a.id === state.activeAccountId);
    return account?.pubkey || null;
  });
}

// Export types for convenience
export type { UserState };
