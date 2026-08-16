"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  HandCoins,
  Lock,
  Unlock,
  Zap,
} from "lucide-react";
import { Activity, ActivityType } from "@/lib/history";
import { formatAmount, toStroops } from "@/lib/format";

const META: Record<ActivityType, { icon: typeof Coins; label: string; tone: string }> = {
  supply: { icon: ArrowUpRight, label: "Supplied", tone: "var(--accent)" },
  withdraw: { icon: ArrowDownLeft, label: "Withdrew", tone: "var(--text-dim)" },
  borrow: { icon: HandCoins, label: "Borrowed", tone: "var(--warn)" },
  repay: { icon: Coins, label: "Repaid", tone: "var(--success)" },
  "add-collateral": { icon: Lock, label: "Added collateral", tone: "var(--accent)" },
  "withdraw-collateral": { icon: Unlock, label: "Withdrew collateral", tone: "var(--text-dim)" },
  liquidate: { icon: Zap, label: "Liquidated", tone: "var(--danger)" },
};

function ago(t: number) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ActivityTimeline({ items }: { items: Activity[] }) {
  if (!items.length) {
    return (
      <div className="grid h-[180px] place-items-center rounded-xl border border-dashed border-[var(--border-strong)] text-center">
        <p className="max-w-xs px-6 text-sm text-[var(--text-dim)]">
          Your activity will appear here as you supply, borrow, and repay.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((a, i) => {
        const m = META[a.type];
        return (
          <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[var(--card-hover)]">
            <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${m.tone}1a`, color: m.tone }}>
              <m.icon className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">{m.label}</div>
              <div className="text-xs text-[var(--text-dim)]">{ago(a.t)}</div>
            </div>
            <div className="text-sm font-semibold tnum">
              {formatAmount(toStroops(a.amount))} {a.asset}
            </div>
          </div>
        );
      })}
    </div>
  );
}
