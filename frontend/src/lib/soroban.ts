import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, RPC_URL, USDC_CODE, USDC_ISSUER } from "./config";

export const server = new rpc.Server(RPC_URL);

// Throwaway source account for read-only simulation (never submitted).
const SIM_SOURCE = Keypair.random().publicKey();

export type ScArg = xdr.ScVal;

export const addressArg = (addr: string): ScArg => Address.fromString(addr).toScVal();
export const i128Arg = (v: bigint): ScArg => nativeToScVal(v, { type: "i128" });

/**
 * Simulate a contract call and return its decoded native value. Used for all
 * read-only view functions — no wallet or fees required.
 */
export async function readContract<T = unknown>(
  contractId: string,
  method: string,
  args: ScArg[] = []
): Promise<T> {
  const contract = new Contract(contractId);
  const source = new Account(SIM_SOURCE, "0");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`${method} failed: ${sim.error}`);
  }
  const retval = sim.result?.retval;
  return (retval ? scValToNative(retval) : null) as T;
}

export type SignTx = (xdr: string) => Promise<{ signedTxXdr: string }>;

export interface SendResult {
  hash: string;
  returnValue: unknown;
}

/**
 * A failed contract call, tagged with the contract it targeted. Pool and
 * Collateral Manager reuse the same numeric error codes for different
 * conditions (#4/#5/#6), so the caller needs to know which one panicked
 * before it can translate the code into a message.
 */
export class ContractCallError extends Error {
  constructor(
    message: string,
    readonly contractId?: string,
    readonly hash?: string
  ) {
    super(message);
    this.name = "ContractCallError";
  }
}

/**
 * Raised when a transaction was accepted by the network but hasn't been
 * observed in a closed ledger before we stopped waiting. The transaction is
 * *probably still in flight* — it must not be reported as a failure.
 */
export class TxPendingError extends ContractCallError {
  constructor(hash: string, contractId?: string) {
    super(`transaction ${hash} is still pending`, contractId, hash);
    this.name = "TxPendingError";
  }
}

// Testnet ledgers close in ~5s, but under load a transaction can take
// considerably longer to surface. 30s was short enough that genuinely
// successful transactions were reported to the user as failures.
const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_500;

/** Sign a built transaction with the wallet, submit it, and poll until applied. */
async function signSubmitPoll(
  built: Transaction,
  signTx: SignTx,
  contractId?: string
): Promise<SendResult> {
  const { signedTxXdr } = await signTx(built.toXDR());
  const signed = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);

  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new ContractCallError(
      `submit failed: ${JSON.stringify(sent.errorResult)}`,
      contractId
    );
  }

  let got = await server.getTransaction(sent.hash);
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (got.status === "NOT_FOUND" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    got = await server.getTransaction(sent.hash);
  }
  // Still unseen: the network may yet apply it. Surface the hash so the user
  // can follow it on the explorer instead of being told it failed.
  if (got.status === "NOT_FOUND") {
    throw new TxPendingError(sent.hash, contractId);
  }
  if (got.status !== "SUCCESS") {
    throw new ContractCallError(
      `transaction ${sent.hash} did not succeed: ${got.status}`,
      contractId,
      sent.hash
    );
  }
  return {
    hash: sent.hash,
    returnValue: got.returnValue ? scValToNative(got.returnValue) : null,
  };
}

/**
 * Build → simulate (prepare) → sign → submit a state-changing contract call,
 * then poll until the transaction is applied. `signTx` comes from the wallet.
 */
export async function signAndSend(
  contractId: string,
  method: string,
  args: ScArg[],
  publicKey: string,
  signTx: SignTx
): Promise<SendResult> {
  const contract = new Contract(contractId);
  const account = await server.getAccount(publicKey);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  // Assemble with the resource footprint / auth from simulation. A panic in the
  // contract shows up here, so tag it with the contract that raised it.
  let prepared;
  try {
    prepared = await server.prepareTransaction(built);
  } catch (e) {
    throw new ContractCallError(e instanceof Error ? e.message : String(e), contractId);
  }
  return signSubmitPoll(prepared, signTx, contractId);
}

/**
 * Establish a trustline to the test USDC asset. A classic Stellar operation
 * (no Soroban footprint) — required before an account can hold or receive USDC.
 */
export async function enableUsdc(publicKey: string, signTx: SignTx): Promise<SendResult> {
  const account = await server.getAccount(publicKey);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(USDC_CODE, USDC_ISSUER) }))
    .setTimeout(60)
    .build();
  return signSubmitPoll(built, signTx);
}
