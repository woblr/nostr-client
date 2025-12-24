// @ts-ignore - some versions of nostr-tools do not include finalizeEvent in type definitions but the function exists at runtime
// @ts-ignore finalizeEvent is present at runtime but sometimes missing in types
import { generateSecretKey, getPublicKey, nip19, utils, finalizeEvent, nip04 } from 'nostr-tools';
import * as crypto from 'crypto-js';

const { bytesToHex, hexToBytes } = utils;

// Interface for stored keys
interface StoredKey {
  pubkey: string;
  encryptedPrivateKey?: string; // Will be undefined for extension/external signers
  encryptionIV?: string;
}

interface NostrWindow { 
  nostr?: {
    getPublicKey: () => Promise<string>;
    signEvent: (event: any) => Promise<any>;
    nip04: {
      encrypt: (pubkey: string, content: string) => Promise<string>;
      decrypt: (pubkey: string, content: string) => Promise<string>;
    };
  }
}

declare global {
  interface Window extends NostrWindow {}
}

export class KeyManager {
  private static STORAGE_KEY = 'nostr-key-storage';
  private static SALT_KEY = 'nostr-encryption-salt';
  private static HASH_KEY = 'nostr-passphrase-hash';
  private static currentPassphrase: string | null = null;

  /**
   * Generate a new key pair (private/public)
   */
  static createNewKeyPair() {
    const skBytes = generateSecretKey();
    const pk = getPublicKey(skBytes);
    const sk = bytesToHex(skBytes);
    return { sk, pk };
  }

