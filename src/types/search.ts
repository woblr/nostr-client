import { AnyNostrEvent } from './nostr';

export type SearchResultType = 'user' | 'post' | 'hashtag';

export interface SearchResultBase {
  type: SearchResultType;
  id: string;
}

export interface UserSearchResult extends SearchResultBase {
  type: 'user';
  pubkey: string;
  name?: string;
  displayName?: string;
  nip05?: string;
  picture?: string;
  about?: string;
  event?: AnyNostrEvent;
}

export interface PostSearchResult extends SearchResultBase {
  type: 'post';
  event: AnyNostrEvent;
  authorPubkey: string;
  content: string;
  createdAt: number;
}

export interface HashtagSearchResult extends SearchResultBase {
  type: 'hashtag';
  tag: string;
  count?: number;
}

export type SearchResult = UserSearchResult | PostSearchResult | HashtagSearchResult;

export interface SearchState {
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  activeTab: SearchResultType;
}

export interface SearchFilters {
  types?: SearchResultType[];
  limit?: number;
}

export interface ExternalSearchResult {
  id: string;
  pubkey?: string;
  content?: string;
  created_at?: number;
  kind?: number;
  tags?: string[][];
  [key: string]: any;
}

export interface NostrBandSearchResponse {
  profiles?: ExternalSearchResult[];
  notes?: ExternalSearchResult[];
  hashtags?: {tag: string, count: number}[];
}
