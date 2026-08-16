// Client-side session recorder + cost-basis tracker.
// The contracts expose only *current* on-chain state (no history, no counts),
// so we honestly record live snapshots in this browser as the market moves.

export interface MarketSnapshot {
  t: number; // epoch ms
  supplied: number; // USDC (pool value)
  borrowed: number;
  available: number;
  utilization: number; // 0..1
  supplyApy: number; // 0..1
  borrowApr: number; // 0..1
}

const HKEY = "nexora:marketHistory";
const MAX_POINTS = 240;

export function recordSnapshot(s: MarketSnapshot) {
  if (typeof window === "undefined") return;
  const hist = getHistory();
  const last = hist[hist.length - 1];
  if (last && s.t - last.t < 4000) return; // de-dupe rapid updates
  hist.push(s);
  while (hist.length > MAX_POINTS) hist.shift();
  try {
    localStorage.setItem(HKEY, JSON.stringify(hist));
  } catch {
    /* storage full — ignore */
  }
}

export function getHistory(): MarketSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HKEY) || "[]");
  } catch {
    return [];
  }
}

// --- Per-address cost basis: net USDC supplied, for an "interest earned" estimate.

const cbKey = (addr: string) => `nexora:costBasis:${addr}`;

export function getCostBasis(addr: string): number {
  if (typeof window === "undefined") return 0;
  const v = Number(localStorage.getItem(cbKey(addr)));
  return isFinite(v) ? v : 0;
}

export function adjustCostBasis(addr: string, deltaUsdc: number) {
  if (typeof window === "undefined") return;
  const next = Math.max(0, getCostBasis(addr) + deltaUsdc);
  localStorage.setItem(cbKey(addr), String(next));
}

// --- Cumulative interest paid (borrower), tracked on repayment.

const ipKey = (addr: string) => `nexora:interestPaid:${addr}`;

export function getInterestPaid(addr: string): number {
  if (typeof window === "undefined") return 0;
  const v = Number(localStorage.getItem(ipKey(addr)));
  return isFinite(v) ? v : 0;
}

export function addInterestPaid(addr: string, delta: number) {
  if (typeof window === "undefined" || delta <= 0) return;
  localStorage.setItem(ipKey(addr), String(getInterestPaid(addr) + delta));
}

// --- Activity timeline (per address), recorded on each successful action.

export type ActivityType =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "add-collateral"
  | "withdraw-collateral"
  | "liquidate";

export interface Activity {
  type: ActivityType;
  amount: number;
  asset: "USDC" | "XLM";
  t: number;
  hash?: string;
}

const actKey = (addr: string) => `nexora:activity:${addr}`;

export function getActivity(addr: string): Activity[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(actKey(addr)) || "[]");
  } catch {
    return [];
  }
}

export function logActivity(addr: string, a: Activity) {
  if (typeof window === "undefined") return;
  const list = getActivity(addr);
  list.unshift(a);
  while (list.length > 50) list.pop();
  localStorage.setItem(actKey(addr), JSON.stringify(list));
}
