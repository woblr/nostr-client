"use client";

import { useState, FormEvent, ChangeEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { nip19 } from 'nostr-tools';
import { KeyManager } from '@/lib/nostr/KeyManager';
import { useUserStore, UserAccount } from '@/store/useUserStore';
import { EyeIcon, EyeSlashIcon, ArrowDownTrayIcon, TrashIcon, KeyIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import Avatar from '@/components/Avatar'; // Assuming Avatar component exists

function KeysPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const {
    accounts,
    activeAccountId,
    setActiveAccount,
    addAccount,
    removeAccount,
    loginWithExtension,
    isLocked,
    passphraseSet,
    setPassphrase,
    unlockAccounts,
    lockAccounts,
  } = useUserStore();

  const [importKeyInput, setImportKeyInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState<Record<string, boolean>>({});
  const [passphraseInput, setPassphraseInput] = useState('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');

  const handleGenerateKey = async () => {
    setGenerateError(null);
    if (isLocked && passphraseSet) {
      setGenerateError('Please unlock your keys first.');
      return;
    }
    if (!passphraseSet) {
      setGenerateError('Please set a passphrase before generating keys.');
      return;
    }
    try {
      const { sk, pk } = KeyManager.createNewKeyPair();
      await KeyManager.saveKey(pk, sk);
      const newAccountData: Omit<UserAccount, 'id'> = {
        pubkey: pk,
        displayName: `Account ${accounts.length + 1}`,
        keyType: 'local',
        encryptionStatus: 'encrypted',
      };
      addAccount(newAccountData);
    } catch (error) {
      console.error('Error generating key:', error);
      setGenerateError(error instanceof Error ? error.message : 'Failed to generate key.');
    }
  };

  const handleImportKey = async (e: FormEvent) => {
    e.preventDefault();
    setImportError(null);
    if (isLocked && passphraseSet) {
      setImportError('Please unlock your keys first.');
      return;
    }
    if (!passphraseSet) {
      setImportError('Please set a passphrase before importing keys.');
      return;
    }
    try {
      const imported = KeyManager.importKey(importKeyInput.trim());
      if (!imported) {
        throw new Error('Invalid key format or unable to import.');
      }

      const { sk, pk } = imported;
      
      if (!sk) {
        throw new Error('Could not extract private key from input. Please provide a nsec or hex private key');
      }

      // Check if this public key already exists in accounts
      const existingAccount = accounts.find(acc => acc.pubkey === pk);
      
      if (existingAccount) {
        // We're adding a private key to an existing account
        console.log('Adding private key to existing account:', existingAccount.id);
        await KeyManager.saveKey(pk, sk);
        
        // Update the account to show it now has a local key
        const updatedAccountData: Partial<UserAccount> = {
          keyType: 'local',
          encryptionStatus: 'encrypted'
        };
        
        useUserStore.getState().updateAccountMetadata(existingAccount.id, updatedAccountData);
        setImportKeyInput('');
        alert('Private key imported successfully for your existing account!');
        return;
      }

      // Save the key for a new account
      await KeyManager.saveKey(pk, sk);

      const newAccountData: Omit<UserAccount, 'id'> = {
        pubkey: pk,
        displayName: `Imported Account ${accounts.length + 1}`,
        keyType: 'local',
        encryptionStatus: 'encrypted',
      };
      addAccount(newAccountData);
      setImportKeyInput('');
      alert('New account created with imported private key!');
    } catch (error) {
      console.error('Error importing key:', error);
      setImportError(error instanceof Error ? error.message : 'Failed to import key.');
    }
  };

  const handleLoginWithExtension = async () => {
    await loginWithExtension();
  };

  const toggleShowPrivateKey = (pubkey: string) => {
    if (isLocked) return;
    setShowPrivateKey(prev => ({ ...prev, [pubkey]: !prev[pubkey] }));
  };

  const handleExportKey = (pubkey: string, format: 'nsec' | 'npub') => {
    if (isLocked && format === 'nsec') {
      alert('Please unlock your keys to export the private key.');
      return;
    }
    const keyToExport = KeyManager.exportKey(pubkey, format);
    if (keyToExport) {
      navigator.clipboard.writeText(keyToExport);
      alert(`${format.toUpperCase()} copied to clipboard!`);
    } else {
      alert(`Failed to export ${format}.`);
    }
  };

  const handleSetPassphrase = async (e: FormEvent) => {
    e.preventDefault();
    setPassphraseError(null);
    if (newPassphrase !== confirmPassphrase) {
      setPassphraseError('Passphrases do not match.');
      return;
    }
    if (newPassphrase.length < 8) {
      setPassphraseError('Passphrase must be at least 8 characters long.');
      return;
    }
    try {
      await setPassphrase(newPassphrase);
      setNewPassphrase('');
      setConfirmPassphrase('');
    } catch (error) {
      setPassphraseError('Failed to set passphrase.');
    }
  };

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setPassphraseError(null);
    try {
      await unlockAccounts(passphraseInput);
      setPassphraseInput('');
      
      // If we have a returnUrl, redirect back after successful unlock
      if (returnUrl) {
        router.push(returnUrl);
      }
    } catch (error) {
      console.error('Error unlocking with passphrase:', error);
      setPassphraseError(error instanceof Error ? error.message : 'Failed to unlock with this passphrase');
    }
  };

  if (!passphraseSet) {
    return (
      <div className="max-w-md mx-auto p-4 mt-10 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-4 text-center">Set a Passphrase</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          To use local keys, you need to set a passphrase. This will be used to encrypt your private keys in your browser&apos;s local storage.
        </p>
        <form onSubmit={handleSetPassphrase} className="space-y-4">
          <div>
            <label htmlFor="newPassphrase" className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Passphrase</label>
            <input
              type="password"
              id="newPassphrase"
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700"
              required
            />
          </div>
          <div>
            <label htmlFor="confirmPassphrase" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Passphrase</label>
            <input
              type="password"
              id="confirmPassphrase"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700"
              required
            />
          </div>
          {passphraseError && <p className="text-red-500 text-sm">{passphraseError}</p>}
          <button type="submit" className="w-full btn-action">
            Set Passphrase
          </button>
        </form>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="max-w-md mx-auto p-4 mt-10 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-4 text-center">Unlock Keys</h1>
        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label htmlFor="passphrase" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Passphrase</label>
            <input
              type="password"
              id="passphrase"
              value={passphraseInput}
              onChange={(e) => setPassphraseInput(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700"
              required
            />
          </div>
          {passphraseError && <p className="text-red-500 text-sm">{passphraseError}</p>}
          <button type="submit" className="w-full btn-action">
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Key Management</h1>

      {/* Account List */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Your Accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-gray-500">No accounts found. Generate or import one.</p>
        ) : (
          <ul className="space-y-3">
            {accounts.map(account => (
              <li key={account.id} 
                  className={`p-4 rounded-lg shadow ${activeAccountId === account.id ? 'bg-blue-50 dark:bg-blue-900/50 border-2 border-blue-500' : 'bg-white dark:bg-gray-800'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar pubkey={account.pubkey} picture={account.profilePicture} size={40} className="w-10 h-10 rounded-full" />
                    <div>
                      <p className="font-medium">{account.displayName || `Account ${account.id.substring(0,6)}`}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate w-48" title={nip19.npubEncode(account.pubkey)}>
                        {nip19.npubEncode(account.pubkey)}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Type: {account.keyType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeAccountId !== account.id && (
                      <button onClick={() => setActiveAccount(account.id)} className="p-1 text-gray-500 hover:text-blue-600" title="Set Active">
                        <KeyIcon className="w-5 h-5" />
                      </button>
                    )}
                    <button onClick={() => handleExportKey(account.pubkey, 'npub')} className="p-1 text-gray-500 hover:text-blue-600" title="Export Npub">
                      <ArrowDownTrayIcon className="w-5 h-5" /> NPUB
                    </button>
                     {account.keyType === 'local' && account.encryptionStatus === 'encrypted' && (
                      <button onClick={() => handleExportKey(account.pubkey, 'nsec')} className="p-1 text-gray-500 hover:text-blue-600" title="Export Nsec">
                        <ArrowDownTrayIcon className="w-5 h-5" /> NSEC
                      </button>
                    )}
                    <button onClick={() => removeAccount(account.id)} className="p-1 text-red-500 hover:text-red-700" title="Delete Account">
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {account.keyType === 'local' && account.encryptionStatus === 'encrypted' && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <button 
                      onClick={() => toggleShowPrivateKey(account.pubkey)} 
                      className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                    >
                      {showPrivateKey[account.pubkey] ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      {showPrivateKey[account.pubkey] ? 'Hide' : 'Show'} Private Key (nsec)
                    </button>
                    {showPrivateKey[account.pubkey] && (
                      <p className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 p-2 rounded mt-1 break-all">
                        {KeyManager.exportKey(account.pubkey, 'nsec')}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Generate New Key */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Generate New Key</h2>
        <button 
          onClick={handleGenerateKey} 
          className="btn-action w-full flex items-center justify-center gap-2"
          disabled={isLocked || !passphraseSet}
        >
          <PlusCircleIcon className="w-5 h-5" /> Generate New Key Pair
        </button>
        {generateError && <p className="text-red-500 text-sm mt-1">{generateError}</p>}
        {(!passphraseSet || isLocked) && <p className="text-xs text-yellow-600 mt-1">Please set and unlock your passphrase to generate keys.</p>}
      </div>

      {/* Import Key */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Import Existing Key</h2>
        <form onSubmit={handleImportKey} className="space-y-2">
          <input 
            type="text" 
            value={importKeyInput} 
            onChange={(e: ChangeEvent<HTMLInputElement>) => setImportKeyInput(e.target.value)} 
            placeholder="Enter nsec, npub, or hex private key"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 bg-white dark:bg-gray-800"
            disabled={isLocked || !passphraseSet}
          />
          <button 
            type="submit" 
            className="btn-action w-full"
            disabled={isLocked || !passphraseSet}
          >
            Import Key
          </button>
          {importError && <p className="text-red-500 text-sm mt-1">{importError}</p>}
          {(!passphraseSet || isLocked) && <p className="text-xs text-yellow-600 mt-1">Please set and unlock your passphrase to import keys.</p>}
        </form>
      </div>

      {/* Login with Extension */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Use Browser Extension (NIP-07)</h2>
        <button 
          onClick={handleLoginWithExtension} 
          className="btn-action w-full"
        >
          Connect with Nostr Extension
        </button>
      </div>

      {/* Lock Keys */}
      {passphraseSet && !isLocked && (
         <div className="mt-8 pt-4 border-t dark:border-gray-700">
          <button 
            onClick={lockAccounts} 
            className="text-sm text-red-500 hover:text-red-700 w-full text-left"
          >
            Lock Keys
          </button>
        </div>
      )}
    </div>
  );
}

export default function KeysPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading key management...</div>}>
      <KeysPageContent />
    </Suspense>
  );
}
