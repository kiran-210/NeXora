"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  KitEventType,
  Networks,
  StellarWalletsKit,
  SwkAppLightTheme,
} from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { NETWORK_PASSPHRASE } from "./config";
import type { SignTx } from "./soroban";

let initialized = false;
function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new AlbedoModule(),
      new LobstrModule(),
    ],
    // Kit defaults to #3b82f6. Match NeXora's indigo brand color instead.
    theme: { ...SwkAppLightTheme, primary: "#6366f1", "primary-foreground": "#ffffff" },
  });
  initialized = true;
}

interface WalletContextValue {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTx: SignTx;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Init the kit and mirror its address into React state. STATE_UPDATED fires
  // once on launch (restoring a previously connected wallet) and on changes.
  useEffect(() => {
    ensureInit();
    const unsub = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (e) => {
      setAddress(e.payload.address ?? null);
    });
    return unsub;
  }, []);

  const connect = useCallback(async () => {
    ensureInit();
    setConnecting(true);
    setError(null);
    try {
      const { address } = await StellarWalletsKit.authModal();
      setAddress(address);
    } catch (e) {
      // Closing the modal without picking a wallet is normal, not an error —
      // but any other failure (no extension installed, a kit/network error)
      // used to fail exactly the same way: the button just stopped spinning
      // with nothing to explain why nothing happened.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/User (declined|rejected)|denied|cancel|closed/i.test(msg)) {
        setError("Couldn't connect a wallet. Make sure a supported wallet extension is installed and try again.");
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await StellarWalletsKit.disconnect();
    setAddress(null);
  }, []);

  const signTx = useCallback<SignTx>(
    async (xdr) => {
      if (!address) throw new Error("Wallet not connected");
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        address,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      return { signedTxXdr };
    },
    [address]
  );

  const value = useMemo(
    () => ({ address, connecting, error, connect, disconnect, signTx }),
    [address, connecting, error, connect, disconnect, signTx]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
