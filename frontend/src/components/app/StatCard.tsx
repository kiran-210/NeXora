"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui";

type Tone = "default" | "accent" | "success" | "danger" | "warn";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-[var(--text)]",
  accent: "text-[var(--accent)]",
  success: "text-[var(--success)]",
  danger: "text-[var(--danger)]",
  warn: "text-[var(--warn)]",
};
const TONE_ICON: Record<Tone, string> = {
  default: "bg-[var(--bg-elev)] text-[var(--text-dim)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  loading = false,
  index = 0,
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  loading?: boolean;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="rounded-2xl border bg-[var(--card)] p-5 shadow-card"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-dim)]">
          {label}
        </span>
        {Icon && (
          <span className={`grid h-8 w-8 place-items-center rounded-lg ${TONE_ICON[tone]}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <div className={`mt-2 text-2xl font-semibold tnum ${TONE_TEXT[tone]}`}>{value}</div>
      )}
      {sub != null && <div className="mt-1 text-xs text-[var(--text-dim)] tnum">{sub}</div>}
    </motion.div>
  );
}