  /**
   * Save a private key securely
   * @param pubkey Public key
   * @param privkey Private key (hex)
   */
  static async saveKey(pubkey: string, privkey: string): Promise<boolean> {
    try {
      // Check if we have a passphrase set
      if (!this.currentPassphrase) {
        throw new Error('No passphrase set for encryption');
      }

      // Encrypt the private key
      const iv = crypto.lib.WordArray.random(16).toString();
      const encrypted = crypto.AES.encrypt(privkey, this.currentPassphrase, {
        iv: crypto.enc.Hex.parse(iv)
      }).toString();

      // Get existing keys
      const existingKeys = this.getStoredKeys();

      // Add or update the key
      const updatedKeys = {
        ...existingKeys,
        [pubkey]: {
          pubkey,
          encryptedPrivateKey: encrypted,
          encryptionIV: iv
        }
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedKeys));
      return true;
    } catch (error) {
      console.error('Error saving key:', error);
      return false;
    }
  }

  /**
   * Retrieve a private key by pubkey (requires unlocked state)
   */
  static getPrivateKey(pubkey: string): string | null {
    try {
      if (!this.currentPassphrase) {
        throw new Error('No passphrase set - system is locked');
      }

      const keys = this.getStoredKeys();
      const keyData = keys[pubkey];
      
      if (!keyData || !keyData.encryptedPrivateKey || !keyData.encryptionIV) {
        return null;
      }

      // Decrypt
      const decrypted = crypto.AES.decrypt(
        keyData.encryptedPrivateKey,
        this.currentPassphrase,
        {
          iv: crypto.enc.Hex.parse(keyData.encryptionIV)
        }
      );

      return decrypted.toString(crypto.enc.Utf8);
    } catch (error) {
      console.error('Error getting private key:', error);
      return null;
    }
  }

  /**
   * Delete a stored key
   */
  static deleteKey(pubkey: string): boolean {
    try {
      const keys = this.getStoredKeys();
      if (!keys[pubkey]) return false;

      delete keys[pubkey];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(keys));
      return true;
    } catch (error) {
      console.error('Error deleting key:', error);
      return false;
    }
  }

  /**
   * Encrypt a message using NIP-04
   * @param recipientPubkey Public key of the recipient
   * @param content Content to encrypt
   * @param senderPubkey Public key of the sender (must have private key available)
   */
  static async encrypt(recipientPubkey: string, content: string, senderPubkey: string): Promise<string> {
    // Check if we have the sender's private key
    if (!this.hasPrivateKey(senderPubkey)) {
      throw new Error('Private key not available for the sender');
    }

    // Get the private key
    const privateKey = this.getPrivateKey(senderPubkey);
    if (!privateKey) {
      throw new Error('Failed to retrieve private key');
    }

    // Use nostr-tools nip04 to encrypt
    return await nip04.encrypt(privateKey, recipientPubkey, content);
  }

  /**
   * Decrypt a message using NIP-04
   * @param encryptedContent Encrypted content
   * @param otherPartyPubkey Public key of the other party (sender for received messages, recipient for sent messages)
   * @param userPubkey User's public key (must have private key available)
   */
  static async decrypt(encryptedContent: string, otherPartyPubkey: string, userPubkey: string): Promise<string> {
    // Check if we have the user's private key
    if (!this.hasPrivateKey(userPubkey)) {
      throw new Error('Private key not available for decryption');
    }

    // Get the private key
    const privateKey = this.getPrivateKey(userPubkey);
    if (!privateKey) {
      throw new Error('Failed to retrieve private key for decryption');
    }

    // Use nostr-tools nip04 to decrypt
    return await nip04.decrypt(privateKey, otherPartyPubkey, encryptedContent);
  }

  /**
   * Get all stored keys (public keys only)
   */
  static getStoredKeys(): Record<string, StoredKey> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return {};
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error getting stored keys:', error);
      return {};
    }
  }

  /**
   * List all stored public keys
   */
  static getStoredPublicKeys(): string[] {
    const keys = this.getStoredKeys();
    return Object.keys(keys);
  }

  /**
   * Sets up encryption passphrase and stores a salted hash for verification
   */
  static async setEncryptionPassphrase(passphrase: string): Promise<boolean> {
    try {
      // Generate a salt if it doesn't exist
      if (typeof localStorage === 'undefined') {
        console.error('localStorage is unavailable (SSR context).');
        return false;
      }
      // Ensure we have a non-null salt string
      let saltStr = localStorage.getItem(this.SALT_KEY);
      if (!saltStr) {
        saltStr = crypto.lib.WordArray.random(128 / 8).toString();
        localStorage.setItem(this.SALT_KEY, saltStr!);
      }

      // Generate and store the hash
      const hash = crypto.PBKDF2(passphrase, saltStr, {
        keySize: 512 / 32,
        iterations: 1000
      }).toString();

      localStorage.setItem(this.HASH_KEY, hash);

      // Set the current passphrase for the session
      this.currentPassphrase = passphrase;
      return true;
    } catch (error) {
      console.error('Error setting passphrase:', error);
      return false;
    }
  }

  /**
   * Verify a passphrase against stored hash
   */
  static async verifyPassphrase(passphrase: string): Promise<boolean> {
    try {
      const saltStr = localStorage.getItem(this.SALT_KEY);
      const storedHash = localStorage.getItem(this.HASH_KEY);

      if (!saltStr || !storedHash) {
        return false;
      }

      // Generate hash from provided passphrase
      const hash = crypto.PBKDF2(passphrase, saltStr, {
        keySize: 512 / 32,
        iterations: 1000
      }).toString();

      // Compare hashes
      return hash === storedHash;
    } catch (error) {
      console.error('Error verifying passphrase:', error);
      return false;
    }
  }

  /**
   * Import a key from various formats (hex, nsec, npub)
   */
  static importKey(keyString: string): { sk: string | null; pk: string } | null {
    try {
      // Handle nsec format
      if (keyString.startsWith('nsec')) {
        const { type, data } = nip19.decode(keyString);
        if (type !== 'nsec') throw new Error('Invalid nsec key');
        const sk = bytesToHex(data as unknown as Uint8Array);
        const pkHex = getPublicKey(data as unknown as Uint8Array);
        return { sk, pk: pkHex };
      }
      
      // Handle npub format (public key only)
      else if (keyString.startsWith('npub')) {
        const { type, data } = nip19.decode(keyString);
        if (type !== 'npub') throw new Error('Invalid npub key');
        const pkHex = bytesToHex(data as unknown as Uint8Array);
        return { sk: null, pk: pkHex };
      }
      
      // Handle raw hex private key
      else if (/^[0-9a-f]{64}$/i.test(keyString)) {
        const sk = keyString;
        const pk = getPublicKey(hexToBytes(sk));
        return { sk, pk };
      }
      
      throw new Error('Unsupported key format');
    } catch (error) {
      console.error('Error importing key:', error);
      return null;
    }
  }

  /**
   * Export a key in bech32 format (nsec/npub)
   */
  static exportKey(pubkey: string, format: 'nsec' | 'npub' = 'npub'): string | null {
    try {
      if (format === 'npub') {
        return nip19.npubEncode(pubkey);
      } else if (format === 'nsec') {
        const privateKey = this.getPrivateKey(pubkey);
        if (!privateKey) return null;
        // @ts-ignore
        return nip19.nsecEncode(hexToBytes(privateKey!));
      }
      return null;
    } catch (error) {
      console.error('Error exporting key:', error);
      return null;
    }
  }

  /**
   * Check if a key entry exists for pubkey (might be extension-only)
   */
  static hasKey(pubkey: string): boolean {
    const keys = this.getStoredKeys();
    return !!keys[pubkey];
  }

  /**
   * Check if we have an encrypted private key stored for this pubkey
   */
  static hasPrivateKey(pubkey: string): boolean {
    const keys = this.getStoredKeys();
    const entry = keys[pubkey];
    return !!(entry && entry.encryptedPrivateKey && entry.encryptionIV);
  }

  /**
   * Check if system is locked (no passphrase set in memory)
   */
  static isLocked(): boolean {
    return this.currentPassphrase === null;
  }

  /**
   * Lock the system by clearing the passphrase from memory
   */
  static lock(): void {
    this.currentPassphrase = null;
  }

  /**
   * Unlock with existing passphrase (does not overwrite stored hash)
   */
  static async unlockPassphrase(passphrase: string): Promise<boolean> {
    const valid = await this.verifyPassphrase(passphrase);
    if (valid) {
      this.currentPassphrase = passphrase;
      return true;
    }
    return false;
  }

  /**
   * Sign an event using the appropriate method.
   * Attempts local unlocked private-key first, then falls back to NIP-07.
   */
  static async signEvent(event: any, pubkey: string): Promise<any> {
    let privateKey: string | null = null;
    console.log(`[KeyManager] Attempting to sign event for pubkey: ${pubkey.slice(0,8)}...`);
    console.log(`[KeyManager] System locked: ${this.isLocked()}`);
    console.log(`[KeyManager] Has stored key entry: ${this.hasKey(pubkey)}`);
    console.log(`[KeyManager] Has private key: ${this.hasPrivateKey(pubkey)}`);

    // 1. Try locally stored private key
    if (this.hasPrivateKey(pubkey)) {
      console.log('[KeyManager] Found encrypted private key, attempting to use it...');
      privateKey = this.getPrivateKey(pubkey);
      
      // If locked, prompt the user for their pass-phrase on-the-fly
      if (!privateKey && typeof window !== 'undefined') {
        console.log('[KeyManager] Private key is null, system is likely locked. Prompting for passphrase...');
        const passphrase = window.prompt('Enter passphrase to unlock your keys for signing');
        if (passphrase) {
          const unlocked = await this.unlockPassphrase(passphrase);
          if (unlocked) {
            console.log('[KeyManager] Successfully unlocked with passphrase');
            privateKey = this.getPrivateKey(pubkey);
            if (!privateKey) {
              console.log('[KeyManager] Still could not get private key after unlock, this is unexpected');
            }
          } else {
            console.log('[KeyManager] Failed to unlock - invalid passphrase');
          }
        } else {
          console.log('[KeyManager] User cancelled passphrase prompt');
        }
      }

      if (privateKey) {
        console.log('[KeyManager] Got private key, finalizing event...');
        const prepared = {
          ...event,
          pubkey,
          created_at: event.created_at || Math.floor(Date.now() / 1000),
          tags: event.tags || [],
        };
        // nostr-tools expects Uint8Array private-key bytes
        // @ts-ignore
        return finalizeEvent(prepared as any, hexToBytes(privateKey!));
      }
    } else {
      console.log('[KeyManager] No encrypted private key found for this pubkey');
    }

    // 2. Fallback to a NIP-07 browser extension if available
    console.log('[KeyManager] Checking for NIP-07 extension...');
    if (typeof window !== 'undefined' && (window as unknown as NostrWindow).nostr?.signEvent) {
      try {
        console.log('[KeyManager] NIP-07 extension found, attempting to sign...');
        return await (window as unknown as NostrWindow).nostr!.signEvent(event);
      } catch (error) {
        console.error('NIP-07 signing error:', error);
      }
    }

    // 3. Give up – nothing can sign this event.
    console.error('[KeyManager] FAILED: No method available to sign event - neither local key nor extension worked');
    console.error(`[KeyManager] Debug info: isLocked=${this.isLocked()}, hasPrivKey=${this.hasPrivateKey(pubkey)}, hasNip07=${typeof window !== 'undefined' && !!(window as unknown as NostrWindow).nostr}`);
    throw new Error('No method available to sign event. Either unlock your private key with your passphrase or install a NIP-07 browser extension like nos2x.');
  }
}
