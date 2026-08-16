"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Globe } from "lucide-react";
import { Network, useNetwork } from "@/lib/network";

const OPTIONS: { id: Network; label: string; hint: string }[] = [
  { id: "testnet", label: "Testnet", hint: "Live · free test funds" },
  { id: "mainnet", label: "Mainnet", hint: "Coming soon" },
];

export function NetworkSelector() {
  const { network, setNetwork } = useNetwork();
  const [open, setOpen] = useState(false);
  const active = OPTIONS.find((o) => o.id === network)!;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] shadow-card transition-colors hover:bg-[var(--card-hover)]"
      >
        <span
          className={`h-2 w-2 rounded-full ${
            network === "testnet" ? "bg-[var(--warn)]" : "bg-[var(--success)]"
          }`}
        />
        <Globe className="hidden h-4 w-4 text-[var(--text-dim)] sm:block" />
        {active.label}
        <ChevronDown className={`h-4 w-4 text-[var(--text-dim)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              className="fixed inset-0 z-10 cursor-default"
              aria-label="Close"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border bg-[var(--card)] p-1.5 shadow-card-lg"
            >
              {OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setNetwork(o.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--card-hover)]"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        o.id === "testnet" ? "bg-[var(--warn)]" : "bg-[var(--success)]"
                      }`}
                    />
                    <span>
                      <span className="block text-sm font-medium">{o.label}</span>
                      <span className="block text-xs text-[var(--text-dim)]">{o.hint}</span>
                    </span>
                  </span>
                  {network === o.id && <Check className="h-4 w-4 text-[var(--accent)]" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
