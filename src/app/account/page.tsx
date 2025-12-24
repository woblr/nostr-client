"use client";
import { useState } from "react";
import { createNewKeyPair } from "@/lib/nostr/keys";
import { saveAccount, loadAccount } from "@/lib/nostr/storage";

export default function AccountPage() {
  const [pass, setPass] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  const generate = () => {
    const { sk, pk } = createNewKeyPair();
    saveAccount(sk, pk, pass);
    setInfo(`New account created!\nPK: ${pk}`);
  };

  const load = () => {
    const res = loadAccount(pass);
    if (res) setInfo(`Loaded!\nPK: ${res.pk}`);
    else setInfo("Failed to decrypt stored account");
  };

  return (
    <main className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Account</h1>
      <input
        type="password"
        placeholder="Passphrase"
        className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={generate}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-2 disabled:opacity-50"
          disabled={!pass}
        >
          Generate Keys
        </button>
        <button
          onClick={load}
          className="flex-1 bg-gray-200 dark:bg-gray-700 dark:text-gray-200 rounded px-3 py-2 disabled:opacity-50"
          disabled={!pass}
        >
          Load Stored
        </button>
      </div>
      {info && (
        <pre className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-3 rounded text-sm">
          {info}
        </pre>
      )}
    </main>
  );
}
