"use client";
import { useState, useEffect } from 'react';
import { useActivePublicKey } from '@/store/useUserStore';
import useNotificationFeed from '@/hooks/useNotificationFeed';
import NotificationItem from '@/components/NotificationItem';
import Link from 'next/link';
import {
  BellIcon,
  BellAlertIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { BellAlertIcon as BellAlertSolid } from '@heroicons/react/24/solid';

export default function NotificationsPage() {
  // Ensure the component only renders for logged in users
  return (
    <div className="min-h-screen" key="notifications-page">
      <ClientNotificationsPage />
    </div>
  );
}

function ClientNotificationsPage() {
  const pubkey = useActivePublicKey();
  const { notifications, loading, eventCache } = useNotificationFeed(50);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  
  // Calculate number of unread items
  useEffect(() => {
    setUnreadCount(notifications.filter(n => n.unread).length);
  }, [notifications]);
  
  // Handle user not logged in
  if (!pubkey) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="bg-amber-100 dark:bg-amber-900/20 p-4 rounded-full">
            <ShieldCheckIcon className="h-12 w-12 text-amber-600 dark:text-amber-500" />
          </div>
          <h2 className="text-xl font-medium">Authentication Required</h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-md">
            You need to log in to view your notifications.
            Notifications in Nostr are private and specific to your account.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <Link
              href="/login"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              Log In
            </Link>
            <Link
              href="/register"
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Filter notifications by type if filter is set
  const filteredNotifications = filter
    ? notifications.filter(n => n.type === filter)
    : notifications;
  
  return (
    <main className="max-w-3xl mx-auto p-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BellAlertIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </h1>
      </div>
      
      {/* Filter tabs */}
      <div className="flex overflow-x-auto space-x-2 pb-2 mb-4 scrollbar-hide">
        <button
          onClick={() => setFilter(null)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${!filter 
            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300' 
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('mention')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${filter === 'mention' 
            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' 
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          Mentions
        </button>
        <button
          onClick={() => setFilter('reply')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${filter === 'reply' 
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' 
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          Replies
        </button>
        <button
          onClick={() => setFilter('reaction')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${filter === 'reaction' 
            ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-300' 
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          Reactions
        </button>
        <button
          onClick={() => setFilter('zap')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${filter === 'zap' 
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' 
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          Zaps
        </button>
        <button
          onClick={() => setFilter('dm')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${filter === 'dm' 
            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          Messages
        </button>
      </div>
      
      {/* Notifications list with loading state */}
      <div className="space-y-3">
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ArrowPathIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400 animate-spin mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading notifications...</p>
          </div>
        )}
        
        {!loading && filteredNotifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full mb-4">
              <BellIcon className="h-12 w-12 text-gray-500" />
            </div>
            <h3 className="text-lg font-medium">No notifications yet</h3>
            <p className="text-gray-500 mt-1 max-w-md">
              {filter ? `You don't have any ${filter} notifications.` : 'When someone interacts with you, notifications will appear here.'}
            </p>
          </div>
        )}
        
        {filteredNotifications.map((notification) => (
          <NotificationItem 
            key={`${notification.type}-${notification.targetEventId || 'direct'}-${notification.createdAt}`}
            group={notification}
            eventCache={eventCache}
          />
        ))}
      </div>
    </main>
  );
}
