"use client";

import { useState } from "react";
import { cmBorrow, cmDepositCollateral, cmRepay, cmWithdrawCollateral } from "@/lib/contracts";
import { useAppData } from "@/lib/data";
import { LIQUIDATION_THRESHOLD_BPS, MIN_COLLATERAL_RATIO_BPS, SCALE } from "@/lib/config";
import { bpsToPct, formatAmount, formatUSD, fromStroops, toStroops } from "@/lib/format";
import { addInterestPaid, logActivity } from "@/lib/history";
import { useTx } from "@/lib/useTx";
import { liveInterest, useNow } from "@/lib/useNow";
import { AmountInput, Button, Field, Pill } from "@/components/ui";
import { Tabs, TxFeedback } from "@/components/TxFeedback";

const TABS = ["borrow", "repay", "collateral", "withdraw"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = {
  borrow: "Borrow USDC",
  repay: "Repay USDC",
  collateral: "Add XLM collateral",
  withdraw: "Withdraw XLM collateral",
};

function ratioBps(collateral: bigint, price: bigint, debt: bigint): bigint | null {
  if (debt <= 0n) return null;
  return ((collateral * price) / BigInt(SCALE)) * 10_000n / debt;
}
function tone(bps: bigint | null): "good" | "warn" | "bad" {
  if (bps === null) return "good";
  const v = Number(bps);
  if (v < LIQUIDATION_THRESHOLD_BPS) return "bad";
  if (v < MIN_COLLATERAL_RATIO_BPS) return "warn";
  return "good";
}

// The Dashboard's "Repay" quick action links here but always landed on the
// default Borrow tab, leaving the user to notice and re-click Repay
// themselves. Honor a `?tab=` query param on first load.
function initialTab(): Tab {
  if (typeof window === "undefined") return "borrow";
  const requested = new URLSearchParams(window.location.search).get("tab");
  return requested && (TABS as readonly string[]).includes(requested) ? (requested as Tab) : "borrow";
}

export function BorrowActions() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [amount, setAmount] = useState("");
  const { borrower, balances, pool, refresh } = useAppData();
  const { run, status, error, hash, reset, address } = useTx();

  const price = borrower?.xlmPriceScaled ?? 0n;
  const rawPos = borrower?.position ?? { collateral: 0n, principal: 0n, interest: 0n, lastUpdate: 0n };
  // `get_position` only reports interest as of the contract's last write, so
  // it under-counts real debt the longer a loan sits untouched — BorrowView
  // already accrues this live for display via `useNow`/`liveInterest`, but
  // this form (the one that actually submits transactions) didn't, so its
  // Max/ratio/required-collateral figures could look safer than what the
  // transaction would actually see.
  const now = useNow(1000);
  const liveInt = liveInterest(fromStroops(rawPos.principal), pool?.borrowApr ?? 0, Number(rawPos.lastUpdate), now);
  const pos = { ...rawPos, interest: rawPos.interest + toStroops(liveInt) };
  const debt = pos.principal + pos.interest;
  const value = toStroops(amount);
  const num = Number(amount) || 0;

  // Projected state
  let projCollateral = pos.collateral;
  let projDebt = debt;
  if (tab === "collateral") projCollateral += value;
  if (tab === "withdraw") projCollateral -= value;
  if (tab === "borrow") projDebt += value;
  if (tab === "repay") projDebt = projDebt > value ? projDebt - value : 0n;
  const projRatio = ratioBps(projCollateral, price, projDebt);

  // Borrow tab: required collateral for total debt
  const requiredCollateral =
    price > 0n && projDebt > 0n
      ? (projDebt * BigInt(MIN_COLLATERAL_RATIO_BPS) * BigInt(SCALE) + 10_000n * price - 1n) / (10_000n * price)
      : 0n;
  const shortfall = requiredCollateral > pos.collateral ? requiredCollateral - pos.collateral : 0n;

  // Collateral tab: max borrowable with projected collateral
  const projCollateralValue = (projCollateral * price) / BigInt(SCALE);
  const maxBorrowTotal = (projCollateralValue * 10_000n) / BigInt(MIN_COLLATERAL_RATIO_BPS);
  const collateralHeadroom = maxBorrowTotal > debt ? maxBorrowTotal - debt : 0n;
  // Collateral is only half the constraint: the pool also has to hold enough
  // idle USDC to release. Offering the full collateral-based figure sent
  // borrowers into a revert whenever utilization was high.
  const liquidity = pool?.availableLiquidity ?? collateralHeadroom;
  const borrowable = collateralHeadroom < liquidity ? collateralHeadroom : liquidity;
  const liquidityCapped = tab === "borrow" && liquidity < collateralHeadroom;
  const overLiquidity = tab === "borrow" && pool != null && value > pool.availableLiquidity;

  const isXlm = tab === "collateral" || tab === "withdraw";
  const willBreak = (tab === "borrow" || tab === "withdraw") && projRatio !== null && Number(projRatio) < MIN_COLLATERAL_RATIO_BPS;
  // A failed balance read defaults to 0 (see lib/contracts.ts `safeBalance`)
  // — unlike SupplyForm, nothing here distinguished that from a genuine zero
  // balance, so a transient RPC hiccup silently showed "You only have 0.00
  // XLM/USDC" and blocked Add Collateral / Repay with no explanation.
  const balancesStale = balances?.stale ?? false;
  const insufficientFunds =
    (tab === "collateral" && !balancesStale && value > (balances?.xlm ?? 0n)) ||
    (tab === "repay" && !balancesStale && value > (balances?.usdc ?? 0n)) ||
    (tab === "withdraw" && value > pos.collateral);
  // Repay's Max used to fill in a tiny nonzero amount even at zero debt (see
  // below), and nothing stopped submit either — the transaction then reverted
  // on-chain with "There's no debt to repay" instead of guiding the user to
  // Withdraw Collateral, which is what they actually want at that point.
  const noDebt = tab === "repay" && debt <= 0n;

  function max() {
    if (tab === "collateral") setAmount(String(Math.max(0, fromStroops(balances?.xlm ?? 0n) - 5)));
    if (tab === "repay" && !noDebt) {
      // Interest keeps accruing between this read and the moment the ledger
      // applies the transaction, so paying exactly `debt` always left a few
      // stroops of dust behind and the position never closed. `repay` clamps
      // to what is actually owed, so a small overshoot is safe.
      const target = debt + debt / 1000n + 1n;
      const usdcBal = balances?.usdc ?? 0n;
      setAmount(String(fromStroops(target < usdcBal ? target : usdcBal)));
    }
    if (tab === "withdraw") setAmount(String(fromStroops(pos.collateral)));
    if (tab === "borrow") setAmount(String(fromStroops(borrowable)));
    reset();
  }

  async function submit() {
    if (value <= 0n || !address) return;
    let ok = false;
    if (tab === "borrow") ok = await run((a, s) => cmBorrow(a, value, a, s), "Borrow");
    else if (tab === "repay") {
      const interestPortion = Math.min(num, fromStroops(pos.interest));
      ok = await run((a, s) => cmRepay(a, value, a, s), "Repay");
      if (ok) addInterestPaid(address, interestPortion);
    } else if (tab === "collateral") ok = await run((a, s) => cmDepositCollateral(a, value, a, s), "Add collateral");
    else ok = await run((a, s) => cmWithdrawCollateral(a, value, a, s), "Withdraw collateral");

    if (ok) {
      const map: Record<Tab, Parameters<typeof logActivity>[1]["type"]> = {
        borrow: "borrow",
        repay: "repay",
        collateral: "add-collateral",
        withdraw: "withdraw-collateral",
      };
      // Runs inside an event handler (submit, invoked only from onClick), never during render.
      // eslint-disable-next-line react-hooks/purity
      const t = Date.now();
      logActivity(address, { type: map[tab], amount: num, asset: isXlm ? "XLM" : "USDC", t });
      setAmount("");
    }
  }

  return (
    <div className="rounded-2xl border bg-[var(--card)] p-5 shadow-card">
      <Tabs tabs={TABS} active={tab} onChange={(t) => (setTab(t), setAmount(""), reset())} />

      <Field
        label={LABELS[tab]}
        hint={
          <button onClick={max} className="font-medium text-[var(--accent)] hover:opacity-80">
            {tab === "collateral" && `Balance ${formatAmount(balances?.xlm ?? 0n)} XLM · Max`}
            {tab === "borrow" && `Up to ${formatAmount(borrowable)} USDC · Max`}
            {tab === "repay" && `Owed ${formatAmount(debt)} USDC · Max`}
            {tab === "withdraw" && `Locked ${formatAmount(pos.collateral)} XLM · Max`}
          </button>
        }
      >
        <AmountInput value={amount} onChange={(v) => (setAmount(v), reset())} suffix={isXlm ? "XLM" : "USDC"} />
      </Field>

      {/* Borrow: required collateral */}
      {tab === "borrow" && value > 0n && price > 0n && (
        <div className="mt-3 rounded-xl border bg-[var(--bg)] p-3 text-sm">
          <Row label="Collateral required (150%)" value={`${formatAmount(requiredCollateral)} XLM`} strong />
          <Row label="You have locked" value={`${formatAmount(pos.collateral)} XLM`} />
          {shortfall > 0n && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[var(--warn-soft)] px-2.5 py-2">
              <span className="text-xs text-[var(--warn)]">Add {formatAmount(shortfall)} XLM first.</span>
              <button
                onClick={() => { setTab("collateral"); setAmount(String(fromStroops(shortfall))); reset(); }}
                className="shrink-0 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--accent-strong)]"
              >
                Add collateral
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collateral: max borrowable */}
      {tab === "collateral" && value > 0n && price > 0n && (
        <div className="mt-3 rounded-xl border bg-[var(--bg)] p-3 text-sm">
          <Row label="Collateral value" value={formatUSD(projCollateralValue)} />
          <Row label="Max borrowable (after)" value={formatUSD(borrowable)} strong accent />
        </div>
      )}

      {/* Health preview */}
      <div className="mt-3 flex items-center justify-between rounded-xl border bg-[var(--bg)] px-3 py-2.5">
        <span className="text-xs text-[var(--text-dim)]">Projected health</span>
        <Pill tone={tone(projRatio)}>
          {projRatio === null ? "No debt" : bpsToPct(projRatio)}
          <span className="text-[var(--text-dim)]">· min {MIN_COLLATERAL_RATIO_BPS / 100}%</span>
        </Pill>
      </div>

      {noDebt && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[var(--accent-soft)] px-2.5 py-2">
          <span className="text-xs text-[var(--text-dim)]">Nothing owed — there&apos;s no debt to repay.</span>
          <button
            onClick={() => { setTab("withdraw"); setAmount(""); reset(); }}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--accent-strong)]"
          >
            Withdraw collateral
          </button>
        </div>
      )}
      {willBreak && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          This would drop below the {MIN_COLLATERAL_RATIO_BPS / 100}% minimum and be rejected.
        </p>
      )}
      {overLiquidity && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          The pool only has {formatUSD(pool!.availableLiquidity)} available to lend right now — this
          borrow would revert.
        </p>
      )}
      {liquidityCapped && !overLiquidity && value <= 0n && (
        <p className="mt-2 text-xs text-[var(--text-dim)]">
          Your collateral supports more, but the pool currently has{" "}
          {formatUSD(pool!.availableLiquidity)} available to lend.
        </p>
      )}
      {(tab === "collateral" || tab === "repay") && balancesStale && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          Couldn&apos;t read your wallet balance just now — the figure above may be out of date.{" "}
          <button onClick={refresh} className="font-medium underline hover:no-underline">
            Retry
          </button>
        </p>
      )}
      {insufficientFunds && value > 0n && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          {tab === "collateral" && `You only have ${formatAmount(balances?.xlm ?? 0n)} XLM.`}
          {tab === "repay" && `You only have ${formatAmount(balances?.usdc ?? 0n)} USDC.`}
          {tab === "withdraw" && `You only have ${formatAmount(pos.collateral)} XLM locked.`}
        </p>
      )}

      <Button onClick={submit} loading={status === "pending"} disabled={value <= 0n || willBreak || insufficientFunds || overLiquidity || noDebt} className="mt-4 w-full">
        {LABELS[tab]}
      </Button>
      <TxFeedback status={status} error={error} hash={hash} />
    </div>
  );
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span className={`tnum ${strong ? "font-semibold" : ""} ${accent ? "text-[var(--accent)]" : ""}`}>{value}</span>
    </div>
  );
}
