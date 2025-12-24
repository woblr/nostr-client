/**
 * NIP-92 (Media Attachments) and NIP-94 (File Metadata)
 * Implementation for file handling in Nostr
 */

import { AnyNostrEvent } from '@/types/nostr';
import { KeyManager } from './KeyManager';
import { publishEvent } from './events';
import { UploadResult } from './upload';

/**
 * Options for generating file metadata
 */
export interface FileMetadataOptions {
  url: string;
  mimeType: string;
  fileSize?: number;
  dimensions?: { width: number; height: number };
  blurhash?: string;
  thumbnailUrl?: string;
  sha256hash?: string;
  originalSha256?: string;
  altText?: string;
  fallbackUrls?: string[];
  service?: string;
}

/**
 * Generate a SHA-256 hash for a file
 * Returns a hex-encoded string
 */
export async function calculateSHA256(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (!e.target?.result) {
        reject(new Error('Failed to read file'));
        return;
      }
      
      try {
        // Use the Web Crypto API to calculate hash
        const buffer = e.target.result as ArrayBuffer;
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        
        // Convert the hash to hex string
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        resolve(hashHex);
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = (e) => {
      reject(new Error('Error reading file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generate a blurhash for an image
 * This creates a compact string representing a blurry placeholder
 * Returns null if the image can't be processed
 */
export async function generateBlurhash(file: File): Promise<string | null> {
  // Only process images
  if (!file.type.startsWith('image/')) {
    return null;
  }
  
  // Use a lightweight implementation since we don't want to include
  // the full blurhash library as a dependency
  return new Promise((resolve) => {
    // For now we'll just return null as implementing 
    // blurhash encoding is out of scope here
    resolve(null);
  });
}

/**
 * Get dimensions of an image file
 */
export function getImageDimensions(file: File): Promise<{width: number; height: number} | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null);
      return;
    }
    
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    
    img.onload = () => {
      const dimensions = {
        width: img.width,
        height: img.height
      };
      URL.revokeObjectURL(objectUrl);
      resolve(dimensions);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    
    img.src = objectUrl;
  });
}

/**
 * Create NIP-92 imeta tag for a file
 * Returns array format ready to be included in event tags
 */
export async function createImetaTag(file: File, url: string, options: Partial<FileMetadataOptions> = {}): Promise<string[]> {
  const tag = ['imeta'];
  
  // Required: URL
  tag.push(`url ${url}`);
  
  // Required: MIME type
  tag.push(`m ${file.type}`);
  
  // Optional: file dimensions for images
  const dimensions = await getImageDimensions(file);
  if (dimensions) {
    tag.push(`dim ${dimensions.width}x${dimensions.height}`);
  }
  
  // Optional: file size
  tag.push(`size ${file.size}`);
  
  // Optional: SHA-256 hash
  try {
    const hash = await calculateSHA256(file);
    if (hash) tag.push(`x ${hash}`);
  } catch (err) {
    console.warn('Failed to calculate file hash:', err);
  }
  
  // Optional: blurhash for images
  if (file.type.startsWith('image/')) {
    const blurhash = await generateBlurhash(file);
    if (blurhash) tag.push(`blurhash ${blurhash}`);
  }
  
  // Optional: alt text if provided
  if (options.altText) {
    tag.push(`alt ${options.altText}`);
  }
  
  // Optional: add fallback URLs
  if (options.fallbackUrls && options.fallbackUrls.length > 0) {
    for (const fallbackUrl of options.fallbackUrls) {
      tag.push(`fallback ${fallbackUrl}`);
    }
  }
  
  return tag;
}

/**
 * Create and publish a NIP-94 File Metadata event (kind: 1063)
 */
export async function publishFileMetadataEvent(
  pubkey: string,
  options: FileMetadataOptions,
  description: string = '',
  relays: string[]
): Promise<AnyNostrEvent> {
  // Prepare tags
  const tags: string[][] = [
    ['url', options.url],
    ['m', options.mimeType]
  ];
  
  // Add hash if available
  if (options.sha256hash) {
    tags.push(['x', options.sha256hash]);
  }
  
  // Add original file hash if available
  if (options.originalSha256) {
    tags.push(['ox', options.originalSha256]);
  }
  
  // Add file size if available
  if (options.fileSize) {
    tags.push(['size', options.fileSize.toString()]);
  }
  
  // Add dimensions if available
  if (options.dimensions) {
    const { width, height } = options.dimensions;
    tags.push(['dim', `${width}x${height}`]);
  }
  
  // Add blurhash if available
  if (options.blurhash) {
    tags.push(['blurhash', options.blurhash]);
  }
  
  // Add thumbnail if available
  if (options.thumbnailUrl) {
    tags.push(['thumb', options.thumbnailUrl]);
  }
  
  // Add alt text if available
  if (options.altText) {
    tags.push(['alt', options.altText]);
  }
  
  // Add fallback URLs if available
  if (options.fallbackUrls && options.fallbackUrls.length > 0) {
    for (const fallbackUrl of options.fallbackUrls) {
      tags.push(['fallback', fallbackUrl]);
    }
  }
  
  // Add service if available
  if (options.service) {
    tags.push(['service', options.service]);
  }
  
  // Create the event
  const event = {
    kind: 1063,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: description,
    pubkey,
  };
  
  // Sign the event
  const signedEvent = await KeyManager.signEvent(event, pubkey);
  
  // Publish to relays
  await publishEvent(signedEvent, relays);
  
  return signedEvent;
}

/**
 * Process an uploaded file and generate NIP-92 and NIP-94 metadata
 * Can be used when uploading a file to enhance with proper metadata
 */
export async function processFileMetadata(
  file: File, 
  uploadResult: UploadResult, 
  pubkey: string,
  options: {
    publishNip94Event?: boolean;
    altText?: string;
    description?: string;
    relays?: string[];
  } = {}
): Promise<{
  imetaTag: string[];
  nip94Event?: AnyNostrEvent;
}> {
  const { url, thumbnail } = uploadResult;
  
  // Calculate file hash
  let hash: string | undefined;
  try {
    hash = await calculateSHA256(file);
  } catch (err) {
    console.warn('Failed to calculate file hash:', err);
  }
  
  // Get dimensions for images
  let dimensions: {width: number; height: number} | null = null;
  if (file.type.startsWith('image/')) {
    dimensions = await getImageDimensions(file);
  }
  
  // Generate blurhash for images (placeholder/stub)
  let blurhash: string | null = null;
  if (file.type.startsWith('image/')) {
    blurhash = await generateBlurhash(file);
  }
  
  // Create metadata options
  const metadataOptions: FileMetadataOptions = {
    url,
    mimeType: file.type,
    fileSize: file.size,
    sha256hash: hash,
    thumbnailUrl: thumbnail,
    altText: options.altText,
  };
  
  if (dimensions) {
    metadataOptions.dimensions = dimensions;
  }
  
  if (blurhash) {
    metadataOptions.blurhash = blurhash;
  }
  
  // Create imeta tag (NIP-92)
  const imetaTag = await createImetaTag(file, url, {
    altText: options.altText,
  });
  
  // Publish NIP-94 metadata event if requested
  let nip94Event: AnyNostrEvent | undefined;
  if (options.publishNip94Event) {
    try {
      nip94Event = await publishFileMetadataEvent(
        pubkey,
        metadataOptions,
        options.description || '',
        options.relays || []
      );
    } catch (err) {
      console.error('Failed to publish NIP-94 event:', err);
    }
  }
  
  return {
    imetaTag,
    nip94Event
  };
}
