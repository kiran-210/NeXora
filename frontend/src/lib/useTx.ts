"use client";

import { useState } from "react";
import { CONTRACTS } from "./config";
import { useAppData } from "./data";
import { ContractCallError, TxPendingError, type SendResult } from "./soroban";
import { useToast } from "./toast";
import { useWallet } from "./wallet";

export type TxStatus = "idle" | "pending" | "success" | "error" | "unconfirmed";

// The two NeXora contracts number their errors independently, and codes #4–#6
// mean *different things* in each. Translating a code without knowing which
// contract panicked produced flatly wrong messages (a pool liquidity shortfall
// was reported as "price feed unavailable", and so on), so each contract gets
// its own table.
const POOL_HINTS: Record<string, string> = {
  "#2": "The pool isn't initialized yet.",
  "#3": "Invalid amount.",
  "#4": "You don't hold enough shares.",
  "#5": "The pool doesn't have enough idle liquidity for that withdrawal right now — borrowers need to repay first.",
  "#6": "The Collateral Manager isn't wired to this pool yet.",
};

const CM_HINTS: Record<string, string> = {
  "#2": "The collateral manager isn't initialized yet.",
  "#3": "Invalid amount.",
  "#4": "You don't have a position yet — add collateral first.",
  "#5": "That would drop you below the 150% minimum collateral ratio.",
  "#6": "Price feed unavailable right now. Try again shortly.",
  "#7": "There's no debt to repay.",
  "#8": "This position isn't eligible for liquidation.",
};

// Codes shared by both contracts, used when we can't attribute the failure.
const GENERIC_HINTS: Record<string, string> = {
  "#3": "Invalid amount.",
  "#5": "Not enough — this would break the required collateral ratio or exceed available liquidity.",
  "#7": "There's no debt to repay.",
  "#8": "This position isn't eligible for liquidation.",
};

// Stellar Asset Contract error codes seen during token transfers.
const TOKEN_HINTS: Record<string, string> = {
  "#10": "Your wallet doesn't have enough of that token.",
  "#13": "You need to enable (add a trustline for) USDC first.",
};

function hintsFor(contractId?: string): Record<string, string> {
  if (contractId === CONTRACTS.pool) return POOL_HINTS;
  if (contractId === CONTRACTS.collateralManager) return CM_HINTS;
  return GENERIC_HINTS;
}

export function humanizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (e instanceof TxPendingError) {
    return "Your transaction was submitted but the network hasn't confirmed it yet. It may still go through — check the explorer link before retrying.";
  }

  const contractId = e instanceof ContractCallError ? e.contractId : undefined;
  const m = msg.match(/#(\d+)/);
  if (m) {
    const code = `#${m[1]}`;
    // A token transfer inside a contract call surfaces the SAC code, so check
    // the unambiguous token codes before falling back to the contract table.
    if (TOKEN_HINTS[code]) return TOKEN_HINTS[code];
    const hints = hintsFor(contractId);
    if (hints[code]) return hints[code];
  }
  // Stellar transaction-level result codes.
  if (/txBadAuth/i.test(msg))
    return "Signature rejected (txBadAuth). Set your wallet to Testnet, make sure its active account matches the one connected here, then disconnect & reconnect.";
  if (/txBadSeq/i.test(msg)) return "Your account sequence was out of date — please try again.";
  if (/txInsufficientFee/i.test(msg)) return "Network fee too low — please retry.";
  if (/txInsufficientBalance|txNoAccount/i.test(msg))
    return "Not enough XLM to cover the fee, or the account isn't funded on Testnet.";
  if (/User (declined|rejected)|denied|cancel/i.test(msg)) return "Signature request was declined.";
  if (/insufficient/i.test(msg)) return "Insufficient balance or liquidity.";
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg;
}

type Runner = (address: string, signTx: ReturnType<typeof useWallet>["signTx"]) => Promise<SendResult>;

export function useTx() {
  const { address, signTx } = useWallet();
  const { refresh } = useAppData();
  const toast = useToast();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  async function run(fn: Runner, label = "Transaction"): Promise<boolean> {
    if (!address) {
      setError("Connect a wallet first.");
      setStatus("error");
      toast.push({ type: "error", title: "Wallet not connected" });
      return false;
    }
    setStatus("pending");
    setError(null);
    setHash(null);
    const tid = toast.push({
      type: "pending",
      title: `${label} pending`,
      message: "Waiting for signature & confirmation…",
    });
    try {
      const res = await fn(address, signTx);
      setHash(res.hash);
      setStatus("success");
      toast.update(tid, { type: "success", title: `${label} confirmed`, message: undefined, hash: res.hash });
      refresh();
      return true;
    } catch (e) {
      const msg = humanizeError(e);
      setError(msg);
      // A transaction we never saw confirmed is not the same as a failed one —
      // reporting it as failed pushed users into double-submitting.
      if (e instanceof TxPendingError) {
        setHash(e.hash ?? null);
        setStatus("unconfirmed");
        toast.update(tid, {
          type: "pending",
          title: `${label} not yet confirmed`,
          message: msg,
          hash: e.hash,
        });
        refresh();
        return false;
      }
      setStatus("error");
      toast.update(tid, { type: "error", title: `${label} failed`, message: msg });
      return false;
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setHash(null);
  }

  return { run, status, error, hash, reset, address };
}
