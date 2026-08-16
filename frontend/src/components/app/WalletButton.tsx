"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink, LogOut, Settings, Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { useNetwork } from "@/lib/network";
import { shortAddr } from "@/lib/format";

export function WalletButton() {
  const { address, connect, connecting, error, disconnect } = useWallet();
  const { network } = useNetwork();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!address) {
    return (
      <div className="relative">
        <button
          onClick={connect}
          disabled={connecting}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-blue)] transition-colors hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          {connecting ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          Connect Wallet
        </button>
        {/* A connect failure other than "user closed the modal" (no extension
            installed, a kit error) used to just stop the spinner with no
            explanation anywhere — the button looked broken. */}
        {error && (
          <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border bg-[var(--card)] p-3 text-xs text-[var(--warn)] shadow-card-lg">
            {error}
          </div>
        )}
      </div>
    );
  }

  const explorer = `https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/account/${address}`;

  function copy() {
    navigator.clipboard.writeText(address!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border bg-[var(--card)] py-1.5 pl-1.5 pr-3 text-sm font-medium shadow-card transition-colors hover:bg-[var(--card-hover)]"
      >
        <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#4f46e5]" />
        <span className="tnum">{shortAddr(address, 4)}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button className="fixed inset-0 z-10 cursor-default" aria-label="Close" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border bg-[var(--card)] p-2 shadow-card-lg"
            >
              <div className="flex items-center gap-3 rounded-xl bg-[var(--bg)] p-3">
                <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5]" />
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm">{shortAddr(address, 6)}</div>
                  <div className="text-xs capitalize text-[var(--text-dim)]">{network}</div>
                </div>
              </div>

              <div className="mt-1 space-y-0.5">
                <MenuButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy address"} onClick={copy} />
                <MenuLink icon={ExternalLink} label="View on Explorer" href={explorer} />
                <MenuButton icon={Settings} label="Settings" onClick={() => {}} soon />
                <div className="my-1 h-px bg-[var(--border)]" />
                <MenuButton
                  icon={LogOut}
                  label="Disconnect"
                  danger
                  onClick={() => {
                    disconnect();
                    setOpen(false);
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  danger,
  soon,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  danger?: boolean;
  soon?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-[var(--card-hover)] ${
        danger ? "text-[var(--danger)]" : "text-[var(--text)]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      {soon && (
        <span className="ml-auto rounded-full bg-[var(--bg-elev)] px-2 py-0.5 text-[10px] text-[var(--text-dim)]">
          soon
        </span>
      )}
    </button>
  );
}

function MenuLink({ icon: Icon, label, href }: { icon: typeof Copy; label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-[var(--card-hover)]"
    >
      <Icon className="h-4 w-4" />
      {label}
    </a>
  );
}
