"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyChart } from "./ChartCard";

export interface TrendPoint {
  t: number;
  value: number;
}

const COLORS = {
  accent: "#6366f1",
  success: "#34d399",
  warn: "#fbbf24",
};

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Session-recorded time series. Honest: draws live as snapshots accumulate. */
export function TrendChart({
  data,
  color = "accent",
  suffix = "",
  height = 220,
  emptyMessage = "Live data is collecting — the trend appears as the market updates this session.",
  valueFormat = (v: number) => `${v}${suffix}`,
}: {
  data: TrendPoint[];
  color?: keyof typeof COLORS;
  suffix?: string;
  height?: number;
  emptyMessage?: string;
  valueFormat?: (v: number) => string;
}) {
  if (data.length < 1) return <EmptyChart message={emptyMessage} />;
  const stroke = COLORS[color];
  // Begin at a zero origin so the line climbs from 0 into a mountain shape.
  const series = [{ t: data[0].t - 60_000, value: 0 }, ...data];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
        <defs>
          <linearGradient id={`trend-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="t"
          tickFormatter={fmtTime}
          tick={{ fontSize: 11, fill: "var(--text-dim)" }}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tickFormatter={(v) => valueFormat(v)}
          tick={{ fontSize: 11, fill: "var(--text-dim)" }}
          axisLine={false}
          tickLine={false}
          width={52}
          domain={[0, "auto"]}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
            boxShadow: "var(--shadow)",
            fontSize: 12,
          }}
          labelFormatter={(t) => fmtTime(Number(t))}
          formatter={(v) => [valueFormat(Number(v)), ""]}
        />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} fill={`url(#trend-${color})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
