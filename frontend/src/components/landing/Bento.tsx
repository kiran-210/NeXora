"use client";

import { motion } from "framer-motion";
import { Gauge, GitBranch, KeyRound, Radio, ShieldCheck, Zap } from "lucide-react";

function Cell({
  className = "",
  icon: Icon,
  title,
  body,
  index,
  children,
}: {
  className?: string;
  icon: typeof Zap;
  title: string;
  body: string;
  index: number;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, delay: (index % 3) * 0.06 }}
      className={`group relative overflow-hidden rounded-3xl border bg-[var(--card)] p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-lg ${className}`}
    >
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-dim)]">{body}</p>
      {children}
    </motion.div>
  );
}

export function Bento() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">Why NeXora</span>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
          Built for real money, onchain
        </h2>
        <p className="mt-4 text-[var(--text-dim)]">
          Institutional-grade mechanics with the speed and low fees of Stellar.
        </p>
      </div>

      <div className="mt-12 grid auto-rows-[1fr] gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Cell
          index={0}
          className="lg:col-span-2"
          icon={Radio}
          title="Live oracle pricing"
          body="Collateral is valued in real time by the Reflector oracle — the exact price the contract enforces. If the feed is unavailable, risky actions fail safe rather than trust a stale price."
        >
          <div className="mt-5 flex items-end gap-1.5">
            {[28, 40, 34, 52, 46, 64, 58, 72, 66, 80].map((hgt, i) => (
              <span key={i} className="w-full rounded-t bg-gradient-to-t from-[var(--accent)]/20 to-[var(--accent)]/60" style={{ height: hgt }} />
            ))}
          </div>
        </Cell>

        <Cell index={1} icon={ShieldCheck} title="Overcollateralized" body="Every loan is backed by more value than it borrows — enforced on-chain at a 150% minimum ratio." />
        <Cell index={2} icon={Gauge} title="Dynamic interest rates" body="A utilization curve moves borrow APR from 2% to 50%, balancing supply and demand automatically." />
        <Cell index={3} icon={KeyRound} title="Non-custodial" body="You sign every action. NeXora never holds your keys or takes custody of your funds." />

        <Cell
          index={4}
          className="lg:col-span-2"
          icon={Zap}
          title="Built on Stellar · Soroban"
          body="Transactions settle in seconds with negligible fees on a battle-tested network. Two clean contracts split fund custody from risk logic."
        >
          <div className="mt-4 flex flex-wrap gap-2">
            {["~5s finality", "< $0.001 fees", "SEP-40 oracle", "Rust / Soroban"].map((t) => (
              <span key={t} className="rounded-full border bg-[var(--bg)] px-3 py-1 text-xs font-medium text-[var(--text-dim)]">
                {t}
              </span>
            ))}
          </div>
        </Cell>

        <Cell index={5} icon={GitBranch} title="Open source" body="Contracts and frontend are fully open — audit the logic, run it yourself, or build on top." />
      </div>
    </section>
  );
}
