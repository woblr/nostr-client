"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface RichTextContentProps {
  content: string;
  className?: string;
}

export default function RichTextContent({ content, className = '' }: RichTextContentProps) {
  const router = useRouter();

  // Process content to render different parts
  const renderContent = () => {
    // Handle URLs (http/https)
    let processedContent = content.replace(
      /(https?:\/\/\S+)/gi,
      (url) => {
        // Don't process image URLs - they're handled by the parent component
        if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          return url;
        }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">${url}</a>`;
      }
    );

    // Handle nostr: protocol references
    processedContent = processedContent.replace(
      /nostr:npub[a-z0-9]{59}/gi,
      (npub) => {
        const pubkey = npub.replace('nostr:', '');
        // Use data attributes that will be handled by click handler
        return `<span data-profile-link="${pubkey}" class="text-indigo-600 hover:underline cursor-pointer">@${pubkey.slice(0, 8)}…</span>`;
      }
    );

    // Handle hashtags
    processedContent = processedContent.replace(
      /#(\w+)/gi, 
      '<span data-hashtag="$1" class="text-indigo-600 hover:underline cursor-pointer">#$1</span>'
    );

    // Handle newlines
    processedContent = processedContent.replace(/\n/g, '<br/>');

    return processedContent;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    
    // Handle profile links
    if (target.hasAttribute('data-profile-link')) {
      e.preventDefault();
      const pubkey = target.getAttribute('data-profile-link');
      if (pubkey) {
        router.push(`/profile/${pubkey}`);
      }
    }
    
    // Handle hashtag links
    if (target.hasAttribute('data-hashtag')) {
      e.preventDefault();
      const tag = target.getAttribute('data-hashtag');
      if (tag) {
        router.push(`/hashtag/${tag}`);
      }
    }
  };

  return (
    <div 
      className={`whitespace-pre-wrap break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: renderContent() }}
      onClick={handleClick} 
    />
  );
}
