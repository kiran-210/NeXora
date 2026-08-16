"use client";

import { motion } from "framer-motion";
import { LIQUIDATION_THRESHOLD_BPS, MIN_COLLATERAL_RATIO_BPS } from "@/lib/config";

/**
 * Health factor = collateral ratio / liquidation threshold. HF ≥ 1 is safe;
 * < 1 is liquidatable. Shows the current ratio on a red/orange/green track.
 */
export function HealthBar({ ratioBps }: { ratioBps: bigint | null }) {
  if (ratioBps === null) {
    return (
      <div className="rounded-xl border bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
        No debt — your collateral is fully unlocked.
      </div>
    );
  }

  const ratio = Number(ratioBps) / 100; // percent
  const hf = Number(ratioBps) / LIQUIDATION_THRESHOLD_BPS;

  const tone = ratio < LIQUIDATION_THRESHOLD_BPS / 100 ? "bad" : ratio < MIN_COLLATERAL_RATIO_BPS / 100 ? "warn" : "good";
  const color = tone === "good" ? "var(--success)" : tone === "warn" ? "var(--warn)" : "var(--danger)";
  const label = tone === "good" ? "Healthy" : tone === "warn" ? "Caution" : "At risk";

  // Visual range 100%..250%
  const lo = 100;
  const hi = 250;
  const clamp = Math.max(lo, Math.min(hi, ratio));
  const posPct = ((clamp - lo) / (hi - lo)) * 100;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Health Factor</div>
          <div className="mt-0.5 text-3xl font-semibold tnum" style={{ color }}>
            {hf.toFixed(2)}
          </div>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: `${color}1f`, color }}
        >
          {label} · {ratio.toFixed(0)}%
        </span>
      </div>

      <div className="relative mt-4 h-2.5 rounded-full" style={{
        background:
          "linear-gradient(90deg, var(--danger) 0%, var(--danger) 13.3%, var(--warn) 13.3%, var(--warn) 33.3%, var(--success) 33.3%, var(--success) 100%)",
      }}>
        <motion.div
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white shadow-card"
          style={{ background: color }}
          initial={{ left: "0%" }}
          animate={{ left: `calc(${posPct}% - 8px)` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-[var(--text-faint)]">
        <span>120% liq.</span>
        <span>150% min.</span>
        <span>250%+</span>
      </div>
    </div>
  );
}
