"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = { success: "#34d399", warn: "#fbbf24", accent: "#6366f1" };

/**
 * Projects a value over 12 months at a simple (non-compounding) rate — matching
 * the protocol's simple-interest model. A forward projection, not history.
 */
export function ProjectionChart({
  principal,
  rate,
  color = "success",
  label = "Projected value",
}: {
  principal: number;
  rate: number;
  color?: keyof typeof COLORS;
  label?: string;
}) {
  const stroke = COLORS[color];
  const data = Array.from({ length: 13 }, (_, m) => ({
    month: m,
    value: +(principal * (1 + rate * (m / 12))).toFixed(2),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -6 }}>
        <defs>
          <linearGradient id={`proj-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" tickFormatter={(m) => (m === 0 ? "Now" : `${m}m`)} tick={{ fontSize: 11, fill: "var(--text-dim)" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => `$${Number(v).toLocaleString()}`} tick={{ fontSize: 11, fill: "var(--text-dim)" }} axisLine={false} tickLine={false} width={64} domain={[0, "auto"]} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", boxShadow: "var(--shadow)", fontSize: 12 }}
          labelFormatter={(m) => (Number(m) === 0 ? "Today" : `In ${m} months`)}
          formatter={(v) => [`$${Number(v).toLocaleString()}`, label]}
        />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} fill={`url(#proj-${color})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
