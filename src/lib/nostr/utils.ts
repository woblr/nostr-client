import { ProfileMetadata } from '@/hooks/useProfile';

export function getDisplayName(pubkey: string, meta?: ProfileMetadata | null) {
  if (!meta) return pubkey.slice(0, 8) + '…';
  return (
    meta.display_name ||
    meta.name ||
    meta.nip05 ||
    pubkey.slice(0, 8) + '…'
  );
}
