"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import { KeyIcon, PlusCircleIcon, InboxArrowDownIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { KeyManager } from '@/lib/nostr/KeyManager';
import { nip19, utils } from 'nostr-tools';

export default function RegisterPage() {
  const router = useRouter();
  const { passphraseSet, setPassphrase, addAccount, setActiveAccount } = useUserStore();

  const [step, setStep] = useState<'passphrase' | 'choose' | 'importKey' | 'generated'>('passphrase');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [generatedKeys, setGeneratedKeys] = useState<{ npub: string; nsec: string } | null>(null);

  const handlePassphrase = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (pass1.length < 8) {
      setError('Passphrase must be at least 8 characters');
      return;
    }
    if (pass1 !== pass2) {
      setError('Passphrases do not match');
      return;
    }
    try {
      await setPassphrase(pass1);
      setStep('choose');
    } catch {
      setError('Failed to set passphrase');
    }
  };

  const handleGenerate = async () => {
    try {
      // Create new key pair
      const { sk, pk } = KeyManager.createNewKeyPair();
      
      // Make sure we have the private key directly
      if (!sk) {
        setError('Failed to generate private key');
        return;
      }
      
      // Ensure encryption passphrase is available in memory
      if (KeyManager.isLocked()) {
        // Ask the user to enter their passphrase again if needed
        const rePass = window.prompt('Enter your passphrase to unlock key storage');
        if (!rePass) {
          setError('Passphrase is required to save the key');
          return;
        }
        const unlocked = await KeyManager.unlockPassphrase(rePass);
        if (!unlocked) {
          setError('Incorrect passphrase');
          return;
        }
      }

      // Save the key to encrypted storage (now unlocked)
      const saved = await KeyManager.saveKey(pk, sk);
      if (!saved) {
        setError('Failed to save key. Please ensure your passphrase is set.');
        return;
      }
      
      // Add to account store
      const id = addAccount({
        pubkey: pk,
        displayName: 'My Account',
        keyType: 'local',
        encryptionStatus: 'encrypted',
      });
      setActiveAccount(id);
      
      // Generate the bech32 encoded keys for display
      // We'll directly encode the keys we have rather than relying on KeyManager.exportKey
      // which requires the system to be unlocked
      const npub = nip19.npubEncode(pk);
      
      // For nsec, we need to convert hex to bytes first
      const skBytes = utils.hexToBytes(sk);
      const nsec = nip19.nsecEncode(skBytes);
      
      setGeneratedKeys({ npub, nsec });
      setStep('generated');
    } catch (err) {
      console.error('Key generation error:', err);
      setError('Failed to generate key: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  if (passphraseSet && step === 'passphrase') {
    // Already have passphrase, go to choice step
    setStep('choose');
  }

  return (
    <div className="max-w-md mx-auto p-6 mt-16 bg-white dark:bg-gray-800 rounded-lg shadow space-y-8">
      <h1 className="text-3xl font-bold text-center mb-2">Create a New Key</h1>
      <p className="text-center text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
        This will generate a brand-new Nostr key pair and store the encrypted private key only in your browser. Make sure to remember your passphrase—if you lose it, your key cannot be recovered.
      </p>

      {step === 'passphrase' && (
        <form onSubmit={handlePassphrase} className="space-y-4">
          <div>
            <label htmlFor="pass1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Passphrase
            </label>
            <input
              id="pass1"
              type="password"
              value={pass1}
              onChange={(e) => setPass1(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700"
              required
            />
          </div>
          <div>
            <label htmlFor="pass2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm Passphrase
            </label>
            <input
              id="pass2"
              type="password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="w-full btn-action flex items-center justify-center gap-2">
            <KeyIcon className="w-5 h-5" /> Set Passphrase
          </button>
        </form>
      )}

      {step === 'choose' && (
        <div className="space-y-4 text-center">
          <p className="text-gray-700 dark:text-gray-300">
            Passphrase set! Choose how to proceed.
          </p>
          <div className="flex flex-col gap-3">
            <button onClick={handleGenerate} className="btn-action w-full flex items-center justify-center gap-2">
              <PlusCircleIcon className="w-5 h-5" /> Generate New Key Pair
            </button>
            <button onClick={() => setStep('importKey')} className="w-full flex items-center justify-center gap-2 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-2 text-sm font-medium">
              <KeyIcon className="w-5 h-5" /> Import Existing Key
            </button>
          </div>
        </div>
      )}

      {step === 'importKey' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            if (!passphraseSet) {
              setError('Passphrase not set');
              return;
            }
            if (!keyInput.trim()) {
              setError('Please paste a key');
              return;
            }
            const res = KeyManager.importKey(keyInput.trim());
            if (!res) {
              setError('Invalid key format');
              return;
            }
            const { sk, pk } = res;
            if (KeyManager.hasKey(pk)) {
              setError('Key already imported');
              return;
            }
            try {
              if (sk) {
                await KeyManager.saveKey(pk, sk);
              }
              const id = addAccount({
                pubkey: pk,
                keyType: sk ? 'local' : 'extension',
                encryptionStatus: sk ? 'encrypted' : 'none',
                displayName: '',
              });
              setActiveAccount(id);
              router.replace('/profile');
            } catch (err) {
              console.error(err);
              setError('Failed to import key');
            }
          }}
          className="space-y-4"
        >
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Paste nsec / npub / hex key</label>
          <textarea
            rows={3}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStep('choose')} className="flex-1 rounded px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
              Cancel
            </button>
            <button type="submit" className="flex-1 btn-action flex items-center justify-center gap-2">
              <InboxArrowDownIcon className="w-5 h-5" /> Import & Continue
            </button>
          </div>
        </form>
      )}

      {step === 'generated' && generatedKeys && (
        <div className="space-y-4 text-center">
          <h2 className="text-xl font-semibold">Key Generated!</h2>
          <p className="text-gray-700 dark:text-gray-300 text-sm">
            Save your keys securely before continuing. <br /> If you lose the private key (nsec), you will lose access to your account.
          </p>
          <div className="space-y-3 text-left">
            <div className="p-3 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-gray-500">Public Key (npub)</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(generatedKeys.npub)}
                  className="text-xs flex items-center gap-1 text-blue-500 hover:underline"
                >
                  <DocumentDuplicateIcon className="w-4 h-4" /> Copy
                </button>
              </div>
              <p className="break-all text-sm">{generatedKeys.npub}</p>
            </div>
            {generatedKeys.nsec && (
              <div className="p-3 rounded border border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/30">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">Private Key (nsec) – KEEP SECRET</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(generatedKeys.nsec)}
                    className="text-xs flex items-center gap-1 text-red-600 hover:underline"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4" /> Copy
                  </button>
                </div>
                <p className="break-all text-sm">{generatedKeys.nsec}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.replace('/profile')}
            className="btn-action w-full flex items-center justify-center gap-2 mt-4"
          >
            Continue to Profile
          </button>
        </div>
      )}
    </div>
  );
}
