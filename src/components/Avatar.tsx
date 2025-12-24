"use client";
import React, { useState, useEffect } from 'react';
import { UserIcon } from '@heroicons/react/24/solid';

// Generate consistent color based on pubkey for better visual identification
function hashColor(pubkey: string) {
  const n = parseInt(pubkey.slice(0, 6), 16);
  const hue = n % 360;
  return `hsl(${hue}, 70%, 60%)`; // Increased brightness for better contrast
}

// Extract initials from a name
function getInitials(name?: string): string {
  if (!name || name.trim() === '') return '';
  
  // Remove any emojis or special characters
  const cleanName = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (!cleanName) return '';
  
  const words = cleanName.split(/\s+/);
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  } else {
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }
}

interface Props {
  pubkey: string;
  size?: number;
  picture?: string;
  className?: string;
  name?: string; // Optional name for generating initials
}

export default function Avatar({ pubkey, size = 40, picture, className = '', name }: Props) {
  const color = hashColor(pubkey);
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const initials = name ? getInitials(name) : pubkey.slice(0, 2);
  
  // Reset error state if picture URL changes
  useEffect(() => {
    setImgError(false);
    setLoaded(false);
  }, [picture]);
  
  // Common class names for consistent styling
  const commonClasses = `rounded-full shrink-0 ${className}`;
  const sizeStyle = { width: size, height: size };
  
  // Handle image
  if (picture && !imgError) {
    return (
      <div className={commonClasses} style={sizeStyle}>
        <img
          src={picture}
          alt={name || `User ${pubkey.slice(0, 8)}`}
          className={`w-full h-full rounded-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          style={sizeStyle}
          onError={() => setImgError(true)}
          onLoad={() => setLoaded(true)}
        />
        {!loaded && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full"
            style={sizeStyle}
          >
            <UserIcon className="w-1/2 h-1/2 text-gray-400 dark:text-gray-500" />
          </div>
        )}
      </div>
    );
  }
  
  // Fallback avatar with gradient and initials or icon
  return (
    <div
      className={`${commonClasses} flex items-center justify-center text-white font-medium shadow-inner overflow-hidden`}
      style={{
        ...sizeStyle,
        background: `linear-gradient(135deg, ${color}, ${color}CC)` // Add gradient effect
      }}
      title={name || pubkey}
    >
      {(initials && size > 24) ? (
        <span style={{ fontSize: Math.max(size / 2.5, 10) }}>{initials}</span>
      ) : (
        <UserIcon className="w-1/2 h-1/2" />
      )}
    </div>
  );
}
