"use client";

import { useState } from "react";
import { poolDeposit, poolWithdraw } from "@/lib/contracts";
import { useAppData } from "@/lib/data";
import { formatAmount, formatUSD, fromStroops, toStroops } from "@/lib/format";
import { adjustCostBasis, logActivity } from "@/lib/history";
import { useTx } from "@/lib/useTx";
import { AmountInput, Button, Field } from "@/components/ui";
import { Tabs, TxFeedback } from "@/components/TxFeedback";

const TABS = ["supply", "withdraw"] as const;
type Tab = (typeof TABS)[number];

// The Dashboard's "Withdraw" quick action links here but always landed on
// the default Supply tab. Honor a `?tab=` query param on first load.
function initialTab(): Tab {
  if (typeof window === "undefined") return "supply";
  const requested = new URLSearchParams(window.location.search).get("tab");
  return requested && (TABS as readonly string[]).includes(requested) ? (requested as Tab) : "supply";
}

export function SupplyForm() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [amount, setAmount] = useState("");
  const { balances, lender, pool, refresh } = useAppData();
  const { run, status, error, hash, reset, address } = useTx();

  const shareValue = pool ? fromStroops(pool.shareValueScaled) : 1;
  const value = toStroops(amount);
  const num = Number(amount) || 0;
  const usdcBal = balances?.usdc ?? 0n;
  const shareBal = lender?.shares ?? 0n;

  const balancesStale = balances?.stale ?? false;
  const insufficient = tab === "supply" ? value > usdcBal : value > shareBal;
  // Don't claim the user has nothing when the balance read simply failed.
  const noUsdc = tab === "supply" && usdcBal === 0n && !balancesStale;
  const estUsdcOut = tab === "withdraw" ? num * shareValue : 0;
  const lowLiquidity = tab === "withdraw" && pool != null && toStroops(estUsdcOut) > pool.availableLiquidity;

  function setMax() {
    if (tab === "supply") {
      setAmount(String(fromStroops(usdcBal)));
      reset();
      return;
    }
    // Redeeming every share reverts (InsufficientLiquidity) whenever part of
    // the pool is out on loan, so cap "Max" at the shares the pool can
    // actually pay out right now.
    const liquidityCap =
      pool && shareValue > 0
        ? toStroops(fromStroops(pool.availableLiquidity) / shareValue)
        : shareBal;
    setAmount(String(fromStroops(shareBal < liquidityCap ? shareBal : liquidityCap)));
    reset();
  }

  async function submit() {
    if (value <= 0n || !address) return;
    if (tab === "supply") {
      const ok = await run((a, s) => poolDeposit(a, value, a, s), "Supply");
      if (ok) {
        adjustCostBasis(address, num);
        logActivity(address, { type: "supply", amount: num, asset: "USDC", t: Date.now() });
        setAmount("");
      }
    } else {
      const out = num * shareValue;
      const ok = await run((a, s) => poolWithdraw(a, value, a, s), "Withdraw");
      if (ok) {
        adjustCostBasis(address, -out);
        logActivity(address, { type: "withdraw", amount: out, asset: "USDC", t: Date.now() });
        setAmount("");
      }
    }
  }

  return (
    <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-card">
      <Tabs tabs={TABS} active={tab} onChange={(t) => (setTab(t), setAmount(""), reset())} />

      <Field
        label={tab === "supply" ? "Amount to supply" : "Shares to redeem"}
        hint={
          <button onClick={setMax} className="font-medium text-[var(--accent)] hover:opacity-80">
            {tab === "supply"
              ? `Balance ${formatAmount(usdcBal)} USDC`
              : `Shares ${formatAmount(shareBal)}`}{" "}
            · Max
          </button>
        }
      >
        <AmountInput
          value={amount}
          onChange={(v) => (setAmount(v), reset())}
          suffix={tab === "supply" ? "USDC" : "shares"}
        />
      </Field>

      {tab === "supply" && num > 0 && (
        <p className="mt-2 text-xs text-[var(--text-dim)]">
          You&apos;ll receive ≈ {formatAmount(toStroops(num / shareValue))} pool shares.
        </p>
      )}
      {tab === "withdraw" && num > 0 && (
        <p className="mt-2 text-xs text-[var(--text-dim)]">
          ≈ {formatUSD(toStroops(estUsdcOut))} out at {shareValue.toFixed(4)} USDC/share.
        </p>
      )}
      {noUsdc && (
        <p className="mt-2 text-xs text-[var(--text-dim)]">
          You have no USDC yet — grab some from the faucet above, or borrow against XLM.
        </p>
      )}
      {balancesStale && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          Couldn&apos;t read your balances just now — the figures above may be out of date.{" "}
          <button onClick={refresh} className="font-medium underline hover:no-underline">
            Retry
          </button>
        </p>
      )}
      {/* A failed balance read defaults to 0, which used to be shown as a
          genuine "you only have $0" right alongside the staleness warning —
          telling the user two contradictory things at once. Say nothing more
          specific than "unknown" until the read actually succeeds. */}
      {!noUsdc && !(tab === "supply" && balancesStale) && insufficient && num > 0 && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          {tab === "supply"
            ? `You only have ${formatAmount(usdcBal)} USDC.`
            : `You only have ${formatAmount(shareBal)} shares.`}
        </p>
      )}
      {lowLiquidity && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          Only {formatUSD(pool!.availableLiquidity)} is liquid right now — this withdrawal would
          revert. Use Max, or wait for borrowers to repay.
        </p>
      )}

      <Button
        onClick={submit}
        loading={status === "pending"}
        disabled={num <= 0 || insufficient || lowLiquidity}
        className="mt-4 w-full"
      >
        {tab === "supply" ? "Supply USDC" : "Withdraw"}
      </Button>

      <TxFeedback status={status} error={error} hash={hash} />
    </div>
  );
}
