import { SCALE } from "./config";

/** Convert on-chain stroops (bigint, 7 dp) to a JS number. */
export function fromStroops(v: bigint | number): number {
  return Number(v) / SCALE;
}

/**
 * Convert a human amount to i128 stroops (bigint, 7 dp).
 *
 * This genuinely works in string space, as the original comment claimed while
 * the code multiplied a JS double by 1e7. That is exact for ordinary amounts,
 * but diverges once a value needs more than ~16 significant digits
 * (`999999999.9999999` came out one stroop light) and it *rounds* an over-long
 * fraction where the chain truncates (`1.12345678` became `1.1234568`).
 * Parsing the decimal directly removes both edges.
 */
export function toStroops(v: string | number): bigint {
  const raw = (typeof v === "string" ? v : String(v)).trim();
  if (!raw || !/^\d*(\.\d*)?$/.test(raw)) {
    // Fall back for exponent forms and anything else non-decimal.
    const n = Number(raw);
    if (!isFinite(n) || n < 0) return 0n;
    return BigInt(Math.round(n * SCALE));
  }
  const [whole, frac = ""] = raw.split(".");
  const digits = String(SCALE).length - 1; // 7
  const padded = frac.slice(0, digits).padEnd(digits, "0");
  return BigInt(whole || "0") * BigInt(SCALE) + BigInt(padded || "0");
}

export function formatAmount(v: bigint | number, dp = 2): string {
  return fromStroops(v).toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function formatUSD(v: bigint | number, dp = 2): string {
  return `$${formatAmount(v, dp)}`;
}

/** A `SCALE`-scaled fraction (e.g. utilization) as a percentage string. */
export function scaledToPct(v: bigint | number, dp = 1): string {
  return `${(fromStroops(v) * 100).toFixed(dp)}%`;
}

/**
 * Basis points (10000 == 100%) as a percentage string.
 *
 * Truncated, never rounded: a collateral ratio of 14,960 bps is 149.6%, which
 * is *below* the 150% minimum. Rounding displayed it as "150%" — exactly the
 * boundary case where a borrower most needs to know they are under water.
 */
export function bpsToPct(v: bigint | number, dp = 0): string {
  const pct = Number(v) / 100;
  const factor = 10 ** dp;
  return `${(Math.floor(pct * factor) / factor).toFixed(dp)}%`;
}

export function shortAddr(addr: string, chars = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}
