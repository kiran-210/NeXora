import { Address, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { CONTRACTS } from "./config";
import { borrowRate, lenderRate } from "./rates";
import { addressArg, enableUsdc, i128Arg, readContract, server, signAndSend, SignTx } from "./soroban";

const { pool, collateralManager: cm } = CONTRACTS;

// ------------------------------------------------------------------ Reads

export interface PoolStats {
  totalDeposited: bigint; // pool value (reserve + borrowed)
  totalBorrowed: bigint;
  availableLiquidity: bigint;
  utilizationScaled: bigint; // SCALE-scaled fraction
  shareValueScaled: bigint; // SCALE-scaled value per share
  borrowApr: number; // 0..1
  lenderApy: number; // 0..1
}

export async function getPoolStats(): Promise<PoolStats> {
  const [totalDeposited, totalBorrowed, availableLiquidity, utilizationScaled, shareValueScaled] =
    await Promise.all([
      readContract<bigint>(pool, "get_total_deposited"),
      readContract<bigint>(pool, "get_total_borrowed"),
      readContract<bigint>(pool, "get_available_liquidity"),
      readContract<bigint>(pool, "get_utilization"),
      readContract<bigint>(pool, "get_share_value"),
    ]);
  const u = Number(utilizationScaled);
  return {
    totalDeposited,
    totalBorrowed,
    availableLiquidity,
    utilizationScaled,
    shareValueScaled,
    borrowApr: borrowRate(u),
    lenderApy: lenderRate(u),
  };
}

export interface LenderPosition {
  shares: bigint;
  valueScaled: bigint; // USDC value of shares (stroops)
}

export async function getLenderPosition(address: string): Promise<LenderPosition> {
  const [shares, shareValueScaled] = await Promise.all([
    readContract<bigint>(pool, "get_shares", [addressArg(address)]),
    readContract<bigint>(pool, "get_share_value"),
  ]);
  // value = shares * shareValue / SCALE ; both are SCALE-scaled, so:
  const valueScaled = (shares * shareValueScaled) / BigInt(10_000_000);
  return { shares, valueScaled };
}

export interface Position {
  collateral: bigint;
  principal: bigint;
  interest: bigint;
  lastUpdate: bigint;
}

export interface BorrowerPosition {
  position: Position;
  healthBps: bigint; // check_health (may be i128::MAX when no debt)
  xlmPriceScaled: bigint;
}

const HEALTH_INFINITE = (1n << 127n) - 1n; // i128::MAX

export async function getBorrowerPosition(address: string): Promise<BorrowerPosition> {
  const [raw, healthBps, xlmPriceScaled] = await Promise.all([
    readContract<Position>(cm, "get_position", [addressArg(address)]),
    // `check_health` values the position at its last stored interest figure,
    // which drifts upward the longer a loan sits untouched — it reported the
    // borrower as healthier than they actually were. `check_health_live`
    // accrues interest to the current ledger, matching what a borrow, repay
    // or liquidation will actually see.
    readContract<bigint>(cm, "check_health_live", [addressArg(address)]),
    readContract<bigint>(cm, "get_xlm_price"),
  ]);
  return {
    position: {
      collateral: raw.collateral ?? 0n,
      principal: raw.principal ?? 0n,
      interest: raw.interest ?? 0n,
      lastUpdate: (raw as unknown as { last_update?: bigint }).last_update ?? 0n,
    },
    healthBps,
    xlmPriceScaled,
  };
}

export interface Balances {
  usdc: bigint;
  xlm: bigint;
  usdcTrusted: boolean; // false when the account has no USDC trustline
  /** True when a balance read failed outright, so the figures are unknown
   *  rather than genuinely zero. */
  stale: boolean;
}

/** Read a token balance, treating a missing classic-asset trustline as zero. */
async function safeBalance(
  token: string,
  address: string
): Promise<{ value: bigint; trusted: boolean; failed: boolean }> {
  try {
    const v = await readContract<bigint>(token, "balance", [addressArg(address)]);
    return { value: v ?? 0n, trusted: true, failed: false };
  } catch (e) {
    // Error #13 == "trustline entry is missing" for a classic asset. That is a
    // real, meaningful zero. Anything else (RPC hiccup, timeout) is *not* — it
    // used to be flattened to a 0 balance, which told users they had no USDC
    // and hid the Max button when in fact the read had simply failed.
    const msg = String(e);
    if (/#13|trustline/i.test(msg)) return { value: 0n, trusted: false, failed: false };
    return { value: 0n, trusted: true, failed: true };
  }
}

export async function getBalances(address: string): Promise<Balances> {
  const [usdc, xlm] = await Promise.all([
    safeBalance(CONTRACTS.usdc, address),
    safeBalance(CONTRACTS.xlm, address),
  ]);
  return {
    usdc: usdc.value,
    xlm: xlm.value,
    usdcTrusted: usdc.trusted,
    stale: usdc.failed || xlm.failed,
  };
}

export const enableUsdcTrustline = (key: string, sign: SignTx) => enableUsdc(key, sign);

/** Look up any borrower's position with interest accrued to *now* (live). */
export async function lookupPosition(address: string): Promise<BorrowerPosition> {
  const [raw, healthBps, xlmPriceScaled] = await Promise.all([
    readContract<Position>(cm, "get_position", [addressArg(address)]),
    readContract<bigint>(cm, "check_health_live", [addressArg(address)]),
    readContract<bigint>(cm, "get_xlm_price"),
  ]);
  return {
    position: {
      collateral: raw.collateral ?? 0n,
      principal: raw.principal ?? 0n,
      interest: raw.interest ?? 0n,
      lastUpdate: (raw as unknown as { last_update?: bigint }).last_update ?? 0n,
    },
    healthBps,
    xlmPriceScaled,
  };
}

// ---------------------------------------------------- Participant counts
// The contracts don't store counts, so we count unique addresses from recent
// token-transfer events (USDC → pool = suppliers, XLM → collateral mgr =
// borrowers). This reflects the RPC's event-retention window; callers floor it
// by on-chain state so it's never contradictory.

const transferTopic = () => nativeToScVal("transfer", { type: "symbol" }).toXDR("base64");
const addrTopic = (a: string) => Address.fromString(a).toScVal().toXDR("base64");

async function uniqueSenders(token: string, to: string): Promise<number> {
  const set = new Set<string>();
  const latest = await server.getLatestLedger();
  // The public testnet RPC silently returns zero events (no error) once the
  // requested range exceeds its per-call span cap, confirmed empirically
  // between 8k (works) and 12k (empty) ledgers back — well short of its
  // advertised ledgerRetentionWindow. 6k stays clear of that cliff.
  const startLedger = Math.max(1, latest.sequence - 6_000);
  let cursor: string | undefined;
  for (let i = 0; i < 6; i++) {
    const req = {
      filters: [
        {
          type: "contract" as const,
          contractIds: [token],
          // getEvents topic filters match on exact segment count. USDC/XLM here are
          // classic Stellar assets accessed through their auto-generated Stellar
          // Asset Contract, whose `transfer` event carries a 4th topic (the SEP-11
          // asset code:issuer) beyond the plain [transfer, from, to] shape a
          // hand-rolled SEP-41 token would emit — match both shapes.
          topics: [
            [transferTopic(), "*", addrTopic(to)],
            [transferTopic(), "*", addrTopic(to), "*"],
          ],
        },
      ],
      limit: 100,
      ...(cursor ? { cursor } : { startLedger }),
    };
    const res = await server.getEvents(req);
    for (const ev of res.events ?? []) {
      try {
        set.add(String(scValToNative(ev.topic[1])));
      } catch {
        /* skip unparseable */
      }
    }
    if (!res.events?.length || !res.cursor) break;
    cursor = res.cursor;
  }
  return set.size;
}

export interface ParticipantCounts {
  suppliers: number;
  borrowers: number;
}

export async function getParticipantCounts(): Promise<ParticipantCounts> {
  const [suppliers, borrowers] = await Promise.all([
    uniqueSenders(CONTRACTS.usdc, CONTRACTS.pool),
    uniqueSenders(CONTRACTS.xlm, CONTRACTS.collateralManager),
  ]);
  return { suppliers, borrowers };
}

/** Suppliers/borrowers to display: recent unique participants, floored so it's
 * never 0 while liquidity/debt exists. Returns "—" until pool data loads. */
export function displaySuppliers(counts: ParticipantCounts | null, pool: PoolStats | null): string {
  if (!pool) return "—";
  return String(Math.max(counts?.suppliers ?? 0, pool.totalDeposited > 0n ? 1 : 0));
}
export function displayBorrowers(counts: ParticipantCounts | null, pool: PoolStats | null): string {
  if (!pool) return "—";
  return String(Math.max(counts?.borrowers ?? 0, pool.totalBorrowed > 0n ? 1 : 0));
}

export function hasDebt(p: Position): boolean {
  return p.principal > 0n || p.interest > 0n;
}

export function isHealthInfinite(bps: bigint): boolean {
  return bps >= HEALTH_INFINITE;
}

// ----------------------------------------------------------------- Writes
// (Wired to UI in Phases 5–7.)

export const poolDeposit = (from: string, amount: bigint, key: string, sign: SignTx) =>
  signAndSend(pool, "deposit", [addressArg(from), i128Arg(amount)], key, sign);

export const poolWithdraw = (from: string, shares: bigint, key: string, sign: SignTx) =>
  signAndSend(pool, "withdraw", [addressArg(from), i128Arg(shares)], key, sign);

export const cmDepositCollateral = (from: string, amount: bigint, key: string, sign: SignTx) =>
  signAndSend(cm, "deposit_collateral", [addressArg(from), i128Arg(amount)], key, sign);

export const cmBorrow = (from: string, amount: bigint, key: string, sign: SignTx) =>
  signAndSend(cm, "borrow", [addressArg(from), i128Arg(amount)], key, sign);

export const cmRepay = (from: string, amount: bigint, key: string, sign: SignTx) =>
  signAndSend(cm, "repay", [addressArg(from), i128Arg(amount)], key, sign);

export const cmWithdrawCollateral = (from: string, amount: bigint, key: string, sign: SignTx) =>
  signAndSend(cm, "withdraw_collateral", [addressArg(from), i128Arg(amount)], key, sign);

export const cmLiquidate = (
  liquidator: string,
  borrower: string,
  repay: bigint,
  key: string,
  sign: SignTx
) => signAndSend(cm, "liquidate", [addressArg(liquidator), addressArg(borrower), i128Arg(repay)], key, sign);
