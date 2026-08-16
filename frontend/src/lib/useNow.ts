"use client";

import { useEffect, useState } from "react";

/** Current unix time in seconds, ticking on an interval (for live accrual). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Interest accrued on `principal` since `lastUpdate` (seconds) at APR `rate` (0..1). */
export function liveInterest(principal: number, rate: number, lastUpdate: number, now: number): number {
  if (principal <= 0 || rate <= 0 || now <= 0 || lastUpdate <= 0) return 0;
  const elapsed = Math.max(0, now - lastUpdate);
  return (principal * rate * elapsed) / 31_536_000;
}
