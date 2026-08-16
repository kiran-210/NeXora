"use client";

import { useState } from "react";
import { Coins, Droplet, Link2, Wrench } from "lucide-react";
import { enableUsdcTrustline } from "@/lib/contracts";
import { useNetwork } from "@/lib/network";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/lib/toast";
import { useTx } from "@/lib/useTx";
import { useAppData } from "@/lib/data";

export function DeveloperTools() {
  const { isTestnet } = useNetwork();
  const { address } = useWallet();
  const { refresh } = useAppData();
  const toast = useToast();
  const { run, status } = useTx();
  const [busy, setBusy] = useState<string | null>(null);

  if (!isTestnet) return null;

  async function friendbot() {
    if (!address) return;
    setBusy("xlm");
    const tid = toast.push({ type: "pending", title: "Requesting testnet XLM" });
    try {
      const res = await fetch(`https://friendbot.stellar.org/?addr=${address}`);
      if (res.ok) {
        toast.update(tid, { type: "success", title: "Testnet XLM funded" });
        refresh();
      } else {
        toast.update(tid, { type: "error", title: "Friendbot", message: "Account may already be funded." });
      }
    } catch {
      toast.update(tid, { type: "error", title: "Friendbot request failed" });
    } finally {
      setBusy(null);
    }
  }

  async function faucet() {
    if (!address) return;
    setBusy("usdc");
    const tid = toast.push({ type: "pending", title: "Requesting testnet USDC" });
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.update(tid, { type: "success", title: `Sent ${data.amount} test USDC` });
        refresh();
      } else {
        toast.update(tid, {
          type: "error",
          title: "Faucet",
          message: data.error === "no_trustline" ? "Add the USDC trustline first." : data.error,
        });
      }
    } catch {
      toast.update(tid, { type: "error", title: "Faucet request failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-[var(--accent)]/40 bg-[var(--accent-soft)]/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-white">
          <Wrench className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Developer Tools</h2>
          <p className="text-xs text-[var(--text-dim)]">Testnet only — grab free funds to get started</p>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <ToolButton icon={Droplet} label="Get Testnet XLM" onClick={friendbot} loading={busy === "xlm"} disabled={!address} />
        <ToolButton icon={Coins} label="Get Testnet USDC" onClick={faucet} loading={busy === "usdc"} disabled={!address} />
        <ToolButton
          icon={Link2}
          label="Add USDC Trustline"
          onClick={() => run((k, s) => enableUsdcTrustline(k, s), "Add trustline")}
          loading={status === "pending"}
          disabled={!address || status === "pending"}
        />
      </div>

      {!address && (
        <p className="mt-3 text-xs text-[var(--text-dim)]">Connect a wallet to request test funds.</p>
      )}
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  loading,
  disabled,
}: {
  icon: typeof Coins;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center justify-center gap-2 rounded-xl border bg-[var(--card)] px-3 py-2.5 text-sm font-medium shadow-card transition-colors hover:bg-[var(--card-hover)] disabled:opacity-50"
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      ) : (
        <Icon className="h-4 w-4 text-[var(--accent)]" />
      )}
      {label}
    </button>
  );
}
