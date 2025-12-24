"use client";
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useActivePublicKey } from '@/store/useUserStore';
import useFeed from '@/hooks/useFeed';
import useProfile from '@/hooks/useProfile';
import useLikedNotes from '@/hooks/useLikedNotes';
import Avatar from '@/components/Avatar';
import useContactStats from '@/hooks/useContactStats';
import { isFollowing, follow, unfollow } from '@/lib/nostr/follow';
import NoteCard from '@/components/NoteCard';
import NoteSkeleton from '@/components/NoteSkeleton';
import ProfileSkeleton from '@/components/ProfileSkeleton';
import RichTextContent from '@/components/RichTextContent';
import { 
  UserIcon, 
  PhotoIcon, 
  BookmarkIcon, 
  Cog6ToothIcon, 
  XMarkIcon,
  LinkIcon,
  CheckBadgeIcon,
  CalendarIcon,
  GlobeAltIcon,
  UserPlusIcon,
  UserMinusIcon
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon as CheckBadgeSolid } from '@heroicons/react/24/solid';
import useContactList from '@/hooks/useContactList';
import useFollowersList from '@/hooks/useFollowersList';
import { nip19 } from 'nostr-tools';
import { format } from 'date-fns';

type TabType = 'posts' | 'media' | 'likes';

