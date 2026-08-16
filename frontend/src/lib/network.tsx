"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Network = "testnet" | "mainnet";

interface NetworkContextValue {
  network: Network;
  setNetwork: (n: Network) => void;
  isTestnet: boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);
const STORAGE_KEY = "nexora:network";

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetworkState] = useState<Network>("testnet");

  useEffect(() => {
    const restore = () => {
      const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (saved === "mainnet" || saved === "testnet") setNetworkState(saved);
    };
    restore();
  }, []);

  function setNetwork(n: Network) {
    setNetworkState(n);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, n);
  }

  const value = useMemo(
    () => ({ network, setNetwork, isTestnet: network === "testnet" }),
    [network]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
}
