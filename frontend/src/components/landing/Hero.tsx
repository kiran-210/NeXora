"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAppData } from "@/lib/data";
import { useNetwork } from "@/lib/network";
import { SCALE } from "@/lib/config";
import { formatUSD } from "@/lib/format";
import { ParticleSphere } from "./ParticleSphere";

const pct = (n: number, dp = 2) => `${(n * 100).toFixed(dp)}%`;

export function Hero() {
  const { pool } = useAppData();
  const { isTestnet } = useNetwork();
  const util = pool ? Number(pool.utilizationScaled) / SCALE : 0;

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[640px] w-[820px] translate-x-1/4 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(37,99,235,0.16), transparent)" }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-5 pb-12 pt-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:pt-20">
        {/* Left: copy */}
        <div className="text-center lg:text-left">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <span className="inline-flex items-center gap-2 rounded-full border bg-[var(--card)]/70 px-3.5 py-1.5 text-xs font-medium text-[var(--text-dim)] shadow-card backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              {isTestnet ? "Live on Stellar Testnet" : "Stellar Mainnet"}
              <span className="h-1 w-1 rounded-full bg-[var(--border-strong)]" />
              Powered by Reflector
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-6 text-5xl font-semibold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl"
          >
            The onchain money market for{" "}
            <span className="bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#c084fc] bg-clip-text text-transparent">
              Stellar
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--text-dim)] sm:text-lg lg:mx-0"
          >
            Supply USDC to earn. Lock XLM to borrow. A fast, non-custodial lending protocol with live
            oracle pricing and interest rates that adapt to demand.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start"
          >
            <Link
              href="/app"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-blue)] transition-all hover:-translate-y-0.5 hover:bg-[var(--accent-strong)]"
            >
              Launch App
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 rounded-xl border bg-[var(--card)]/80 px-6 py-3.5 text-sm font-semibold text-[var(--text)] shadow-card backdrop-blur transition-colors hover:bg-[var(--card-hover)]"
            >
              Explore features
            </a>
          </motion.div>

          {/* Live stats */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 lg:justify-start">
            <Stat label="Total Supplied" value={pool ? formatUSD(pool.totalDeposited) : "—"} />
            <Divider />
            <Stat label="Borrow APR" value={pool ? pct(pool.borrowApr) : "—"} />
            <Divider />
            <Stat label="Utilization" value={pool ? pct(util, 1) : "—"} />
          </div>
        </div>

        {/* Right: floating 3D sphere */}
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(79,70,229,0.2), transparent)" }}
          />
          <motion.div
            animate={{ y: [0, -16, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="relative mx-auto h-[380px] w-full sm:h-[520px] lg:h-[600px]"
          >
            <ParticleSphere className="h-full w-full" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center lg:text-left">
      <div className="text-xl font-semibold tnum sm:text-2xl">{value}</div>
      <div className="mt-0.5 text-xs text-[var(--text-dim)]">{label}</div>
    </div>
  );
}
function Divider() {
  return <span className="hidden h-8 w-px bg-[var(--border)] sm:block" />;
}
