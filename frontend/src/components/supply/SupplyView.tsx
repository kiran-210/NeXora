"use client";

import { useEffect, useState } from "react";
import { Layers, TrendingUp, Users, Wallet } from "lucide-react";
import { useAppData } from "@/lib/data";
import { displaySuppliers } from "@/lib/contracts";
import { useWallet } from "@/lib/wallet";
import { SCALE } from "@/lib/config";
import { formatAmount, formatUSD, fromStroops } from "@/lib/format";
import { getCostBasis, getHistory, MarketSnapshot, recordSnapshot } from "@/lib/history";
import { StatCard } from "@/components/app/StatCard";
import { Button, Card } from "@/components/ui";
import { ChartCard, EmptyChart } from "@/components/charts/ChartCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { ProjectionChart } from "@/components/charts/ProjectionChart";
import { EnableUsdcNotice } from "@/components/EnableUsdcNotice";
import { SupplyForm } from "./SupplyForm";

const pct = (n: number, dp = 2) => `${(n * 100).toFixed(dp)}%`;

export function SupplyView() {
  const { pool, lender, balances, counts, loading } = useAppData();
  const { address, connect, connecting } = useWallet();
  const [history, setHistory] = useState<MarketSnapshot[]>([]);

  const util = pool ? Number(pool.utilizationScaled) / SCALE : 0;

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

  const currentDeposit = lender ? fromStroops(lender.valueScaled) : 0;
  const hasPosition = lender != null && lender.shares > 0n;
  const costBasis = address ? getCostBasis(address) : 0;
  const interestEarned = costBasis > 0 ? Math.max(0, currentDeposit - costBasis) : null;
  const estAnnual = pool ? currentDeposit * pool.lenderApy : 0;

  const supplySeries = history.map((h) => ({ t: h.t, value: +h.supplied.toFixed(2) }));
  const apySeries = history.map((h) => ({ t: h.t, value: +(h.supplyApy * 100).toFixed(2) }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Supply</h1>
        <p className="mt-1.5 text-sm text-[var(--text-dim)]">
          Deposit USDC to earn interest. Your shares appreciate as borrowers repay.
        </p>
      </div>

      {/* Market stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Pool Balance" value={pool ? formatUSD(pool.availableLiquidity) : "—"} sub="Idle, withdrawable" loading={loading && !pool} index={0} />
        <StatCard icon={TrendingUp} label="Supply APY" value={pool ? pct(pool.lenderApy) : "—"} tone="success" loading={loading && !pool} index={1} />
        <StatCard icon={Layers} label="Total Supplied" value={pool ? formatUSD(pool.totalDeposited) : "—"} tone="accent" loading={loading && !pool} index={2} />
        <StatCard icon={Users} label="Total Suppliers" value={displaySuppliers(counts, pool)} sub="Unique · recent" index={3} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* left */}
        <div className="space-y-6">
          {/* Wallet assets */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-[var(--text-dim)]">Wallet assets</h2>
            {address ? (
              <div className="grid grid-cols-3 gap-4">
                <Asset label="USDC" value={formatAmount(balances?.usdc ?? 0n)} />
                <Asset label="XLM" value={formatAmount(balances?.xlm ?? 0n)} />
                <Asset label="Pool Shares" value={formatAmount(lender?.shares ?? 0n)} />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-dim)]">Connect your wallet to view balances.</p>
            )}
          </Card>

          {/* Supply position */}
          {hasPosition && (
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-[var(--text-dim)]">Your supply position</h2>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                <Metric label="Current Deposit" value={formatUSD(lender!.valueScaled)} accent />
                <Metric label="Pool Shares" value={formatAmount(lender!.shares)} />
                <Metric label="Estimated APY" value={pool ? pct(pool.lenderApy) : "—"} success />
                <Metric label="Interest Earned" value={interestEarned == null ? "—" : formatUSD(interestEarned, 4)} success />
                <Metric label="Est. Annual Earnings" value={formatUSD(estAnnual, 2)} />
              </div>
              {interestEarned == null && (
                <p className="mt-3 text-xs text-[var(--text-dim)]">
                  Interest earned is tracked from deposits made in this app.
                </p>
              )}
            </Card>
          )}

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <ChartCard title="Total Supply" subtitle="Live · this session">
              <TrendChart data={supplySeries} color="accent" valueFormat={(v) => `$${Math.round(v).toLocaleString()}`} />
            </ChartCard>
            <ChartCard title="Supply APY" subtitle="Live · this session">
              <TrendChart data={apySeries} color="success" suffix="%" />
            </ChartCard>
          </div>
          <ChartCard title="Personal Interest Growth" subtitle="Projected at the current APY (12 months)">
            {hasPosition && currentDeposit > 0 ? (
              <ProjectionChart principal={currentDeposit} rate={pool?.lenderApy ?? 0} label="Projected value" />
            ) : (
              <EmptyChart message="Supply USDC to see your projected earnings over the next year." />
            )}
          </ChartCard>
        </div>

        {/* right — actions */}
        <div className="space-y-4">
          {address ? (
            <>
              <EnableUsdcNotice />
              <SupplyForm />
            </>
          ) : (
            <Card className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
              <div>
                <p className="font-semibold">Connect to supply</p>
                <p className="mt-1 text-sm text-[var(--text-dim)]">
                  Connect a wallet to deposit USDC and earn.
                </p>
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

function Metric({ label, value, accent, success }: { label: string; value: string; accent?: boolean; success?: boolean }) {
  const color = accent ? "text-[var(--accent)]" : success ? "text-[var(--success)]" : "text-[var(--text)]";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className={`mt-1 text-lg font-semibold tnum ${color}`}>{value}</div>
    </div>
  );
}
