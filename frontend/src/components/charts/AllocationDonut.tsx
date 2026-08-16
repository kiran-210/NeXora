"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export interface Segment {
  name: string;
  value: number;
  color: string;
}

export function AllocationDonut({ segments, centerLabel }: { segments: Segment[]; centerLabel?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const data = total > 0 ? segments.filter((s) => s.value > 0) : [{ name: "Empty", value: 1, color: "#303a54" }];

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[160px] w-[160px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={54} outerRadius={76} startAngle={90} endAngle={-270} stroke="none" paddingAngle={total > 0 ? 2 : 0}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xs text-[var(--text-dim)]">{centerLabel ?? "Total"}</div>
            <div className="text-lg font-semibold tnum">${Math.round(total).toLocaleString()}</div>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {segments.map((s) => (
          <div key={s.name} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <div>
              <div className="text-xs text-[var(--text-dim)]">{s.name}</div>
              <div className="text-sm font-semibold tnum">${s.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
