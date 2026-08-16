"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/landing/Logo";
import { NetworkSelector } from "@/components/landing/NetworkSelector";
import { WalletButton } from "./WalletButton";

const TABS = [
  { label: "Market", href: "/app/market" },
  { label: "Supply", href: "/app/supply" },
  { label: "Borrow", href: "/app/borrow" },
  { label: "Dashboard", href: "/app/dashboard" },
];

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`relative rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--text-dim)] hover:bg-[var(--card-hover)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </Link>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Logo href="/app/market" />

        <nav className="hidden items-center gap-1 rounded-2xl border bg-[var(--bg)] p-1 md:flex">
          {TABS.map((t) => (
            <TabLink key={t.href} href={t.href} label={t.label} active={isActive(t.href)} />
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:block">
            <NetworkSelector />
          </div>
          <WalletButton />
        </div>
      </div>

      {/* Mobile tab row */}
      <div className="border-t bg-[var(--card)] md:hidden">
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-4 py-2">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                isActive(t.href)
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text-dim)]"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
