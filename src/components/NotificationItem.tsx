"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { NotificationGroup } from '@/hooks/useNotificationFeed';
import { NostrEvent } from '@/types/nostr';
import Avatar from '@/components/Avatar';
import useProfile from '@/hooks/useProfile';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  ChatBubbleLeftIcon,
  AtSymbolIcon,
  HeartIcon,
  BoltIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/solid';

dayjs.extend(relativeTime);

interface NotificationItemProps {
  group: NotificationGroup;
  eventCache: Record<string, NostrEvent>;
}

export default function NotificationItem({ group, eventCache }: NotificationItemProps) {
  // Get the most recent event for this group
  const latestEvent = group.events[0];
  
  // Get information about main author
  const mainAuthorPubkey = group.authorPubkeys[0];
  const authorProfile = useProfile(mainAuthorPubkey);
  
  // Target event (for reactions, replies)
  const targetEvent = group.targetEventId ? eventCache[group.targetEventId] : null;
  
  // Different icons based on notification type
  const renderIcon = () => {
    switch (group.type) {
      case 'reply':
        return <ChatBubbleLeftIcon className="h-5 w-5 text-blue-500" />;
      case 'mention':
        return <AtSymbolIcon className="h-5 w-5 text-purple-500" />;
      case 'reaction':
        return <HeartIcon className="h-5 w-5 text-pink-500" />;
      case 'zap':
        return <BoltIcon className="h-5 w-5 text-amber-500" />;
      case 'dm':
        return <EnvelopeIcon className="h-5 w-5 text-green-500" />;
    }
  };
  
  // Render multiple avatars
  const renderAvatars = () => {
    return (
      <div className="flex -space-x-2 overflow-hidden">
        {group.authorPubkeys.slice(0, 3).map((pubkey, i) => {
          const profile = i === 0 ? authorProfile : useProfile(pubkey);
          return (
            <Link 
              key={pubkey} 
              href={`/profile/${pubkey}`} 
              className="relative z-10 hover:z-20 transition-all"
              style={{ zIndex: 10 - i }}
            >
              <Avatar 
                pubkey={pubkey} 
                picture={profile?.picture}
                name={profile?.display_name || profile?.name}
                size={40} 
                className={`${i > 0 ? 'ring-2 ring-white dark:ring-gray-900' : ''}`} 
              />
            </Link>
          );
        })}
        {group.authorPubkeys.length > 3 && (
          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium ring-2 ring-white dark:ring-gray-900">
            +{group.authorPubkeys.length - 3}
          </div>
        )}
      </div>
    );
  };

  // Format notification text
  const renderNotificationText = () => {
    const authorName = authorProfile?.display_name || authorProfile?.name || mainAuthorPubkey.slice(0, 8);
    const otherCount = group.authorPubkeys.length - 1;
    const otherText = otherCount > 0 ? ` and ${otherCount} other${otherCount > 1 ? 's' : ''}` : '';
    
    switch (group.type) {
      case 'reply':
        return (
          <>
            <span className="font-medium">{authorName}</span>{otherText} replied to your post
          </>
        );
      case 'mention':
        return (
          <>
            <span className="font-medium">{authorName}</span>{otherText} mentioned you in a post
          </>
        );
      case 'reaction':
        return (
          <>
            <span className="font-medium">{authorName}</span>{otherText} reacted to your post
            {group.reactionContent && (
              <span className="text-xl ml-1">{group.reactionContent}</span>
            )}
          </>
        );
      case 'zap':
        return (
          <>
            <span className="font-medium">{authorName}</span>{otherText} zapped you
            {group.zapAmount && (
              <span className="font-bold ml-1">{(group.zapAmount / 1000).toLocaleString()} sats</span>
            )}
          </>
        );
      case 'dm':
        const decryptedEvent = group.events[0] as any;
        return (
          <>
            <span className="font-medium">{authorName}</span>{otherText} sent you a message
            {decryptedEvent.decrypted && (
              <span className="block text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                {decryptedEvent.decrypted.slice(0, 60)}
                {decryptedEvent.decrypted.length > 60 ? '...' : ''}
              </span>
            )}
          </>
        );
    }
  };

  // Get notification link
  const getNotificationLink = () => {
    switch (group.type) {
      case 'reply':
      case 'reaction':
        if (group.targetEventId) {
          return `/note/${group.targetEventId}`;
        }
        break;
      case 'mention':
        return `/note/${group.events[0].id}`;
      case 'zap':
        if (group.targetEventId) {
          return `/note/${group.targetEventId}`;
        }
        return `/profile/${group.authorPubkeys[0]}`;
      case 'dm':
        return `/dm/${group.authorPubkeys[0]}`;
    }
    return '#';
  };

  return (
    <Link 
      href={getNotificationLink()}
      className={`flex gap-4 p-4 ${group.unread ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'bg-white/90 dark:bg-gray-800/90'} rounded-xl hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700/30`}
    >
      <div className="flex-shrink-0">
        {renderAvatars()}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-sm">
            {renderIcon()}
            <span>{renderNotificationText()}</span>
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
            {dayjs.unix(group.createdAt).fromNow()}
          </span>
        </div>
        
        {targetEvent && group.type !== 'dm' && (
          <div className="mt-1 p-2 rounded bg-gray-100 dark:bg-gray-700/50 text-sm line-clamp-2">
            {targetEvent.content.length > 120 
              ? `${targetEvent.content.slice(0, 120)}...` 
              : targetEvent.content}
          </div>
        )}
      </div>
    </Link>
  );
}
