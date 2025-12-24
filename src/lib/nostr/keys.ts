import { generateSecretKey, getPublicKey, utils } from 'nostr-tools';

const { bytesToHex } = utils;

export function createNewKeyPair() {
  const skBytes = generateSecretKey();
  const pk = getPublicKey(skBytes);
  const sk = bytesToHex(skBytes);
  return { sk, pk };
}
