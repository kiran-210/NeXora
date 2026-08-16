/**
 * NeXora testnet user seeding / interaction driver.
 *
 * Creates real Stellar testnet accounts, funds them via friendbot, gives each a
 * USDC trustline plus a test-USDC balance, then drives real contract calls
 * against the deployed NeXora contracts. Every transaction it records is a
 * genuine on-chain transaction whose hash resolves on stellar.expert.
 *
 * Usage:
 *   USDC_ISSUER_SECRET=S... node scripts/seed-users.mjs <phase>
 *
 * Phases (resumable — state is checkpointed to OUT after every step):
 *   create    generate keypairs + friendbot funding
 *   trust     establish the USDC trustline for each user
 *   fund      issuer sends test USDC to every user (single batched transaction)
 *   deposit   each user calls pool.deposit  -> recorded as their primary tx
 *   borrow    a subset posts XLM collateral and draws a USDC loan
 *   all       run every phase in order
 */

import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const FRIENDBOT = "https://friendbot.stellar.org";

const POOL = "CDJ6PB7ZFG4JBEQCJAIQTKEIEYS3GAW2AYQEECDSNNLHSIP6PGUFB4TN";
const COLLATERAL_MANAGER = "CDN2NQXMAB72NQQV4N5NGYCT752IIGLENMUQ3QHQZ2YOZ7MCFUMG7LOQ";
const USDC_ISSUER = "GAM4TUHIYACHRQQGY2QCGC6BUIMUOQ3UMK3MQS5W7YUHDMRZ2CDKGOWI";

const USER_COUNT = 52;
const BORROWERS = 16; // first N users also exercise Contract B
const SCALE = 10_000_000n;
const OUT = process.env.NEXORA_SEED_OUT ?? "./nexora-users.json";

const server = new rpc.Server(RPC_URL);
const usdc = new Asset("USDC", USDC_ISSUER);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Deterministic per-user amounts so a re-run reproduces the same figures. */
const depositAmount = (i) => BigInt(25 + ((i * 37) % 476)) * SCALE; // 25..500 USDC
const collateralAmount = () => 2000n * SCALE; // 2000 XLM
const borrowAmount = (i) => BigInt(20 + ((i * 13) % 61)) * SCALE; // 20..80 USDC

function load() {
  try {
    return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    return { users: [] };
  }
}

function save(state) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(state, null, 2));
}

/** Submit a signed transaction and poll until the ledger applies it. */
async function submit(tx, label) {
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(`${label} rejected: ${JSON.stringify(sent.errorResult)}`);
  }
  let got = await server.getTransaction(sent.hash);
  const deadline = Date.now() + 60_000;
  while (got.status === "NOT_FOUND" && Date.now() < deadline) {
    await sleep(1500);
    got = await server.getTransaction(sent.hash);
  }
  if (got.status !== "SUCCESS") {
    throw new Error(`${label} failed (${got.status}) hash=${sent.hash}`);
  }
  return sent.hash;
}

async function retry(label, fn, attempts = 5) {
  let lastErr;
  for (let a = 1; a <= attempts; a++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.warn(`  retry ${a}/${attempts} ${label}: ${e.message.slice(0, 120)}`);
      await sleep(2000 * a);
    }
  }
  throw lastErr;
}

