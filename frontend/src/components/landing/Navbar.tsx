"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { NetworkSelector } from "./NetworkSelector";
import { Logo } from "./Logo";

const NAV = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Docs", href: "https://developers.stellar.org/docs/build/smart-contracts", external: true },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-4 z-40 px-4">
      <header className="mx-auto max-w-5xl rounded-2xl border border-[var(--border)] bg-[var(--card)]/75 shadow-card-lg backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
          <Logo />

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-dim)] transition-colors hover:bg-[var(--card-hover)] hover:text-[var(--text)]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <NetworkSelector />
            </div>
            <Link
              href="/app"
              className="hidden items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-blue)] transition-colors hover:bg-[var(--accent-strong)] sm:inline-flex"
            >
              Launch App <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              onClick={() => setOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-xl border bg-[var(--card)] lg:hidden"
              aria-label="Menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t lg:hidden"
            >
              <div className="space-y-1 px-4 py-3">
                {NAV.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noreferrer" : undefined}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--text-dim)] hover:bg-[var(--card-hover)] hover:text-[var(--text)]"
                  >
                    {item.label}
                  </a>
                ))}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <NetworkSelector />
                  <Link
                    href="/app"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Launch App <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </div>
  );
}
