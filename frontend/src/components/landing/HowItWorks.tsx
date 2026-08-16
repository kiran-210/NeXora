"use client";

import { motion } from "framer-motion";
import { ArrowDown, Coins, PiggyBank, TrendingUp, Wallet } from "lucide-react";

const INVESTOR = [
  { icon: Coins, title: "Supply USDC", body: "Deposit into the shared lending pool." },
  { icon: PiggyBank, title: "Receive pool shares", body: "Shares represent your slice of the pool." },
  { icon: Wallet, title: "Borrowers pay interest", body: "Interest flows back into the pool." },
  { icon: TrendingUp, title: "Earn yield", body: "Your share value grows over time." },
];

const BORROWER = [
  { icon: Wallet, title: "Deposit XLM", body: "Lock XLM as collateral." },
  { icon: Coins, title: "Borrow USDC", body: "Draw up to a safe 150% ratio." },
  { icon: PiggyBank, title: "Repay loan", body: "Pay back principal plus interest." },
  { icon: TrendingUp, title: "Unlock collateral", body: "Withdraw your XLM anytime." },
];

function Flow({
  title,
  accent,
  steps,
}: {
  title: string;
  accent: string;
  steps: typeof INVESTOR;
}) {
  return (
    <div className="rounded-3xl border bg-[var(--card)] p-6 shadow-card sm:p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <div className="space-y-1">
        {steps.map((s, i) => (
          <div key={s.title}>
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className="flex items-center gap-4 rounded-2xl border bg-[var(--bg)] p-4"
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
                style={{ background: accent }}
              >
                <s.icon className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="text-xs text-[var(--text-dim)]">{s.body}</div>
              </div>
              <span className="ml-auto text-xs font-medium text-[var(--text-faint)] tnum">
                0{i + 1}
              </span>
            </motion.div>
            {i < steps.length - 1 && (
              <div className="flex justify-center py-1 text-[var(--border-strong)]">
                <ArrowDown className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative border-y bg-[var(--bg-elev)]/60">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How NeXora works</h2>
          <p className="mt-3 text-[var(--text-dim)]">
            Two simple flows — one to earn, one to borrow. Both fully on-chain.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Flow title="For Investors" accent="#6366f1" steps={INVESTOR} />
          <Flow title="For Borrowers" accent="#7c3aed" steps={BORROWER} />
        </div>
      </div>
    </section>
  );
}
