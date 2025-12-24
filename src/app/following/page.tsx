"use client";
import { getFollowing } from '@/lib/nostr/follow';
import useFeed from '@/hooks/useFeed';
import { useEffect, useState } from 'react';
import NoteCard from '@/components/NoteCard';
import NoteSkeleton from '@/components/NoteSkeleton';

export default function FollowingPage() {
  const [authors, setAuthors] = useState<string[]>([]);
  useEffect(() => {
    setAuthors(getFollowing());
  }, []);
  const { events, loading } = useFeed(30, authors.length ? authors : undefined);

  return (
    <main className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Following Feed</h1>
      {authors.length === 0 && (
        <p className="text-sm text-gray-500">You are not following anyone yet.</p>
      )}
      {loading && Array.from({ length: 5 }).map((_, i) => <NoteSkeleton key={i} />)}
      {events.map((e) => (
        <NoteCard key={e.id} event={e} />
      ))}
      {!loading && events.length === 0 && authors.length > 0 && (
        <p className="text-center text-sm text-gray-500">No notes yet.</p>
      )}
    </main>
  );
}
