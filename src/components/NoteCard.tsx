"use client";
import { NostrEvent } from '@/types/nostr';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

import Avatar from './Avatar';
import useProfile from '@/hooks/useProfile';
import { getDisplayName } from '@/lib/nostr/utils';
import { useRelay } from '@/context/RelayProvider';
import { useMemo } from 'react';
import RichTextContent from './RichTextContent';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline';
import type { AnyNostrEvent } from '@/types/nostr';
import { KeyManager } from '@/lib/nostr/KeyManager';
import { useUserStore } from '@/store/useUserStore';
import { publishEvent } from '@/lib/nostr/events';
import ComposeNote from './ComposeNote';
import useReplies from '@/hooks/useReplies';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { ChatBubbleLeftIcon as ChatSolid } from '@heroicons/react/24/solid';
import { ChatBubbleLeftIcon as ChatOutline, PaperAirplaneIcon, EnvelopeIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import ImageZoomModal from './ImageZoomModal';

interface Props {
  event: NostrEvent;
  depth?: number; // nesting depth
}

export default function NoteCard({ event, depth = 0 }: Props) {
    const meta = useProfile(event.pubkey);
    const router = useRouter();
  const pubShort = getDisplayName(event.pubkey, meta);
  const { manager } = useRelay();
  const imageUrls = useMemo(() => {
    const regex = /(https?:\/\/\S+\.(?:png|jpe?g|gif|webp))/gi;
    const matches = [...event.content.matchAll(regex)].map((m) => m[1]);
    return matches.slice(0, 4);
  }, [event.content]);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState(false);
  const [replying, setReplying] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [localReplies, setLocalReplies] = useState<AnyNostrEvent[]>([]);
  const replies = useReplies(event.id);
  
  // Gallery state
  const [showGallery, setShowGallery] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const merged = depth === 0 ? [...replies, ...localReplies] : replies;
  const seenIds = new Set<string>();
  const children = merged.filter(r => {
    if (r.tags.find(t=>t[0]==='e')?.[1] !== event.id) return false;
    if (seenIds.has(r.id)) return false;
    seenIds.add(r.id);
    return true;
  });
  const commentCount = depth === 0 ? children.length : 0;
  

  const url = `${window.location.origin}/note/${event.id}`;
  const shareNote = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ url, title: 'Check this note', text: event.content.slice(0, 80) });
        return;
      } catch {}
    }
    setShareOpen(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {}
  };

  useEffect(() => {
    const subId = `reactions-${event.id}`;
    manager.subscribe(
      subId,
      { kinds: [7], "#e": [event.id] },
      (ev) => {
        if (ev.kind !== 7 || !ev.pubkey) return;
        setLikes((prev) => {
          if (prev.has(ev.pubkey)) return prev;
          const next = new Set(prev);
          next.add(ev.pubkey);
          return next;
        });
      }
    );
    return () => manager.unsubscribe(subId);
  }, [event.id, manager]);

  const likeNote = async () => {
    if (liked) return;
    try {
      // Try local account first
      const { accounts, activeAccountId } = useUserStore.getState();
      const active = accounts.find(a => a.id === activeAccountId);

      let signed: any;
      if (active) {
        const unsigned: any = {
          kind: 7,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['e', event.id],
            ['p', event.pubkey],
          ],
          content: '+',
          pubkey: active.pubkey,
        };
        signed = await KeyManager.signEvent(unsigned, active.pubkey);
      } else if (window.nostr) {
        const pk = await window.nostr.getPublicKey();
        const unsigned: any = {
          kind: 7,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['e', event.id],
            ['p', event.pubkey],
          ],
          content: '+',
          pubkey: pk,
        };
        signed = await window.nostr.signEvent(unsigned);
      } else {
        alert('No signing method available (NIP-07 or local key).');
        return;
      }

      await publishEvent(signed, manager.getRelays());
      setLiked(true);
      setLikes(prev => new Set(prev).add(signed.pubkey));
    } catch (err) {
      console.error(err);
      alert('Failed to like');
    }
  };

  // State for image zoom modal
  const [showImageZoom, setShowImageZoom] = useState(false);
  const [zoomedImageUrl, setZoomedImageUrl] = useState('');

  return (
    <article className="flex gap-5 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-xl shadow-md hover:shadow-lg border border-gray-100 dark:border-gray-700/30 transition-all duration-300 p-5">
      <Link href={`/profile/${event.pubkey}`} className="flex-shrink-0 group relative">
        <div className="h-14 w-14 rounded-full overflow-hidden ring-2 ring-white dark:ring-gray-700 group-hover:ring-indigo-200 dark:group-hover:ring-indigo-500/30 transition-all flex items-center justify-center">
          <Avatar pubkey={event.pubkey} picture={meta?.picture} name={meta?.display_name || meta?.name} size={56} className="w-full h-full" />
        </div>
      </Link>
      <div className="flex-1 min-w-0 space-y-3">
        <header className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link href={`/profile/${event.pubkey}`} className="font-medium hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[180px] text-gray-900 dark:text-gray-100 text-base transition-colors">
              {meta?.display_name || meta?.name || pubShort}
            </Link>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal truncate">@{pubShort}</span>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{dayjs.unix(event.created_at).fromNow()}</span>
        </header>
        <Link href={`/note/${event.id}`} className="block hover:bg-gray-50/70 dark:hover:bg-gray-750/50 -mx-1 px-2 py-1 rounded-md transition-colors">
          <RichTextContent 
            content={event.content}
            className="text-base leading-relaxed text-gray-800 dark:text-gray-100"
          />
        </Link>
        {imageUrls.length > 0 && (
          <div className={`grid gap-3 mt-4 ${imageUrls.length === 1 ? '' : imageUrls.length === 2 ? 'grid-cols-2' : imageUrls.length === 3 ? 'grid-cols-3' : imageUrls.length >= 4 ? 'grid-cols-2 md:grid-cols-3' : ''}`}>
            {imageUrls.map((url, index) => (
              <div 
                key={url}
                className="relative group overflow-hidden rounded-xl h-full cursor-zoom-in shadow-sm hover:shadow-md transition-all ring-1 ring-gray-200 dark:ring-gray-700"
                onClick={() => {
                  setActiveImageIndex(index);
                  setZoomLevel(1);
                  setShowGallery(true);
                }}
              >
                <div className={`w-full h-full ${imageUrls.length === 1 ? 'aspect-video' : 'aspect-square'}`}>
                  <img 
                    src={url} 
                    alt="media" 
                    className="rounded-xl object-cover w-full h-full transition-transform duration-300 group-hover:scale-105" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>
                {imageUrls.length > 1 && (
                  <span className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md">
                    {index + 1}/{imageUrls.length}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1 sm:gap-2 pt-4 mt-2 text-gray-500 dark:text-gray-400 text-sm border-t border-gray-100 dark:border-gray-700/50">
          <button 
            onClick={likeNote} 
            className={`flex items-center gap-1.5 group ${liked ? 'text-rose-600 dark:text-rose-500' : 'hover:text-rose-600 dark:hover:text-rose-500'} px-3 py-2 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all`}
          >
            {liked ? (
              <HeartSolid className="h-5 w-5 text-rose-600 dark:text-rose-500" />
            ) : (
              <HeartOutline className="h-5 w-5 group-hover:scale-110 transition-transform" />
            )}
            {likes.size > 0 && <span className="font-semibold">{likes.size}</span>}
          </button>
          
          <button 
            onClick={() => setReplying(prev => !prev)} 
            className={`flex items-center gap-1.5 ${replying ? 'text-indigo-600 dark:text-indigo-400' : 'hover:text-indigo-600 dark:hover:text-indigo-400'} px-3 py-2 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all`} 
            title="Comments"
          >
            {replying ? 
              <ChatSolid className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> : 
              <ChatOutline className="h-5 w-5 group-hover:scale-110 transition-transform" />
            }
            {commentCount > 0 && <span className="font-semibold">{commentCount}</span>}
            <span className="sr-only">Comments</span>
          </button>
          
          <button 
            onClick={shareNote} 
            className="flex items-center gap-1.5 hover:text-emerald-600 dark:hover:text-emerald-500 px-3 py-2 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all" 
            title="Share"
          >
            <PaperAirplaneIcon className="h-5 w-5 group-hover:scale-110 transition-transform" />
            <span className="sr-only">Share</span>
          </button>
          
          <button 
            onClick={() => router.push(`/dm/${event.pubkey}`)} 
            className="flex items-center gap-1.5 hover:text-amber-600 dark:hover:text-amber-500 px-3 py-2 rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all ml-auto" 
            title="Direct Message"
          >
            <EnvelopeIcon className="h-5 w-5 group-hover:scale-110 transition-transform" />
            <span className="sr-only">DM</span>
          </button>
        </div>
        {((depth === 0 && replying) || (depth > 0 && children.length > 0)) && (
          <div className="mt-3 space-y-3">
            {children.map((child) => (
              <div
                key={child.id}
                className="pl-4 border-l-2 border-indigo-200 dark:border-indigo-400"
              >
                <NoteCard event={child} depth={depth + 1} />
              </div>
            ))}
            {depth === 0 && replying && (
              <ComposeNote
                replyTo={event.id}
                onSuccess={(ev) =>
                  setLocalReplies((prev) =>
                    prev.some((p) => p.id === ev.id) ? prev : [...prev, ev]
                  )
                }
              />
            )}
          </div>
        )}
      </div>
    {shareOpen && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={()=>setShareOpen(false)}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-80" onClick={e=>e.stopPropagation()}>
          <h3 className="text-lg font-semibold mb-4">Share Note</h3>
          <input value={url} readOnly className="w-full border rounded px-2 py-1 text-sm mb-3 bg-gray-100 dark:bg-gray-700" />
          <button onClick={copyLink} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-1 rounded text-sm mb-2">Copy link</button>
          <button onClick={()=>setShareOpen(false)} className="w-full border border-gray-300 dark:border-gray-600 py-1 rounded text-sm">Close</button>
        </div>
      </div>
    )}

    {/* Profile-Style Image Zoom Modal - Identical to Avatar Zoom */}
    {showGallery && imageUrls.length > 0 && (
      <ImageZoomModal
        imageUrl={imageUrls[activeImageIndex]}
        altText={`Post image ${activeImageIndex + 1} of ${imageUrls.length}`}
        imageUrls={imageUrls}
        currentIndex={activeImageIndex}
        onNavigate={(newIndex) => {
          setActiveImageIndex(newIndex);
          setZoomLevel(1);
        }}
        onClose={() => {
          setZoomLevel(1);
          setShowGallery(false);
        }}
      />
    )}
  </article>
  );
}
