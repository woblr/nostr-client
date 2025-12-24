"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import { ArrowRightOnRectangleIcon, KeyIcon, InboxArrowDownIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { KeyManager } from '@/lib/nostr/KeyManager';

export default function LoginPage() {
  const router = useRouter();
  const {
    passphraseSet,
    isLocked,
    unlockAccounts,
    loginWithExtension,
    accounts,
    setActiveAccount,
    addAccount,
  } = useUserStore();

  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [showImportSection, setShowImportSection] = useState(false);

  useEffect(() => {
    if (!isLocked && accounts.length > 0) {
      router.replace('/profile');
    }
  }, [isLocked, accounts.length, router]);

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = await unlockAccounts(pass);
    if (ok) {
      router.replace('/profile');
    } else {
      setError('Incorrect passphrase');
    }
  };

  const handleExtensionLogin = async () => {
    const acc = await loginWithExtension();
    if (acc) router.replace('/profile');
  };
  
  const handleImportKey = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
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
    
    // Check if we have the sk (private key)
    if (!sk) {
      setError('Please provide a private key (nsec or hex format)');
      return;
    }
    
    // Check if this pubkey exists in accounts
    const existingAccount = accounts.find(acc => acc.pubkey === pk);
    if (existingAccount) {
      // This is updating an existing account with a private key
      try {
        await KeyManager.saveKey(pk, sk);
        // Update account to show it now has a local key
        useUserStore.getState().updateAccountMetadata(existingAccount.id, {
          keyType: 'local',
          encryptionStatus: 'encrypted'
        });
        setActiveAccount(existingAccount.id);
        router.replace('/profile');
      } catch (err) {
        console.error(err);
        setError('Failed to update existing account with private key');
      }
      return;
    }
    
    try {
      await KeyManager.saveKey(pk, sk);
      const id = addAccount({
        pubkey: pk,
        keyType: 'local',
        encryptionStatus: 'encrypted',
        displayName: 'Imported Account',
      });
      setActiveAccount(id);
      router.replace('/profile');
    } catch (err) {
      console.error(err);
      setError('Failed to import key');
    }
  };

  if (!passphraseSet) {
    return (
      <div className="max-w-md mx-auto p-6 mt-16 bg-white dark:bg-gray-800 rounded-lg shadow space-y-6 text-center">
        <h1 className="text-2xl font-bold">Welcome to Nostr</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You need to set up a passphrase to secure your keys before continuing.
        </p>
        <button onClick={() => router.push('/register')} className="btn-action w-full flex items-center justify-center gap-2">
          <KeyIcon className="w-5 h-5" /> Create Account
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 mt-16 bg-white dark:bg-gray-800 rounded-lg shadow space-y-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold mb-2">Sign In</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          New to Nostr? <Link href="/register" className="text-blue-500 hover:underline">Create an account</Link>
        </p>
      </div>

      {/* Unlock Keys Section */}
      {isLocked && (
        <div className="bg-white dark:bg-gray-700 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-600 mb-4">
          <h2 className="text-lg font-semibold mb-3">Unlock Your Keys</h2>
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label htmlFor="passphrase" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Enter your passphrase
              </label>
              <input
                id="passphrase"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700"
                placeholder="Your passphrase"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" className="w-full btn-action flex items-center justify-center gap-2">
              <KeyIcon className="w-5 h-5" /> Unlock
            </button>
          </form>
        </div>
      )}

      {/* Select Account Section */}
      {!isLocked && accounts.length > 0 && (
        <div className="bg-white dark:bg-gray-700 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-600 mb-4">
          <h2 className="text-lg font-semibold mb-3">Select an Account</h2>
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="truncate text-sm">{a.displayName || a.pubkey.slice(0, 8)}...</span>
                  <span className="text-xs text-gray-500">{a.keyType === 'local' ? '(Local Key)' : '(Extension)'}</span>
                </div>
                <button
                  onClick={() => {
                    setActiveAccount(a.id);
                    router.replace('/profile');
                  }}
                  className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg"
                >
                  Sign In
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Import Section (Toggleable) */}
      <div className="mt-4">
        {!showImportSection ? (
          <button 
            onClick={() => setShowImportSection(true)}
            className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center gap-2"
          >
            <InboxArrowDownIcon className="w-5 h-5" /> Import Private Key
          </button>
        ) : (
          <div className="bg-white dark:bg-gray-700 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">Import Private Key</h2>
              <button 
                onClick={() => setShowImportSection(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleImportKey} className="space-y-4">
              <textarea
                rows={3}
                placeholder="Paste your nsec private key here"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700"
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" className="w-full btn-action flex items-center justify-center gap-2">
                <InboxArrowDownIcon className="w-5 h-5" /> Import & Continue
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Extension Login */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={handleExtensionLogin} className="w-full btn-action flex items-center justify-center gap-2">
          <ArrowRightOnRectangleIcon className="w-5 h-5" /> Connect with Browser Extension
        </button>
      </div>
    </div>
  );
}
