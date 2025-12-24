import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ReactNode } from 'react';
import Header from '@/components/Header';
import { RelayProvider } from '@/context/RelayProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Nostr Web Client',
  description: 'A fully featured Nostr client built with Next.js and Tailwind CSS',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${inter.className} h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-50`}
      >
        <RelayProvider>
          <Header />
          {children}
        </RelayProvider>
      </body>
    </html>
  );
}
