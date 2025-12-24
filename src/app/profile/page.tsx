"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActivePublicKey } from '@/store/useUserStore';

/**
 * Profile redirect page
 * This page detects the logged-in user's pubkey and redirects to their
 * public profile route (`/profile/[pubkey]`). If no account is active,
 * it sends the user to the key-management page so they can add / unlock
 * an account.
 */
export default function MyProfilePage() {
  const router = useRouter();
  const pubkey = useActivePublicKey();

  useEffect(() => {
    if (pubkey) {
      router.replace(`/profile/${pubkey}`);
    } else {
      router.replace('/keys');
    }
  }, [pubkey, router]);

  return (
    <div className="flex items-center justify-center h-[60vh] text-gray-500 dark:text-gray-400">
      Loading your profile...
    </div>
  );
}
