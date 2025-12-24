"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useActivePublicKey, useUserStore } from '@/store/useUserStore';
import { Bars3Icon, MoonIcon, SunIcon, BoltIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useRelay } from '@/context/RelayProvider';
import { useTheme } from '@/hooks/useTheme';

const baseLinks = [
  { href: '/', label: 'Home' },
  { href: '/relays', label: 'Relays' },
  { href: '/following', label: 'Following' },
  { href: '/notifications', label: 'Notifications' },
];

const authenticatedLinks = [
  { href: '/dm', label: 'Messages' },
  { href: '/profile', label: 'Profile' },
];

type NavLink = { href: string; label: string };

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const pubkey = useActivePublicKey();
  const navLinks: NavLink[] = pubkey ? [...baseLinks, ...authenticatedLinks] : [...baseLinks, { href: '/login', label: 'Login' }];
  const { manager } = useRelay();
  const [relayStatus, setRelayStatus] = useState<'connected'|'connecting'|'error'>('connecting');
  
  useEffect(() => {
    const checkStatus = () => {
      // Check if we have any active connections
      const status = manager.getStatus();
      if (status.connected === 0) {
        return status.connecting > 0 ? 'connecting' : 'error';
      }
      return 'connected';
    };
    
    const interval = setInterval(() => {
      setRelayStatus(checkStatus());
    }, 3000);
    setRelayStatus(checkStatus());
    
    return () => clearInterval(interval);
  }, [manager]);

  useEffect(() => {
    setOpen(false); // close drawer on route change
  }, [pathname]);

  return (
    <header className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow sticky top-0 z-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
        <div className="flex items-center">  
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-indigo-600 mr-4">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-600 text-white">
            N
          </div>
          <span>Nostr</span>
          </Link>
        </div>
        <nav className="hidden md:flex space-x-6 items-center">
          {/* Search Button - Direct link to search page */}
          <Link href="/search" className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-indigo-600">
            <MagnifyingGlassIcon className="h-5 w-5 mr-1" />
            <span>Search</span>
          </Link>
          
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-medium hover:text-indigo-600 ${pathname === href ? "text-indigo-600" : "text-gray-600 dark:text-gray-300"}`}
            >
              {label}
            </Link>
          ))}
          <div className="flex items-center gap-3">
            {pubkey && (
              <button
                onClick={() => useUserStore.getState().logout()}
                className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600"
              >
                Logout
              </button>
            )}
            <div className={`h-2 w-2 rounded-full ${{
              'connected': 'bg-green-500',
              'connecting': 'bg-yellow-500 animate-pulse',
              'error': 'bg-red-500'
            }[relayStatus]}`} title={`Relay status: ${relayStatus}`} />
            
          <button onClick={toggle} className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            {theme === 'dark' ? (
              <SunIcon className="h-5 w-5" />
            ) : (
              <MoonIcon className="h-5 w-5" />
            )}
          </button>
          </div>
        </nav>
        <button
          className="md:hidden p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={() => setOpen(!open)}
        >
          <Bars3Icon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 pb-4 space-y-2">
          <Link 
            href="/search" 
            className="flex items-center py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            <MagnifyingGlassIcon className="h-5 w-5 mr-2" />
            <span>Search</span>
          </Link>
          {pubkey && (
            <button
              onClick={() => useUserStore.getState().logout()}
              className="block w-full text-left py-2 text-sm font-medium text-red-600"
            >
              Logout
            </button>
          )}
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block py-2 text-sm font-medium ${pathname === href ? "text-indigo-600" : "text-gray-700 dark:text-gray-300"}`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
