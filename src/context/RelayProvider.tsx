"use client";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { RelayManager } from "@/modules/relay/RelayManager";

interface RelayContextValue {
  manager: RelayManager;
  relays: string[];
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
}

const RelayContext = createContext<RelayContextValue | undefined>(undefined);

export function RelayProvider({ children }: { children: ReactNode }) {
  const [relays, setRelays] = useState<string[]>([
    "wss://relay.damus.io",
    "wss://nostr-pub.wellorder.net",
  ]);

  const addRelay = (url: string) =>
    setRelays((prev) => (prev.includes(url) ? prev : [...prev, url]));

  const removeRelay = (url: string) =>
    setRelays((prev) => prev.filter((r) => r !== url));

  const manager = useMemo(() => new RelayManager(relays), [relays]);

  const value = useMemo(
    () => ({ manager, relays, addRelay, removeRelay }),
    [manager, relays]
  );

  return <RelayContext.Provider value={value}>{children}</RelayContext.Provider>;
}

export function useRelay() {
  const context = useContext(RelayContext);
  if (!context) {
    throw new Error("useRelay must be used within RelayProvider");
  }
  return context;
}
