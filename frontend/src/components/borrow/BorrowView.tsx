"use client";

import { useEffect, useRef, useState } from "react";
import { Droplets, HandCoins, Percent, Users } from "lucide-react";
import { useAppData } from "@/lib/data";
import { displayBorrowers } from "@/lib/contracts";
import { useWallet } from "@/lib/wallet";
import { LIQUIDATION_THRESHOLD_BPS, MIN_COLLATERAL_RATIO_BPS, SCALE } from "@/lib/config";
import { bpsToPct, formatAmount, formatUSD, fromStroops } from "@/lib/format";
import { getHistory, MarketSnapshot, recordSnapshot } from "@/lib/history";
import { liveInterest, useNow } from "@/lib/useNow";
import { StatCard } from "@/components/app/StatCard";
import { HealthBar } from "@/components/app/HealthBar";
import { Button, Card } from "@/components/ui";
import { ChartCard, EmptyChart } from "@/components/charts/ChartCard";
import { TrendChart, TrendPoint } from "@/components/charts/TrendChart";
import { EnableUsdcNotice } from "@/components/EnableUsdcNotice";
import { BorrowActions } from "./BorrowActions";

const pct = (n: number, dp = 2) => `${(n * 100).toFixed(dp)}%`;

export function BorrowView() {
  const { pool, borrower, balances, counts, loading } = useAppData();
  const { address, connect, connecting } = useWallet();
  const [history, setHistory] = useState<MarketSnapshot[]>([]);
  const [hfSeries, setHfSeries] = useState<TrendPoint[]>([]);
  const lastHf = useRef<number | null>(null);

  const util = pool ? Number(pool.utilizationScaled) / SCALE : 0;
  const price = borrower?.xlmPriceScaled ?? 0n;
  const pos = borrower?.position ?? { collateral: 0n, principal: 0n, interest: 0n, lastUpdate: 0n };
  const debt = pos.principal + pos.interest;
  const collateralValue = (pos.collateral * price) / BigInt(SCALE);
  const ratio = debt > 0n ? (collateralValue * 10_000n) / debt : null;
  const maxBorrowTotal = (collateralValue * 10_000n) / BigInt(MIN_COLLATERAL_RATIO_BPS);
  const borrowPower = maxBorrowTotal > debt ? maxBorrowTotal - debt : 0n;
  const hasLoan = debt > 0n || pos.collateral > 0n;

  // Interest keeps accruing every second — show it live (client estimate).
  const now = useNow(1000);
  const principalNum = fromStroops(pos.principal);
  const liveInt = liveInterest(principalNum, pool?.borrowApr ?? 0, Number(pos.lastUpdate), now);
  const totalInterestNum = fromStroops(pos.interest) + liveInt;
  const totalDebtNum = principalNum + totalInterestNum;

  useEffect(() => {
    const sync = () => {
      if (!pool) return;
      recordSnapshot({
        t: Date.now(),
        supplied: fromStroops(pool.totalDeposited),
        borrowed: fromStroops(pool.totalBorrowed),
        available: fromStroops(pool.availableLiquidity),
        utilization: util,
        supplyApy: pool.lenderApy,
        borrowApr: pool.borrowApr,
      });
      setHistory(getHistory());
    };
    sync();
  }, [pool, util]);

  // Record the user's health factor over the session.
  useEffect(() => {
    const track = () => {
      if (ratio === null) return;
      const hf = Number(ratio) / LIQUIDATION_THRESHOLD_BPS;
      if (lastHf.current !== null && Math.abs(hf - lastHf.current) < 0.001) return;
      lastHf.current = hf;
      setHfSeries((s) => [...s, { t: Date.now(), value: +hf.toFixed(3) }].slice(-60));
    };
    track();
  }, [ratio]);

  const borrowSeries = history.map((h) => ({ t: h.t, value: +h.borrowed.toFixed(2) }));
  const aprSeries = history.map((h) => ({ t: h.t, value: +(h.borrowApr * 100).toFixed(2) }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Borrow</h1>
        <p className="mt-1.5 text-sm text-[var(--text-dim)]">
          Lock XLM as collateral and borrow USDC. Keep your health factor above 1.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={HandCoins} label="Total Borrowed" value={pool ? formatUSD(pool.totalBorrowed) : "—"} tone="accent" loading={loading && !pool} index={0} />
        <StatCard icon={Percent} label="Borrow APR" value={pool ? pct(pool.borrowApr) : "—"} tone="warn" loading={loading && !pool} index={1} />
        <StatCard icon={Droplets} label="Available Liquidity" value={pool ? formatUSD(pool.availableLiquidity) : "—"} loading={loading && !pool} index={2} />
        <StatCard icon={Users} label="Borrowers" value={displayBorrowers(counts, pool)} sub="Unique · recent" index={3} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-[var(--text-dim)]">Wallet assets</h2>
            {address ? (
              <div className="grid grid-cols-2 gap-4">
                <Asset label="XLM" value={formatAmount(balances?.xlm ?? 0n)} />
                <Asset label="USDC" value={formatAmount(balances?.usdc ?? 0n)} />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-dim)]">Connect your wallet to view balances.</p>
            )}
          </Card>

          {hasLoan ? (
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-[var(--text-dim)]">Your loan</h2>
              <HealthBar ratioBps={ratio} />
              <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
                <Metric label="Current Debt" value={`$${totalDebtNum.toFixed(2)}`} accent />
                <Metric label="Collateral Locked" value={`${formatAmount(pos.collateral)} XLM`} sub={formatUSD(collateralValue)} />
                <Metric label="Borrow APR" value={pool ? pct(pool.borrowApr) : "—"} />
                <Metric label="Interest Accrued" value={`$${totalInterestNum.toFixed(6)}`} sub="accruing live" />
                <Metric label="Collateral Ratio" value={ratio === null ? "—" : bpsToPct(ratio)} />
                <Metric label="Borrow Power" value={formatUSD(borrowPower)} success />
              </div>
            </Card>
          ) : (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-[var(--text-dim)]">Your loan</h2>
              <p className="text-sm text-[var(--text-dim)]">
                No loan yet. Add XLM collateral, then borrow USDC against it — up to a 150% ratio.
              </p>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <ChartCard title="Total Borrowed" subtitle="Live · this session">
              <TrendChart data={borrowSeries} color="accent" valueFormat={(v) => `$${Math.round(v).toLocaleString()}`} />
            </ChartCard>
            <ChartCard title="Borrow APR" subtitle="Live · this session">
              <TrendChart data={aprSeries} color="warn" suffix="%" />
            </ChartCard>
          </div>
          <ChartCard title="Health Factor" subtitle="Your position · this session">
            {hasLoan && ratio !== null ? (
              <TrendChart data={hfSeries} color="success" valueFormat={(v) => v.toFixed(2)} emptyMessage="Your health factor will chart here as it changes." />
            ) : (
              <EmptyChart message="Open a loan to track your health factor over time." />
            )}
          </ChartCard>
        </div>

        <div className="space-y-4">
          {address ? (
            <>
              <EnableUsdcNotice />
              <BorrowActions />
            </>
          ) : (
            <Card className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
              <div>
                <p className="font-semibold">Connect to borrow</p>
                <p className="mt-1 text-sm text-[var(--text-dim)]">Connect a wallet to lock XLM and borrow USDC.</p>
              </div>
              <Button onClick={connect} loading={connecting}>Connect Wallet</Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Asset({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-[var(--bg)] px-3 py-3">
      <div className="text-xs text-[var(--text-dim)]">{label}</div>
      <div className="mt-0.5 text-base font-semibold tnum">{value}</div>
    </div>
  );
}

function Metric({ label, value, sub, accent, success }: { label: string; value: string; sub?: string; accent?: boolean; success?: boolean }) {
  const color = accent ? "text-[var(--accent)]" : success ? "text-[var(--success)]" : "text-[var(--text)]";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className={`mt-1 text-lg font-semibold tnum ${color}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--text-dim)] tnum">{sub}</div>}
    </div>
  );
}
