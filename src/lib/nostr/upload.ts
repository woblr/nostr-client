import { KeyManager } from './KeyManager';
import { AnyNostrEvent } from '@/types/nostr';
import { useUserStore } from '@/store/useUserStore';
import { EventEmitter } from 'events';

export interface UploadResult {
  url: string;
  thumbnail?: string;
}

interface UploadEvents {
  progress: (loaded: number, total: number) => void;
}

/**
 * Upload file emitter for progress tracking
 */
export class UploadEmitter extends EventEmitter {
  on<E extends keyof UploadEvents>(event: E, listener: UploadEvents[E]): this {
    return super.on(event, listener);
  }
  
  once<E extends keyof UploadEvents>(event: E, listener: UploadEvents[E]): this {
    return super.once(event, listener);
  }
  
  emit<E extends keyof UploadEvents>(event: E, ...args: Parameters<UploadEvents[E]>): boolean {
    return super.emit(event, ...args);
  }
}

/**
 * Upload a file using NIP-95 spec with the user's own key
 * This allows users to authenticate uploads with their Nostr identity
 */
export async function uploadWithNip95(
  file: File,
  emitter?: UploadEmitter
): Promise<UploadResult> {
  // Get the active account
  const { accounts, activeAccountId } = useUserStore.getState();
  const active = accounts.find(a => a.id === activeAccountId);
  
  if (!active) {
    throw new Error('No active Nostr account selected');
  }
  
  // Create pre-signed upload event (NIP-95)
  const preEvent = {
    kind: 27235, // NIP-95 file metadata event
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['url', ''],                                // Will be filled by server
      ['m', file.type],                           // MIME type
      ['x', `${file.size}`],                      // File size in bytes
      ['dim', ''],                                // Dimensions, will be filled if image
      ['blurhash', ''],                           // Blurhash, will be filled if image
      ['ox', 'nostr.build'],                      // Service provider
      ['alt', `File: ${file.name}`]               // Alt text for accessibility
    ],
    content: file.name,                           // Filename as content
    pubkey: active.pubkey,
  };
  
  // Have user sign the event
  let signedEvent: AnyNostrEvent;
  try {
    signedEvent = await KeyManager.signEvent(preEvent, active.pubkey);
  } catch (err: any) {
    throw new Error(`Failed to sign upload request: ${err?.message || 'Unknown error'}`);
  }
  
  // Create form with file and signed event
  const form = new FormData();
  form.append('file', file);
  form.append('event', JSON.stringify(signedEvent));
  
  // Custom fetch with progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://nostr.build/api/v2/nip95/upload');
    
    // Track upload progress
    if (emitter) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          emitter.emit('progress', e.loaded, e.total);
        }
      };
    }
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.status !== 'success') {
            reject(new Error(response.message || 'Upload failed'));
            return;
          }
          resolve({
            url: response.data.url,
            thumbnail: response.data.thumbnail
          });
        } catch (e: any) {
          reject(new Error(`Invalid response from server: ${e?.message || 'JSON parse error'}`));
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    
    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };
    
    xhr.send(form);
  });
}

/**
 * Legacy uploader using API token
 * Kept for compatibility
 */
export async function uploadToNostrBuildWithToken(file: File): Promise<UploadResult> {
  const endpoint = 'https://nostr.build/api/v2/upload/files';
  const form = new FormData();
  form.append('file[]', file, file.name);

  // helper that executes fetch with optional Authorization header
  const doUpload = async (token?: string) => {
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(endpoint, { method: 'POST', body: form, headers });
  };

  // Always try with stored token first if available
  let token = localStorage.getItem('nostrBuildToken') || '';
  let res;
  
  if (token) {
    console.log('Using stored nostr.build API token');
    res = await doUpload(token);
  } else {
    // Try without token (public upload) if no stored token
    console.log('No token found, attempting public upload');
    res = await doUpload();
  }

  // If unauthorized, clear the token and prompt for a new one
  if (res.status === 401) {
    console.log('Upload returned 401 unauthorized, prompting for token');
    // Clear existing token as it may be invalid
    localStorage.removeItem('nostrBuildToken');
    
    // Prompt for new token
    token = window.prompt('nostr.build requires an API token for uploads. Please enter your API token:') || '';
    
    if (!token) {
      throw new Error('API token required for nostr.build uploads');
    }
    
    // Store the new token and try again
    localStorage.setItem('nostrBuildToken', token);
    console.log('Retrying upload with new token');
    res = await doUpload(token);
    
    // If still not authorized, give up
    if (res.status === 401) {
      throw new Error('Invalid API token provided');
    }
  }

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
  
  try {
    const json = await res.json();
    if (json.status !== 'success' || !json.data || !json.data.length) {
      throw new Error(json.message || 'Upload failed');
    }
    const item = json.data[0];
    return { url: item.url as string, thumbnail: item.thumbnail as string };
  } catch (err: any) {
    console.error('Error parsing upload response:', err);
    throw new Error(`Failed to parse upload response: ${err?.message || 'Unknown error'}`);
  }
}

// Main export that attempts NIP-95 first, then falls back to token-based upload if that fails
export async function uploadToNostrBuild(file: File, emitter?: UploadEmitter): Promise<UploadResult> {
  try {
    return await uploadWithNip95(file, emitter);
  } catch (err: any) {
    console.warn('NIP-95 upload failed, falling back to token-based upload:', err?.message || 'Unknown error');
    
    // Create progress emitter for token-based upload if supported
    if (emitter) {
      emitter.emit('progress', 0, 100); // Starting progress
    }
    
    // Try with token-based upload as fallback
    const result = await uploadToNostrBuildWithToken(file);
    
    // Signal completion if emitter exists
    if (emitter) {
      emitter.emit('progress', 100, 100); // Complete progress
    }
    
    return result;
  }
}
