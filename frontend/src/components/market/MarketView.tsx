"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Gauge,
  HandCoins,
  Layers,
  Percent,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useAppData } from "@/lib/data";
import { displayBorrowers, displaySuppliers } from "@/lib/contracts";
import { SCALE } from "@/lib/config";
import { formatUSD, fromStroops } from "@/lib/format";
import { getHistory, MarketSnapshot, recordSnapshot } from "@/lib/history";
import { StatCard } from "@/components/app/StatCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { RateHistoryChart } from "@/components/charts/RateHistoryChart";
import { CompositionDonut } from "@/components/charts/CompositionDonut";
import { TrendChart } from "@/components/charts/TrendChart";

const pct = (n: number, dp = 2) => `${(n * 100).toFixed(dp)}%`;

export function MarketView() {
  const { pool, counts, loading, refresh } = useAppData();
  const [history, setHistory] = useState<MarketSnapshot[]>([]);

  const util = pool ? Number(pool.utilizationScaled) / SCALE : 0;

  // Record a live snapshot whenever pool data changes; poll every 30s.
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

  useEffect(() => {
    const id = setInterval(() => refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const utilSeries = history.map((h) => ({ t: h.t, value: +(h.utilization * 100).toFixed(2) }));
  const suppliedSeries = history.map((h) => ({ t: h.t, value: +h.supplied.toFixed(2) }));
  const borrowedSeries = history.map((h) => ({ t: h.t, value: +h.borrowed.toFixed(2) }));

  return (
    <div className="space-y-8">
      {/* Header + quick actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Market overview</h1>
          <p className="mt-1.5 text-sm text-[var(--text-dim)]">
            Protocol-wide statistics and the live interest-rate model.
          </p>
        </div>
        <div className="flex gap-2.5">
          <Link
            href="/app/supply"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-blue)] transition-colors hover:bg-[var(--accent-strong)]"
          >
            Supply <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            href="/app/borrow"
            className="inline-flex items-center gap-1.5 rounded-xl border bg-[var(--card)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] shadow-card transition-colors hover:bg-[var(--card-hover)]"
          >
            Borrow <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Pool Balance" value={pool ? formatUSD(pool.availableLiquidity) : "—"} sub="Idle, withdrawable" loading={loading && !pool} index={0} />
        <StatCard icon={Layers} label="Total Supplied" value={pool ? formatUSD(pool.totalDeposited) : "—"} tone="accent" loading={loading && !pool} index={1} />
        <StatCard icon={HandCoins} label="Total Borrowed" value={pool ? formatUSD(pool.totalBorrowed) : "—"} loading={loading && !pool} index={2} />
        <StatCard icon={Gauge} label="Utilization" value={pool ? pct(util, 1) : "—"} tone="warn" loading={loading && !pool} index={3} />
        <StatCard icon={TrendingUp} label="Supply APY" value={pool ? pct(pool.lenderApy) : "—"} tone="success" loading={loading && !pool} index={4} />
        <StatCard icon={Percent} label="Borrow APR" value={pool ? pct(pool.borrowApr) : "—"} tone="accent" loading={loading && !pool} index={5} />
        <StatCard icon={Users} label="Total Suppliers" value={displaySuppliers(counts, pool)} sub="Unique · recent" index={6} />
        <StatCard icon={Users} label="Total Borrowers" value={displayBorrowers(counts, pool)} sub="Unique · recent" index={7} />
      </div>

      {/* Interest model + composition */}
      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Interest Rates"
          subtitle="Supply APY & Borrow APR over time — pick a range"
          right={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
              <Activity className="h-3.5 w-3.5" /> Live
            </span>
          }
        >
          <RateHistoryChart history={history} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <MiniStat label="Utilization" value={pool ? pct(util, 1) : "—"} tone="warn" />
            <MiniStat label="Supply APY" value={pool ? pct(pool.lenderApy) : "—"} tone="success" />
            <MiniStat label="Borrow APR" value={pool ? pct(pool.borrowApr) : "—"} tone="accent" />
          </div>
        </ChartCard>

        <ChartCard title="Supply vs Borrow" subtitle="Current pool composition">
          <div className="flex h-[240px] items-center justify-center">
            {pool ? (
              <CompositionDonut borrowed={pool.totalBorrowed} available={pool.availableLiquidity} />
            ) : null}
          </div>
        </ChartCard>
      </div>

      {/* Live trend charts */}
      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard title="Utilization" subtitle="Live · this session">
          <TrendChart data={utilSeries} color="warn" suffix="%" />
        </ChartCard>
        <ChartCard title="Total Supplied" subtitle="Live · this session">
          <TrendChart data={suppliedSeries} color="success" valueFormat={(v) => `$${Math.round(v).toLocaleString()}`} />
        </ChartCard>
        <ChartCard title="Total Borrowed" subtitle="Live · this session">
          <TrendChart data={borrowedSeries} color="accent" valueFormat={(v) => `$${Math.round(v).toLocaleString()}`} />
        </ChartCard>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "accent" | "success" | "warn" }) {
  const color = tone === "accent" ? "text-[var(--accent)]" : tone === "success" ? "text-[var(--success)]" : "text-[var(--warn)]";
  return (
    <div className="rounded-xl border bg-[var(--bg)] px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tnum ${color}`}>{value}</div>
    </div>
  );
}
