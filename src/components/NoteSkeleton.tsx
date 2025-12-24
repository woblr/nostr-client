"use client";
export default function NoteSkeleton() {
  return (
    <article className="flex gap-3 border-b border-gray-200 dark:border-gray-700 pb-4 animate-pulse">
      <div className="rounded-full bg-gray-300 dark:bg-gray-700 h-10 w-10 shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <div className="w-1/3 h-3 bg-gray-300 dark:bg-gray-700 rounded" />
        <div className="w-full h-3 bg-gray-300 dark:bg-gray-700 rounded" />
        <div className="w-5/6 h-3 bg-gray-300 dark:bg-gray-700 rounded" />
      </div>
    </article>
  );
}
