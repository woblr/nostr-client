"use client";
import React, { Suspense } from 'react';
import DirectMessages from '@/components/DirectMessages';
import { useParams } from 'next/navigation';

function DMConversationContent() {
  const params = useParams();
  const pubkey = params.pubkey as string;

  return (
    <div className="max-w-2xl mx-auto py-4 px-4 sm:px-6">
      <DirectMessages />
    </div>
  );
}

export default function DMConversationPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto py-4 px-4 sm:px-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3"></div>
          <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
      </div>
    }>
      <DMConversationContent />
    </Suspense>
  );
}
