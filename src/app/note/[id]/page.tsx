"use client";
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { useRelay } from '@/context/RelayProvider';
import { AnyNostrEvent, NostrEvent } from '@/types/nostr';
import NoteCard from '@/components/NoteCard';
import ComposeNote from '@/components/ComposeNote';
import Link from 'next/link';
import { ArrowPathIcon, ArrowUturnLeftIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

function NoteThreadContent() {
  const { id } = useParams<{ id: string }>();
  const { manager } = useRelay();
  const router = useRouter();
  const [root, setRoot] = useState<NostrEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [replies, setReplies] = useState<NostrEvent[]>([]);

  // Fetch the note and its replies
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setReplies([]);
    setRoot(null);

    // Create a timer to set notFound if we don't get data quickly enough
    const notFoundTimer = setTimeout(() => {
      if (!root) setNotFound(true);
    }, 5000);

    // First, fetch the root note directly by its ID
    const rootSubId = `note-${id}`;
    manager.subscribe(
      rootSubId,
      { kinds: [1], ids: [id as string] },
      (ev: AnyNostrEvent) => {
        if (ev.kind !== 1) return;
        if (ev.id === id) {
          setRoot(ev as NostrEvent);
          setLoading(false);
          clearTimeout(notFoundTimer);
        }
      }
    );

    // Second, subscribe to all replies separately
    const repliesSubId = `note-replies-${id}`;
    manager.subscribe(
      repliesSubId,
      { kinds: [1], '#e': [id as string], limit: 100 },
      (ev: AnyNostrEvent) => {
        if (ev.kind !== 1 || ev.id === id) return;
        setReplies((prev) => {
          if (prev.find((p) => p.id === ev.id)) return prev;
          return [...prev, ev as NostrEvent].sort((a, b) => a.created_at - b.created_at);
        });
      }
    );

    return () => {
      manager.unsubscribe(rootSubId);
      manager.unsubscribe(repliesSubId);
      clearTimeout(notFoundTimer);
    };
  }, [id, manager]);

  // Display loading state
  if (loading && !root) {
    return (
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <ArrowPathIcon className="h-10 w-10 text-indigo-500 animate-spin mb-4" />
          <h2 className="text-lg font-medium">Loading post...</h2>
          <p className="text-gray-500 text-sm mt-2">Fetching data from relays</p>
        </div>
      </main>
    );
  }

  // Display not found state
  if (notFound && !root) {
    return (
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="bg-amber-100 dark:bg-amber-900/30 p-3 rounded-full mb-4">
            <ExclamationCircleIcon className="h-10 w-10 text-amber-600" />
          </div>
          <h2 className="text-lg font-medium">Post not found</h2>
          <p className="text-gray-500 text-sm mt-2 mb-6">This post might have been deleted or is not available on connected relays.</p>
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
            Go Back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      {root && <NoteCard event={root} />}
      
      {replies.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-300">
            {replies.length === 1 ? '1 Reply' : `${replies.length} Replies`}
          </h2>
          <div className="space-y-4">
            {replies.map((r) => (
              <div key={r.id} className="pl-4 border-l-2 border-indigo-300/30 dark:border-indigo-700/30">
                <NoteCard event={r} />
              </div>
            ))}
          </div>
        </div>
      )}
      
      {root && (
        <div className="pt-6 mt-2 border-t border-gray-200 dark:border-gray-700">
          <ComposeNote replyTo={id as string} />
        </div>
      )}
    </main>
  );
}

export default function NoteThreadPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
      </div>
    }>
      <NoteThreadContent />
    </Suspense>
  );
}
