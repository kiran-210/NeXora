"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export function PagePlaceholder({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1.5 max-w-xl text-sm text-[var(--text-dim)]">{description}</p>
      </div>

      <div className="grid min-h-[340px] place-items-center rounded-3xl border border-dashed border-[var(--border-strong)] bg-[var(--card)] p-10 text-center">
        <div>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Icon className="h-6 w-6" />
          </div>
          <p className="mt-4 font-semibold">Shell ready — page content coming next</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--text-dim)]">
            The navigation and layout are in place. This screen is built in {phase}.
          </p>
          <span className="mt-4 inline-block rounded-full bg-[var(--bg-elev)] px-3 py-1 text-xs font-medium text-[var(--text-dim)]">
            {phase}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
