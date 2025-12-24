"use client";
import React from 'react';
import DirectMessages from '@/components/DirectMessages';

export default function DMPage() {
  return (
    <div className="max-w-2xl mx-auto py-4 px-4 sm:px-6">
      <h1 className="text-2xl font-bold mb-4">Direct Messages</h1>
      <DirectMessages />
    </div>
  );
}
