"use client";

import { useState } from "react";
import { enableUsdcTrustline } from "@/lib/contracts";
import { useAppData } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { useWallet } from "@/lib/wallet";
import { Button } from "./ui";
import { TxFeedback } from "./TxFeedback";

/**
 * Two-step onboarding for the classic test-USDC asset:
 *   1. Enable USDC  — the wallet signs a trustline (required to hold USDC).
 *   2. Get test USDC — a server faucet mints USDC to the wallet.
 * Each step shows only while it's the relevant next action.
 */
export function EnableUsdcNotice() {
  const { address } = useWallet();
  const { balances, refresh } = useAppData();
  const { run, status, error, hash } = useTx();

  const [faucetState, setFaucetState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  if (!balances) return null;

  // Step 1 — no trustline yet.
  if (!balances.usdcTrusted) {
    return (
      <div className="mb-4 rounded-xl border border-[var(--accent)]/30 bg-emerald-500/8 p-4">
        <p className="text-sm font-medium">Step 1 · Enable USDC</p>
        <p className="mt-1 text-xs text-[var(--text-dim)]">
          Add a one-time trustline so your wallet can hold and receive test USDC. Required before
          supplying, borrowing, or repaying.
        </p>
        <Button
          onClick={() => run((key, sign) => enableUsdcTrustline(key, sign))}
          loading={status === "pending"}
          className="mt-3"
        >
          Enable USDC
        </Button>
        <TxFeedback status={status} error={error} hash={hash} />
      </div>
    );
  }

  // Step 2 — trusted but no USDC yet: offer the faucet.
  if (balances.usdc === 0n) {
    async function getFaucet() {
      setFaucetState("loading");
      setFaucetMsg(null);
      try {
        const res = await fetch("/api/faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFaucetState("error");
          setFaucetMsg(
            data.error === "no_trustline"
              ? "Enable USDC first, then try again."
              : data.error || "Faucet request failed."
          );
          return;
        }
        setFaucetState("done");
        setFaucetMsg(`Sent ${data.amount} test USDC to your wallet.`);
        refresh();
      } catch {
        setFaucetState("error");
        setFaucetMsg("Faucet request failed.");
      }
    }

    return (
      <div className="mb-4 rounded-xl border border-[var(--accent)]/30 bg-emerald-500/8 p-4">
        <p className="text-sm font-medium">Step 2 · Get test USDC</p>
        <p className="mt-1 text-xs text-[var(--text-dim)]">
          Your wallet is ready but holds no USDC yet. Grab some from the faucet to start supplying —
          or borrow against XLM collateral instead.
        </p>
        <Button onClick={getFaucet} loading={faucetState === "loading"} className="mt-3">
          Get 1,000 test USDC
        </Button>
        {faucetState === "done" && <p className="mt-3 text-sm text-[var(--accent)]">{faucetMsg}</p>}
        {faucetState === "error" && <p className="mt-3 text-sm text-[var(--danger)]">{faucetMsg}</p>}
      </div>
    );
  }

  return null;
}
