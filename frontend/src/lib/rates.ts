import { SCALE } from "./config";

// Mirrors the utilization-based interest curve in Contract B (borrow_rate).
const BASE_RATE = 200_000; // 2%
const KINK_UTIL = 8_000_000; // 80%
const RATE_AT_KINK = 1_000_000; // 10%
const MAX_RATE = 5_000_000; // 50%

/** Borrow APR (fraction 0..1) for a `SCALE`-scaled utilization value. */
export function borrowRate(utilizationScaled: number): number {
  const u = Math.max(0, Math.min(SCALE, utilizationScaled));
  const raw =
    u < KINK_UTIL
      ? BASE_RATE + (u * (RATE_AT_KINK - BASE_RATE)) / KINK_UTIL
      : RATE_AT_KINK + ((u - KINK_UTIL) * (MAX_RATE - RATE_AT_KINK)) / (SCALE - KINK_UTIL);
  return raw / SCALE;
}

/** Lender APY: borrowers' interest flows to lenders in proportion to utilization. */
export function lenderRate(utilizationScaled: number): number {
  const u = utilizationScaled / SCALE;
  return borrowRate(utilizationScaled) * u;
}
