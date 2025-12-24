"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nip19, Event } from 'nostr-tools';
import { useActiveAccount, useUserStore } from '@/store/useUserStore';
import { KeyManager } from '@/lib/nostr/KeyManager';
import { CheckCircleIcon, ExclamationCircleIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';

// Assuming these are implemented elsewhere in the project
import { publishEvent } from '@/lib/nostr/events';
import Avatar from '@/components/Avatar';

interface ProfileFormData {
  name: string;
  displayName: string;
  picture: string;
  banner: string;
  about: string;
  nip05: string;
  lud16: string;
  website: string;
}

export default function ProfileSettings() {
  const router = useRouter();
  const activeAccount = useActiveAccount();
  const updateAccountMetadata = useUserStore(state => state.updateAccountMetadata);
  
  const [formData, setFormData] = useState<ProfileFormData>({
    name: '',
    displayName: '',
    picture: '',
    banner: '',
    about: '',
    nip05: '',
    lud16: '',
    website: '',
  });

  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // Check if we have keys set up properly and redirect if needed
  useEffect(() => {
    // If no active account, redirect to login
    if (!activeAccount) {
      router.push('/profile');
      return;
    }

    // If we have an active account but no private key and system is locked, redirect to keys page
    const hasKey = KeyManager.hasPrivateKey(activeAccount.pubkey);
    const isLocked = KeyManager.isLocked();
    console.log('Profile settings - Key check:', { hasKey, isLocked });
    
    if (hasKey && isLocked) {
      // We have a private key but it's locked - show guidance
      const shouldRedirect = window.confirm(
        'Your keys are locked. You need to unlock them on the keys page before saving profile changes. Go to keys page now?'
      );
      if (shouldRedirect) {
        router.push('/keys');
        return;
      }
    }

    // Initialize form with account data
    setFormData({
      name: activeAccount.name || '',
      displayName: activeAccount.displayName || '',
      picture: activeAccount.profilePicture || '',
      banner: '',  // These fields might not be in the account state
      about: activeAccount.about || '',
      nip05: activeAccount.nip05 || '',
      lud16: activeAccount.lud16 || '',
      website: '',
    });
  }, [activeAccount, router]);

  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!activeAccount) {
      setSaveStatus('error');
      setErrorMessage('No active account selected');
      return;
    }

    setLoading(true);
    setSaveStatus('idle');
    setErrorMessage('');
    
    try {
      console.log('Starting profile update for pubkey:', activeAccount.pubkey);
      
      // Verify we have everything needed to sign
      const hasLocalPrivateKey = KeyManager.hasPrivateKey(activeAccount.pubkey);
      const isSystemLocked = KeyManager.isLocked();
      const hasNip07 = typeof window !== 'undefined' && !!(window as any).nostr;
      
      console.log('Signing check:', { hasLocalPrivateKey, isSystemLocked, hasNip07 });
      
      // Handle the key unlocking if needed
      if (hasLocalPrivateKey) {
        console.log('Using local private key for signing');
        
        if (isSystemLocked) {
          console.log('System is locked, need to unlock first');
          
          // Try up to 3 times to get the correct passphrase
          let unlockSuccess = false;
          let attemptCount = 0;
          
          while (!unlockSuccess && attemptCount < 3) {
            attemptCount++;
            const passphrase = window.prompt(`Enter your passphrase to unlock your private key (attempt ${attemptCount}/3):`);
            
            if (!passphrase) {
              console.log('User cancelled passphrase entry');
              throw new Error('Passphrase required to sign profile update');
            }
            
            unlockSuccess = await KeyManager.unlockPassphrase(passphrase);
            
            if (unlockSuccess) {
              console.log('Successfully unlocked private key');
            } else if (attemptCount < 3) {
              console.log('Invalid passphrase, trying again');
              alert('Invalid passphrase, please try again.');
            }
          }
          
          if (!unlockSuccess) {
            throw new Error('Failed to unlock private key after 3 attempts');
          }
        } else {
          console.log('System already unlocked, ready to sign');
        }
      } else if (hasNip07) {
        console.log('No local private key, will use NIP-07 extension');
      } else {
        // No local key or extension available for this pubkey
        console.log('No signing method available for the current pubkey. Redirecting to keys page.');
        
        // Redirect to keys page with notification
        const confirmRedirect = window.confirm(
          'You need to unlock or import your private key to sign profile updates. Would you like to go to the keys page now?'
        );
        
        if (confirmRedirect) {
          // Redirect to keys page
          window.location.href = '/keys';
          throw new Error('Redirecting to keys page');
        } else {
          throw new Error('No signing method available. Please unlock or import your private key on the keys page, or install a NIP-07 browser extension.');
        }
      }

    // Create metadata content object
      const metadataContent = {
        name: formData.name,
        display_name: formData.displayName,
        picture: formData.picture,
        banner: formData.banner,
        about: formData.about,
        nip05: formData.nip05,
        lud16: formData.lud16,
        website: formData.website,
      };
      
      // Remove empty fields
      Object.keys(metadataContent).forEach((key) => {
        if (!metadataContent[key as keyof typeof metadataContent]) {
          delete metadataContent[key as keyof typeof metadataContent];
        }
      });
      
      // Create event object (use unknown cast to satisfy TypeScript)
      // We don't include id and sig as these will be added by the signing process
      const event = {
        kind: 0,
        pubkey: activeAccount.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(metadataContent),
      } as unknown as Event;

      // Publish to relays
      const signedEvent = await KeyManager.signEvent(event, activeAccount.pubkey);
      await publishEvent(signedEvent);

      // Update local state
      updateAccountMetadata(activeAccount.id, {
        name: formData.name,
        displayName: formData.displayName,
        profilePicture: formData.picture,
        nip05: formData.nip05,
        about: formData.about,
        lud16: formData.lud16,
      });

      setSaveStatus('success');
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
      
      // Reset status after a few seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const copyPublicKey = () => {
    if (!activeAccount) return;
    
    try {
      const npub = nip19.npubEncode(activeAccount.pubkey);
      navigator.clipboard.writeText(npub);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying pubkey:', error);
    }
  };

  if (!activeAccount) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-xl font-bold mb-4">No Account Selected</h1>
        <p className="mb-4">You need to select or create an account before editing your profile.</p>
        <button 
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
        >
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Edit Profile</h1>
      
      {/* Profile Preview */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Profile Preview</h2>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 glass card-hover">
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar 
                pubkey={activeAccount.pubkey} 
                picture={formData.picture}
                size={80}
                className="w-20 h-20 rounded-full"
              />
              {formData.nip05 && (
                <div className="absolute -bottom-1 -right-1 bg-green-500 p-1 rounded-full">
                  <CheckCircleIcon className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">
                    {formData.displayName || formData.name || 'Anonymous'}
                  </h3>
                  {formData.name && formData.name !== formData.displayName && (
                    <p className="text-gray-500 text-sm">@{formData.name}</p>
                  )}
                </div>
                
                <button
                  onClick={copyPublicKey}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy npub'}
                </button>
              </div>
              
              {formData.nip05 && (
                <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1 mt-1">
                  <CheckCircleIcon className="w-4 h-4" />
                  {formData.nip05}
                </p>
              )}
              
              {formData.about && (
                <p className="text-sm mt-2 text-gray-700 dark:text-gray-300">
                  {formData.about}
                </p>
              )}
              
              {formData.website && (
                <a 
                  href={formData.website.startsWith('http') ? formData.website : `https://${formData.website}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:underline mt-1 block"
                >
                  {formData.website}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Edit Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Basic Information */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="username"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 bg-white dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name
            </label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              value={formData.displayName}
              onChange={handleInputChange}
              placeholder="Your Name"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 bg-white dark:bg-gray-800"
            />
          </div>
          
          {/* URLs */}
          <div>
            <label htmlFor="picture" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Profile Picture URL
            </label>
            <input
              type="url"
              id="picture"
              name="picture"
              value={formData.picture}
              onChange={handleInputChange}
              placeholder="https://example.com/avatar.jpg"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 bg-white dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label htmlFor="banner" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Banner Image URL
            </label>
            <input
              type="url"
              id="banner"
              name="banner"
              value={formData.banner}
              onChange={handleInputChange}
              placeholder="https://example.com/banner.jpg"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 bg-white dark:bg-gray-800"
            />
          </div>
          
          {/* Verification */}
          <div>
            <label htmlFor="nip05" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              NIP-05 Identifier
            </label>
            <input
              type="text"
              id="nip05"
              name="nip05"
              value={formData.nip05}
              onChange={handleInputChange}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 bg-white dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label htmlFor="lud16" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Lightning Address (LUD-16)
            </label>
            <input
              type="text"
              id="lud16"
              name="lud16"
              value={formData.lud16}
              onChange={handleInputChange}
              placeholder="you@lightning.wallet"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 bg-white dark:bg-gray-800"
            />
          </div>
          
          <div>
            <label htmlFor="website" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Website
            </label>
            <input
              type="text"
              id="website"
              name="website"
              value={formData.website}
              onChange={handleInputChange}
              placeholder="https://yourwebsite.com"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 bg-white dark:bg-gray-800"
            />
          </div>
        </div>
        
        {/* Bio */}
        <div>
          <label htmlFor="about" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            About
          </label>
          <textarea
            id="about"
            name="about"
            value={formData.about}
            onChange={handleInputChange}
            rows={3}
            placeholder="Write something about yourself..."
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 bg-white dark:bg-gray-800"
          />
        </div>
        
        {/* Status message */}
        {saveStatus === 'success' && (
          <div className="flex items-center text-green-600 text-sm">
            <CheckCircleIcon className="w-5 h-5 mr-1" />
            Profile updated successfully!
          </div>
        )}
        
        {saveStatus === 'error' && (
          <div className="flex items-center text-red-600 text-sm">
            <ExclamationCircleIcon className="w-5 h-5 mr-1" />
            {errorMessage || 'Failed to update profile'}
          </div>
        )}
        
        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg flex items-center gap-2"
          >
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
