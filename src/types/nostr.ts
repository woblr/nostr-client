// Core Nostr event and tag types based on NIP specs
// https://github.com/nostr-protocol/nips

export type Hex = string; // 64-char lowercase hex string
export type Timestamp = number; // seconds since epoch

export interface BaseEvent<T = unknown> {
  id: Hex; // 32-byte sha256 of serialized event
  pubkey: Hex; // 32-byte hex of public key
  created_at: Timestamp;
  kind: number;
  tags: Tag[];
  content: T;
  sig: Hex; // 64-byte signature
}

export type Tag = [string, ...string[]];

export interface NostrEvent extends BaseEvent<string> {}

// Reaction event (NIP-25) kind 7 with optional emoji
export interface ReactionEvent extends BaseEvent<string> {
  kind: 7;
}


// Direct Message event (NIP-04) kind 4 (encrypted content)
export interface DMEvent extends BaseEvent<string> {
  kind: 4;
  // content is ciphertext base64
  decrypted?: string; // Decrypted content (added after decryption)
}

// Relay metadata event (NIP-11 & NIP-65) kinds 2 & 10002
export interface RelayMetadataEvent extends BaseEvent<string> {
  kind: 2 | 10002;
}

// Etc.
export type AnyNostrEvent = NostrEvent | ReactionEvent | DMEvent | RelayMetadataEvent;
