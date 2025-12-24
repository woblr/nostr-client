import CryptoJS from 'crypto-js';

const STORAGE_KEY = 'nostr_account';

export interface StoredAccount {
  pk: string; // public key hex
  encSk: string; // encrypted secret key
}

export function saveAccount(sk: string, pk: string, passphrase: string) {
  const encSk = CryptoJS.AES.encrypt(sk, passphrase).toString();
  const payload: StoredAccount = { pk, encSk };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadAccount(passphrase: string): { sk: string; pk: string } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const { pk, encSk } = JSON.parse(raw) as StoredAccount;
    const bytes = CryptoJS.AES.decrypt(encSk, passphrase);
    const sk = bytes.toString(CryptoJS.enc.Utf8);
    if (!sk) return null;
    return { sk, pk };
  } catch {
    return null;
  }
}