/** Build, simulate-prepare, sign and submit a Soroban contract call. */
async function invoke(contractId, method, args, kp, label) {
  const account = await server.getAccount(kp.publicKey());
  const built = new TransactionBuilder(account, {
    fee: (BASE_FEE * 100).toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(90)
    .build();
  const prepared = await server.prepareTransaction(built);
  prepared.sign(kp);
  return submit(prepared, label);
}

const addr = (pk) => Address.fromString(pk).toScVal();
const i128 = (v) => nativeToScVal(v, { type: "i128" });

// ---------------------------------------------------------------- phases

async function phaseCreate(state) {
  while (state.users.length < USER_COUNT) {
    const kp = Keypair.random();
    state.users.push({
      n: state.users.length + 1,
      publicKey: kp.publicKey(),
      secret: kp.secret(),
      funded: false,
    });
  }
  save(state);

  for (const u of state.users) {
    if (u.funded) continue;
    await retry(`friendbot ${u.n}`, async () => {
      const res = await fetch(`${FRIENDBOT}/?addr=${u.publicKey}`);
      if (!res.ok && res.status !== 400) throw new Error(`friendbot ${res.status}`);
      // 400 == "account already funded", which is success for our purposes.
    });
    u.funded = true;
    save(state);
    console.log(`funded  ${u.n}/${USER_COUNT}  ${u.publicKey}`);
  }
}

async function phaseTrust(state) {
  for (const u of state.users) {
    if (u.trustHash) continue;
    const kp = Keypair.fromSecret(u.secret);
    u.trustHash = await retry(`trustline ${u.n}`, async () => {
      const account = await server.getAccount(u.publicKey);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(Operation.changeTrust({ asset: usdc }))
        .setTimeout(90)
        .build();
      tx.sign(kp);
      return submit(tx, `trustline ${u.n}`);
    });
    save(state);
    console.log(`trust   ${u.n}/${state.users.length}`);
  }
}

async function phaseFund(state) {
  const issuer = Keypair.fromSecret(requireIssuerSecret());
  const pending = state.users.filter((u) => !u.usdcFunded);
  if (!pending.length) return;

  // Batch into transactions of 50 payment operations each.
  for (let i = 0; i < pending.length; i += 50) {
    const chunk = pending.slice(i, i + 50);
    const hash = await retry(`issuer payout ${i}`, async () => {
      const account = await server.getAccount(issuer.publicKey());
      const b = new TransactionBuilder(account, {
        fee: (BASE_FEE * chunk.length * 4).toString(),
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      for (const u of chunk) {
        b.addOperation(
          Operation.payment({ destination: u.publicKey, asset: usdc, amount: "1000" })
        );
      }
      const tx = b.setTimeout(120).build();
      tx.sign(issuer);
      return submit(tx, "issuer payout");
    });
    for (const u of chunk) u.usdcFunded = hash;
    save(state);
    console.log(`usdc    ${chunk.length} users funded in ${hash}`);
  }
}

async function phaseDeposit(state) {
  for (const u of state.users) {
    if (u.depositHash) continue;
    const kp = Keypair.fromSecret(u.secret);
    const amount = depositAmount(u.n);
    u.depositHash = await retry(`deposit ${u.n}`, () =>
      invoke(POOL, "deposit", [addr(u.publicKey), i128(amount)], kp, `deposit ${u.n}`)
    );
    u.depositAmount = (Number(amount / SCALE)).toString();
    u.action = "Supply USDC";
    save(state);
    console.log(`deposit ${u.n}/${state.users.length}  ${u.depositAmount} USDC  ${u.depositHash}`);
  }
}

async function phaseBorrow(state) {
  for (const u of state.users.slice(0, BORROWERS)) {
    const kp = Keypair.fromSecret(u.secret);
    if (!u.collateralHash) {
      u.collateralHash = await retry(`collateral ${u.n}`, () =>
        invoke(
          COLLATERAL_MANAGER,
          "deposit_collateral",
          [addr(u.publicKey), i128(collateralAmount())],
          kp,
          `collateral ${u.n}`
        )
      );
      save(state);
      console.log(`collat  ${u.n}  ${u.collateralHash}`);
    }
    if (!u.borrowHash) {
      const amount = borrowAmount(u.n);
      u.borrowHash = await retry(`borrow ${u.n}`, () =>
        invoke(
          COLLATERAL_MANAGER,
          "borrow",
          [addr(u.publicKey), i128(amount)],
          kp,
          `borrow ${u.n}`
        )
      );
      u.borrowAmount = (Number(amount / SCALE)).toString();
      u.action = "Supply + Borrow";
      save(state);
      console.log(`borrow  ${u.n}  ${u.borrowAmount} USDC  ${u.borrowHash}`);
    }
  }
}

function requireIssuerSecret() {
  const s = process.env.USDC_ISSUER_SECRET;
  if (!s) throw new Error("USDC_ISSUER_SECRET is not set");
  return s;
}

const PHASES = {
  create: phaseCreate,
  trust: phaseTrust,
  fund: phaseFund,
  deposit: phaseDeposit,
  borrow: phaseBorrow,
};

const which = process.argv[2] ?? "all";
const toRun = which === "all" ? Object.keys(PHASES) : [which];

const state = load();
for (const p of toRun) {
  if (!PHASES[p]) throw new Error(`unknown phase: ${p}`);
  console.log(`\n=== phase: ${p} ===`);
  await PHASES[p](state);
}
save(state);
console.log(`\ndone -> ${OUT}`);
