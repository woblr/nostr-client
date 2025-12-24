"use client";

export default function ProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Cover photo skeleton */}
      <div className="h-32 bg-gray-300 dark:bg-gray-700 rounded-xl w-full" />
      
      {/* Profile header skeleton */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Avatar skeleton */}
        <div className="w-24 h-24 rounded-full bg-gray-300 dark:bg-gray-700 -mt-12 border-4 border-white dark:border-gray-800" />
        
        <div className="flex-1 space-y-3">
          {/* Name skeleton */}
          <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-1/3" />
          
          {/* Pubkey skeleton */}
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-2/3" />
          
          {/* Bio skeleton */}
          <div className="space-y-2">
            <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6" />
          </div>
          
          {/* Stats skeleton */}
          <div className="flex gap-4 pt-1">
            <div className="h-5 bg-gray-300 dark:bg-gray-700 rounded w-16" />
            <div className="h-5 bg-gray-300 dark:bg-gray-700 rounded w-16" />
            <div className="h-5 bg-gray-300 dark:bg-gray-700 rounded w-16" />
          </div>
          
          {/* Button skeleton */}
          <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-24" />
        </div>
      </div>
      
      {/* Content skeleton - posts */}
      <div className="space-y-4 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-4 rounded-xl bg-gray-200 dark:bg-gray-700/50">
            <div className="rounded-full bg-gray-300 dark:bg-gray-600 h-10 w-10" />
            <div className="flex-1 space-y-2">
              <div className="w-1/3 h-4 bg-gray-300 dark:bg-gray-600 rounded" />
              <div className="w-full h-4 bg-gray-300 dark:bg-gray-600 rounded" />
              <div className="w-2/3 h-4 bg-gray-300 dark:bg-gray-600 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
