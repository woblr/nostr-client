"use client";
import React, { useState } from 'react';
import { ShareIcon } from '@heroicons/react/24/outline';

interface ShareButtonProps {
  url?: string;
  title?: string;
  className?: string;
}

export default function ShareButton({ url, title = 'Check out this profile', className = '' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  
  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  
  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };
  
  return (
    <button 
      onClick={handleShare}
      className={`relative flex items-center gap-2 ${className}`}
    >
      <ShareIcon className="h-5 w-5" />
      <span>{copied ? 'Copied!' : 'Share'}</span>
      
      {copied && (
        <span className="absolute -top-8 left-0 bg-black text-white text-xs py-1 px-2 rounded opacity-80">
          Copied to clipboard!
        </span>
      )}
    </button>
  );
}