function ProfilePageContent() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const { events, loading } = useFeed(30, pubkey);
  const { events: likedEvents, loading: likesLoading } = useLikedNotes(pubkey);
  const meta = useProfile(pubkey);
  const activePubkey = useActivePublicKey();
  const isOwnProfile = activePubkey === pubkey;
  const stats = useContactStats(pubkey);

  const [following, setFollowing] = useState(isFollowing(pubkey));
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [animateHeader, setAnimateHeader] = useState(false);
  const [animateAvatar, setAnimateAvatar] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Modal state
  const [showFollowing, setShowFollowing] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showAvatarZoom, setShowAvatarZoom] = useState(false);
  const [showBannerZoom, setShowBannerZoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Convert pubkey to npub format
  const npub = useMemo(() => {
    try {
      return nip19.npubEncode(pubkey);
    } catch (e) {
      return null;
    }
  }, [pubkey]);

  // Active user's following list
  const myFollowing = useContactList(activePubkey ?? '');

  const followingList = useContactList(pubkey);
  const followersList = useFollowersList(pubkey);
  
  // Animation timing
  useEffect(() => {
    // Stagger animations for a nicer effect
    const headerTimer = setTimeout(() => setAnimateHeader(true), 100);
    const avatarTimer = setTimeout(() => setAnimateAvatar(true), 400);
    
    return () => {
      clearTimeout(headerTimer);
      clearTimeout(avatarTimer);
    };
  }, []);

  // Copy npub to clipboard
  const copyNpub = () => {
    if (npub) {
      navigator.clipboard.writeText(npub);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };
  
  // We don't have created_at in the ProfileMetadata type
  // so we'll use a placeholder for now
  const joinedDate = useMemo(() => {
    return 'Nostr User';
  }, []);
  
  // Process media posts outside of conditional rendering
  const mediaEvents = useMemo(() => {
    return events.filter(e => {
      // Check for image URLs in content
      return e.content.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/gi);
    });
  }, [events]);
  
  // Extract image URLs for the media grid
  const mediaUrls = useMemo(() => {
    const urls: {url: string, eventId: string}[] = [];
    
    mediaEvents.forEach(e => {
      const imageMatches = e.content.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/gi) || [];
      imageMatches.forEach(url => {
        urls.push({
          url,
          eventId: e.id
        });
      });
    });
    
    return urls;
  }, [mediaEvents]);

  const toggleFollow = () => {
    if (following) {
      unfollow(pubkey);
      setFollowing(false);
    } else {
      follow(pubkey);
      setFollowing(true);
    }
  };

  // Tab handler
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  if (!meta && loading) {
    return (
      <main className="max-w-4xl mx-auto p-4 space-y-4">
        <ProfileSkeleton />
      </main>
    );
  }
  
  return (
    <main className="max-w-4xl mx-auto p-0 sm:p-4 space-y-6">
      {/* Cover Photo Area with parallax effect */}
      <div 
        className={`h-48 sm:h-56 rounded-b-xl sm:rounded-xl relative overflow-hidden transition-all duration-700 ${animateHeader ? 'opacity-100 transform-none' : 'opacity-0 translate-y-4'}`}
      >
        {meta?.banner ? (
          // Using div as container and an absolutely positioned button that covers everything
          <>
            <img 
              src={meta.banner} 
              alt="Profile banner" 
              className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-1000"
            />
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] pointer-events-none"></div>
            {/* This transparent button sits on top of everything to capture clicks */}
            <button
              onClick={() => setShowBannerZoom(true)}
              className="absolute inset-0 w-full h-full cursor-zoom-in focus:outline-none z-10"
              aria-label="View banner in full size"
            ></button>
          </>
        ) : (
          // Gradient background for users without banner
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
        )}
      </div>
      
      {/* Profile header with avatar overlapping banner */}
      <div className="px-4 -mt-16 sm:-mt-20 relative">
        <div className="glass rounded-2xl shadow-lg p-6 pt-16 relative border border-white/10 backdrop-blur-sm transition-all duration-500">
          <div className={`absolute -top-12 sm:-top-14 left-6 transition-all duration-700 transform ${animateAvatar ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="relative group">
              <button 
                onClick={() => setShowAvatarZoom(true)} 
                className="cursor-zoom-in focus:outline-none transition-transform hover:scale-105 duration-200"
                aria-label="Zoom profile picture"
              >
                <Avatar 
                  pubkey={pubkey} 
                  picture={meta?.picture} 
                  name={meta?.display_name || meta?.name}
                  size={90} 
                  className="border-4 border-white dark:border-gray-800 shadow-xl rounded-full"
                />
              </button>
              {meta?.nip05 && (
                <span className="absolute bottom-1 right-0 rounded-full bg-white dark:bg-gray-800 p-0.5">
                  <CheckBadgeSolid className="h-5 w-5 text-blue-500" />
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mt-2">
            <div className="space-y-3 max-w-lg">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  {meta?.display_name || meta?.name || pubkey.slice(0, 8)}
                </h1>
                
                <button 
                  onClick={copyNpub} 
                  className="text-sm text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  {npub ? `${npub.slice(0, 8)}...${npub.slice(-4)}` : `${pubkey.slice(0, 10)}...${pubkey.slice(-4)}`}
                  {copySuccess ? (
                    <CheckBadgeIcon className="h-4 w-4 text-green-500" />
                  ) : (
                    <LinkIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              
              <div className="flex flex-wrap gap-y-2 gap-x-4">
                {joinedDate && (
                  <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                    <CalendarIcon className="h-4 w-4" />
                    <span>{joinedDate}</span>
                  </div>
                )}
                
                {meta?.website && (
                  <a 
                    href={meta.website.startsWith('http') ? meta.website : `https://${meta.website}`} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <GlobeAltIcon className="h-4 w-4" />
                    <span>{meta.website.replace(/^https?:\/\//i, '')}</span>
                  </a>
                )}
                
                {meta?.nip05 && (
                  <p className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
                    <CheckBadgeIcon className="h-4 w-4" />
                    <span>{meta.nip05}</span>
                  </p>
                )}
              </div>
              
              {meta?.about && (
                <div className="text-sm text-gray-700 dark:text-gray-300 py-1">
                  <RichTextContent content={meta.about} />
                </div>
              )}
            </div>
            
            <div className="flex flex-col items-start sm:items-end gap-2">
              {isOwnProfile ? (
                <Link
                  href="/profile-settings"
                  className="px-6 py-2 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700/80 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Cog6ToothIcon className="h-5 w-5" /> Settings
                </Link>
              ) : (
                <button
                  onClick={toggleFollow}
                  className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-1.5 shadow-sm ${following ? 
                    'border border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20' : 
                    'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
                >
                  {following ? (
                    <>
                      <UserMinusIcon className="h-4 w-4" /> Following
                    </>
                  ) : (
                    <>
                      <UserPlusIcon className="h-4 w-4" /> Follow
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          
          {/* Stats row */}
          <div className="flex flex-wrap gap-8 mt-6 text-sm">
            <button className="hover:text-indigo-600 transition-colors flex flex-col items-center">
              <span className="font-semibold text-lg">{events.length}</span>
              <span className="text-gray-600 dark:text-gray-400">Posts</span>
            </button>
            <button 
              onClick={() => setShowFollowing(true)} 
              className="hover:text-indigo-600 transition-colors flex flex-col items-center"
            >
              <span className="font-semibold text-lg">{stats.following ?? '0'}</span>
              <span className="text-gray-600 dark:text-gray-400">Following</span>
            </button>
            <button 
              onClick={() => setShowFollowers(true)} 
              className="hover:text-indigo-600 transition-colors flex flex-col items-center"
            >
              <span className="font-semibold text-lg">{stats.followers ?? '0'}</span>
              <span className="text-gray-600 dark:text-gray-400">Followers</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Tab navigation */}
      <div className="mt-2 px-4 mb-2">
        <div className="glassmorphism rounded-xl p-1 flex justify-between gap-1 border border-white/10 shadow-inner">
          <button
            onClick={() => handleTabChange('posts')}
            className={`py-2 px-4 rounded-lg flex items-center justify-center gap-2 flex-1 transition-all duration-300 ${activeTab === 'posts' ? 
              'bg-indigo-600 text-white shadow-md' : 
              'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
          >
            <UserIcon className="h-5 w-5" /> 
            <span className="font-medium">Posts</span>
          </button>
          <button
            onClick={() => handleTabChange('media')}
            className={`py-2 px-4 rounded-lg flex items-center justify-center gap-2 flex-1 transition-all duration-300 ${activeTab === 'media' ? 
              'bg-indigo-600 text-white shadow-md' : 
              'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
          >
            <PhotoIcon className="h-5 w-5" /> 
            <span className="font-medium">Media</span>
          </button>
          <button
            onClick={() => handleTabChange('likes')}
            className={`py-2 px-4 rounded-lg flex items-center justify-center gap-2 flex-1 transition-all duration-300 ${activeTab === 'likes' ? 
              'bg-indigo-600 text-white shadow-md' : 
              'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
          >
            <BookmarkIcon className="h-5 w-5" /> 
            <span className="font-medium">Likes</span>
          </button>
        </div>
      </div>
      {/* Active tab content with animation */}
      <div className="px-4">
        {activeTab === 'posts' && (
          <div className="animate-fade-in">
            {loading && (
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <NoteSkeleton key={i} />
                ))}
              </div>
            )}
            <div className="space-y-6">
              {events.map((e) => (
                <NoteCard key={e.id} event={e} />
              ))}
            </div>
            {!loading && events.length === 0 && (
              <div className="py-12 text-center">
                <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-6 mb-4">
                  <UserIcon className="h-8 w-8 text-gray-500" />
                </div>
                <p className="text-lg font-medium text-gray-900 dark:text-gray-100">No posts yet</p>
                <p className="text-gray-500 mt-1">When posts are created, they'll appear here.</p>
              </div>
            )}
          </div>
        )}
        
        {/* Media tab */}
        {activeTab === 'media' && (
          <div className="animate-fade-in">
            {loading ? (
              <div className="space-y-6">
                {Array.from({ length: 2 }).map((_, i) => (
                  <NoteSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div>
                {mediaEvents.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-6 mb-4">
                      <PhotoIcon className="h-8 w-8 text-gray-500" />
                    </div>
                    <p className="text-lg font-medium text-gray-900 dark:text-gray-100">No media found</p>
                    <p className="text-gray-500 mt-1">When posts with media are created, they'll appear here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {mediaUrls.map((item, i) => (
                      <a 
                        key={`${item.eventId}-${i}`} 
                        href={`/note/${item.eventId}`}
                        className="group block aspect-square rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300"
                      >
                        <div className="relative w-full h-full">
                          <img 
                            src={item.url} 
                            alt="Media" 
                            className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" 
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Likes tab */}
        {activeTab === 'likes' && (
          <div className="animate-fade-in">
            {likesLoading && (
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <NoteSkeleton key={i} />
                ))}
              </div>
            )}
            <div className="space-y-6">
              {likedEvents.map((e) => (
                <NoteCard key={e.id} event={e} />
              ))}
            </div>
            {!likesLoading && likedEvents.length === 0 && (
              <div className="py-12 text-center">
                <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-6 mb-4">
                  <BookmarkIcon className="h-8 w-8 text-gray-500" />
                </div>
                <p className="text-lg font-medium text-gray-900 dark:text-gray-100">No liked posts yet</p>
                <p className="text-gray-500 mt-1">Liked posts will appear here.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Following Modal */}
      {showFollowing && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div 
            className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden shadow-xl relative animate-scale-in border border-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold">Following</h2>
              <button 
                onClick={() => setShowFollowing(false)} 
                className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <XMarkIcon className="h-6 w-6"/>
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-4rem)]">
              {followingList.length === 0 ? (
                <div className="text-center py-8">
                  <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-4 mb-3">
                    <UserIcon className="h-6 w-6 text-gray-500" />
                  </div>
                  <p className="text-gray-500">No following yet.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {followingList.map((pk) => {
                    const amIFollowing = myFollowing.includes(pk);
                    const npubShort = (() => {
                      try {
                        const encoded = nip19.npubEncode(pk);
                        return `${encoded.slice(0, 8)}...${encoded.slice(-4)}`;
                      } catch (e) {
                        return `${pk.slice(0, 8)}...${pk.slice(-4)}`;
                      }
                    })();
                    
                    return (
                      <li key={pk} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition-colors">
                        <Avatar pubkey={pk} size={40} className="rounded-full" />
                        <div className="flex-1 min-w-0">
                          <Link 
                            href={`/profile/${pk}`} 
                            onClick={() => setShowFollowing(false)} 
                            className="block text-sm font-medium hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            {pk.slice(0, 8)}…
                          </Link>
                          <p className="text-xs text-gray-500 truncate">{npubShort}</p>
                        </div>
                        
                        {!amIFollowing && activePubkey && activePubkey !== pk && (
                          <button
                            onClick={() => follow(pk)}
                            className="ml-auto px-3 py-1.5 text-xs rounded-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm flex items-center gap-1 transition-all"
                          >
                            <UserPlusIcon className="h-3.5 w-3.5" />
                            <span>Follow</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Followers Modal */}
      {showFollowers && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div 
            className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden shadow-xl relative animate-scale-in border border-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold">Followers</h2>
              <button 
                onClick={() => setShowFollowers(false)} 
                className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <XMarkIcon className="h-6 w-6"/>
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-4rem)]">
              {followersList.length === 0 ? (
                <div className="text-center py-8">
                  <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-4 mb-3">
                    <UserIcon className="h-6 w-6 text-gray-500" />
                  </div>
                  <p className="text-gray-500">No followers yet.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {followersList.map((pk) => {
                    const amIFollowing = myFollowing.includes(pk);
                    const npubShort = (() => {
                      try {
                        const encoded = nip19.npubEncode(pk);
                        return `${encoded.slice(0, 8)}...${encoded.slice(-4)}`;
                      } catch (e) {
                        return `${pk.slice(0, 8)}...${pk.slice(-4)}`;
                      }
                    })();
                    
                    return (
                      <li key={pk} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition-colors">
                        <Avatar pubkey={pk} size={40} className="rounded-full" />
                        <div className="flex-1 min-w-0">
                          <Link 
                            href={`/profile/${pk}`} 
                            onClick={() => setShowFollowers(false)} 
                            className="block text-sm font-medium hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            {pk.slice(0, 8)}…
                          </Link>
                          <p className="text-xs text-gray-500 truncate">{npubShort}</p>
                        </div>
                        
                        {!amIFollowing && activePubkey && activePubkey !== pk && (
                          <button
                            onClick={() => follow(pk)}
                            className="ml-auto px-3 py-1.5 text-xs rounded-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm flex items-center gap-1 transition-all"
                          >
                            <UserPlusIcon className="h-3.5 w-3.5" />
                            <span>Follow</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Banner Zoom Modal */}
      {showBannerZoom && meta?.banner && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center animate-fade-in overflow-hidden"
          onClick={() => {
            setZoomLevel(1); // Reset zoom when closing modal
            setShowBannerZoom(false);
          }}
        >
          <div 
            className="relative w-full max-w-5xl mx-auto px-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside container
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoomLevel(1);
                setShowBannerZoom(false);
              }}
              className="absolute top-4 right-4 text-white rounded-full p-2 bg-black/50 hover:bg-black/70 transition-colors z-10"
              aria-label="Close zoom view"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
            
            <div className="relative mx-auto overflow-hidden">
              <div className="relative overflow-auto max-h-[80vh] flex justify-center items-center no-scrollbar">
                <img
                  src={meta.banner}
                  alt="Profile banner"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Cycle through zoom levels: 1 -> 1.5 -> 2 -> 1
                    setZoomLevel(zoomLevel >= 2 ? 1 : zoomLevel + 0.5);
                  }}
                  style={{
                    transform: `scale(${zoomLevel})`,
                    transition: 'transform 0.3s ease-out',
                    cursor: zoomLevel < 2 ? 'zoom-in' : 'zoom-out',
                    maxWidth: '100%',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    transformOrigin: 'center center',
                  }}
                  className="rounded-lg shadow-2xl"
                />
              </div>
            </div>
            
            <div className="text-center mt-4 text-white">
              <h3 className="text-xl font-bold">Profile Banner</h3>
              <p className="mt-3 text-sm text-gray-400">
                {zoomLevel === 1 ? "Click image to zoom in" : 
                zoomLevel === 1.5 ? "Click again to zoom more" : 
                "Click to reset zoom"}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Avatar Zoom Modal */}
      {showAvatarZoom && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center animate-fade-in overflow-hidden"
          onClick={() => {
            setZoomLevel(1); // Reset zoom when closing modal
            setShowAvatarZoom(false);
          }}
        >
          <div 
            className="relative w-full max-w-4xl mx-auto px-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside container
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoomLevel(1);
                setShowAvatarZoom(false);
              }}
              className="absolute top-4 right-4 text-white rounded-full p-2 bg-black/50 hover:bg-black/70 transition-colors z-10"
              aria-label="Close zoom view"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
            
            <div className="relative mx-auto overflow-hidden">
              {meta?.picture ? (
                <div className="relative overflow-auto max-h-[70vh] flex justify-center items-center no-scrollbar">
                  <img
                    src={meta.picture}
                    alt="Profile picture"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Cycle through zoom levels: 1 -> 1.5 -> 2 -> 1
                      setZoomLevel(zoomLevel >= 2 ? 1 : zoomLevel + 0.5);
                    }}
                    style={{
                      transform: `scale(${zoomLevel})`,
                      transition: 'transform 0.3s ease-out',
                      cursor: zoomLevel < 2 ? 'zoom-in' : 'zoom-out',
                      maxWidth: '100%',
                      transformOrigin: 'center center',
                    }}
                    className="rounded-lg shadow-2xl"
                  />
                </div>
              ) : (
                <div 
                  className="w-64 h-64 sm:w-96 sm:h-96 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-6xl font-bold text-white">
                    {(meta?.name?.[0] || meta?.display_name?.[0] || pubkey?.[0] || '?').toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            
            <div className="text-center mt-4 text-white">
              <h3 className="text-xl font-bold">{meta?.display_name || meta?.name || 'Nostr User'}</h3>
              {npub && <p className="text-gray-300 text-sm mt-1">{npub}</p>}
              {meta?.picture && (
                <p className="mt-3 text-sm text-gray-400">
                  {zoomLevel === 1 ? "Click image to zoom in" : 
                   zoomLevel === 1.5 ? "Click again to zoom more" : 
                   "Click to reset zoom"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

export default function ProfilePage() {
  const { pubkey } = useParams<{ pubkey: string }>();
  
  // Using a key to ensure component fully remounts when profile changes
  // This is the key improvement for navigation without vibration
  return (
    <div className="min-h-screen" key={`profile-${pubkey}`}>
      <ProfilePageContent />
    </div>
  );
}
