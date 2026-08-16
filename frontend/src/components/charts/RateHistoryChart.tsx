"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MarketSnapshot } from "@/lib/history";
import { EmptyChart } from "./ChartCard";

const BLUE = "#6366f1";
const GREEN = "#34d399";

const WINDOWS: { key: string; ms: number }[] = [
  { key: "1H", ms: 3_600_000 },
  { key: "1D", ms: 86_400_000 },
  { key: "1W", ms: 604_800_000 },
  { key: "1M", ms: 2_592_000_000 },
  { key: "All", ms: Infinity },
];

function fmtTime(t: number, span: number) {
  const d = new Date(t);
  // Show date for longer spans, time for short ones.
  return span > 86_400_000
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

interface TipProps {
  active?: boolean;
  label?: number | string;
  payload?: { dataKey?: string | number; value?: number }[];
}
function TipBox({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  const supply = payload.find((p) => p.dataKey === "supply")?.value;
  const borrow = payload.find((p) => p.dataKey === "borrow")?.value;
  return (
    <div className="rounded-xl border bg-[var(--card)] px-3 py-2 text-xs shadow-card-lg">
      <div className="mb-1 font-medium text-[var(--text)]">
        {new Date(Number(label)).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="flex items-center gap-1.5 text-[var(--success)]">
        <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} /> Supply APY {supply}%
      </div>
      <div className="flex items-center gap-1.5 text-[var(--accent)]">
        <span className="h-2 w-2 rounded-full" style={{ background: BLUE }} /> Borrow APR {borrow}%
      </div>
    </div>
  );
}

export function RateHistoryChart({ history }: { history: MarketSnapshot[] }) {
  const [win, setWin] = useState("1D");
  const window = WINDOWS.find((w) => w.key === win)!;

  // Anchor the window to the most recent recorded point (pure — no Date.now()).
  const latest = history.length ? history[history.length - 1].t : 0;
  const cutoff = latest - window.ms;
  const data = history
    .filter((h) => h.t >= cutoff)
    .map((h) => ({
      t: h.t,
      supply: +(h.supplyApy * 100).toFixed(3),
      borrow: +(h.borrowApr * 100).toFixed(3),
    }));

  const span = data.length ? data[data.length - 1].t - data[0].t : 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--success)]">
            <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} /> Supply APY
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--accent)]">
            <span className="h-2 w-2 rounded-full" style={{ background: BLUE }} /> Borrow APR
          </span>
        </div>
        <div className="flex gap-1 rounded-lg border bg-[var(--bg)] p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWin(w.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                win === w.key ? "bg-[var(--card)] text-[var(--accent)] shadow-card" : "text-[var(--text-dim)] hover:text-[var(--text)]"
              }`}
            >
              {w.key}
            </button>
          ))}
        </div>
      </div>

      {data.length < 1 ? (
        <EmptyChart message="Rates are recorded live while the app is open. As the market moves — or as you supply and borrow — this chart fills in. Keep the tab open to build 1D / 1W history." />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={[{ t: data[0].t - 60_000, supply: 0, borrow: 0 }, ...data]} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
            <defs>
              <linearGradient id="rhSupply" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity={0.18} />
                <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rhBorrow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BLUE} stopOpacity={0.18} />
                <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t) => fmtTime(t, span)}
              tick={{ fontSize: 11, fill: "var(--text-dim)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={44}
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: "var(--text-dim)" }}
              axisLine={false}
              tickLine={false}
              width={48}
              domain={[0, "auto"]}
              allowDecimals
            />
            <Tooltip content={<TipBox />} />
            <Legend wrapperStyle={{ display: "none" }} />
            <Area type="monotone" dataKey="borrow" stroke={BLUE} strokeWidth={2.5} fill="url(#rhBorrow)" />
            <Area type="monotone" dataKey="supply" stroke={GREEN} strokeWidth={2.5} fill="url(#rhSupply)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
