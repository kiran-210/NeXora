"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useWallet } from "./wallet";
import {
  Balances,
  BorrowerPosition,
  getBalances,
  getBorrowerPosition,
  getLenderPosition,
  getParticipantCounts,
  getPoolStats,
  LenderPosition,
  ParticipantCounts,
  PoolStats,
} from "./contracts";

interface AppData {
  pool: PoolStats | null;
  lender: LenderPosition | null;
  borrower: BorrowerPosition | null;
  balances: Balances | null;
  counts: ParticipantCounts | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { address } = useWallet();
  const [pool, setPool] = useState<PoolStats | null>(null);
  const [lender, setLender] = useState<LenderPosition | null>(null);
  const [borrower, setBorrower] = useState<BorrowerPosition | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [counts, setCounts] = useState<ParticipantCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Bumped only by an explicit refresh (e.g. after a transaction), never by
  // the background poll — see the participant-counts effect below.
  const [manualTick, setManualTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    setManualTick((t) => t + 1);
  }, []);

  // Pool rates, the XLM oracle price and therefore every health factor move
  // without the user doing anything. Without this the page only ever showed
  // the numbers from the moment it loaded, so a position could drift into
  // liquidation territory while the UI still displayed it as safe.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      try {
        const poolStats = await getPoolStats();
        if (cancelled) return;
        setPool(poolStats);
        if (address) {
          const [l, b, bal] = await Promise.all([
            getLenderPosition(address),
            getBorrowerPosition(address),
            getBalances(address),
          ]);
          if (cancelled) return;
          setLender(l);
          setBorrower(b);
          setBalances(bal);
        } else {
          setLender(null);
          setBorrower(null);
          setBalances(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [address, tick]);

  // Participant counts are slow (paged event queries over ~24h of ledgers) and
  // barely move, so they deliberately do NOT ride the 15s tick — that would
  // fire six paged RPC scans a minute. Refreshed on mount and after an
  // explicit user action only.
  useEffect(() => {
    let cancelled = false;
    const loadCounts = async () => {
      try {
        const c = await getParticipantCounts();
        if (!cancelled) setCounts(c);
      } catch {
        /* leave counts as-is; UI floors by on-chain state */
      }
    };
    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [manualTick]);

  return (
    <Ctx.Provider value={{ pool, lender, borrower, balances, counts, loading, error, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppData(): AppData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
