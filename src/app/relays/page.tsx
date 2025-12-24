"use client";
import { useState } from "react";
import { useRelay } from "@/context/RelayProvider";

export default function RelaysPage() {
  const { relays, addRelay, removeRelay } = useRelay();
  const [url, setUrl] = useState("");

  const handleAdd = () => {
    if (url.trim()) {
      addRelay(url.trim());
      setUrl("");
    }
  };

  return (
    <main className="max-w-xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Relay Management</h1>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="wss://your-relay.domain"
          className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          onClick={handleAdd}
          className="px-4 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
          disabled={!url.trim()}
        >
          Add
        </button>
      </div>

      <ul className="space-y-2">
        {relays.map((relay) => (
          <li
            key={relay}
            className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
          >
            <span className="break-all text-sm">{relay}</span>
            <button
              onClick={() => removeRelay(relay)}
              className="ml-4 text-xs text-red-500 hover:text-red-600"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
