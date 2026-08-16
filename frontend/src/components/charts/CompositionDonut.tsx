"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatUSD } from "@/lib/format";

const BLUE = "#6366f1";
const SLATE = "#3a4560";

export function CompositionDonut({
  borrowed,
  available,
}: {
  borrowed: bigint;
  available: bigint;
}) {
  const b = Number(borrowed);
  const a = Number(available);
  const total = b + a;
  const data =
    total > 0
      ? [
          { name: "Borrowed", value: b, color: BLUE },
          { name: "Available", value: a, color: SLATE },
        ]
      : [{ name: "Empty", value: 1, color: SLATE }];

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={52}
              outerRadius={72}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              paddingAngle={total > 0 ? 2 : 0}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xs text-[var(--text-dim)]">Utilized</div>
            <div className="text-lg font-semibold tnum">
              {total > 0 ? `${((b / total) * 100).toFixed(1)}%` : "0%"}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Legend color={BLUE} label="Borrowed" value={formatUSD(borrowed)} />
        <Legend color={SLATE} label="Available" value={formatUSD(available)} />
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <div>
        <div className="text-xs text-[var(--text-dim)]">{label}</div>
        <div className="text-sm font-semibold tnum">{value}</div>
      </div>
    </div>
  );
}
