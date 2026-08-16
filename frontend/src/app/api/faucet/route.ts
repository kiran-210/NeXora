import { NextResponse } from "next/server";
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  rpc,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { CONTRACTS, NETWORK_PASSPHRASE, RPC_URL, USDC_CODE } from "@/lib/config";

const FAUCET_AMOUNT = "1000"; // test USDC per request

/** Simulate USDC.balance(address); a trustline error means the account can't receive USDC yet. */
async function hasUsdcTrustline(server: rpc.Server, address: string): Promise<boolean> {
  const probe = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(probe, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(CONTRACTS.usdc).call("balance", Address.fromString(address).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    if (/#13|trustline/i.test(sim.error)) return false;
    // Any other simulation failure means we genuinely don't know. Previously
    // this fell through to `true`, so the faucet went ahead, the payment
    // bounced, and the user got a raw 502 instead of "enable USDC first".
    throw new Error(`trustline check failed: ${sim.error}`);
  }
  return true;
}

export async function POST(req: Request) {
  const secret = process.env.USDC_ISSUER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Faucet is not configured (missing USDC_ISSUER_SECRET)." },
      { status: 500 }
    );
  }

  let address: string;
  try {
    ({ address } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!address || !StrKey.isValidEd25519PublicKey(address)) {
    return NextResponse.json({ error: "Invalid Stellar address." }, { status: 400 });
  }

  try {
    const issuer = Keypair.fromSecret(secret);
    const server = new rpc.Server(RPC_URL);

    if (!(await hasUsdcTrustline(server, address))) {
      return NextResponse.json({ error: "no_trustline" }, { status: 409 });
    }

    const source = await server.getAccount(issuer.publicKey());

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: address,
          asset: new Asset(USDC_CODE, issuer.publicKey()),
          amount: FAUCET_AMOUNT,
        })
      )
      .setTimeout(60)
      .build();
    tx.sign(issuer);

    const sent = await server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      const raw = JSON.stringify(sent.errorResult ?? {});
      if (/no_trust|trustline/i.test(raw)) {
        return NextResponse.json(
          { error: "no_trustline" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: `Submit failed: ${raw}` }, { status: 502 });
    }

    let got = await server.getTransaction(sent.hash);
    const deadline = Date.now() + 25_000;
    while (got.status === "NOT_FOUND" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      got = await server.getTransaction(sent.hash);
    }
    if (got.status !== "SUCCESS") {
      const detail = JSON.stringify(got);
      if (/no_trust|trustline/i.test(detail)) {
        return NextResponse.json({ error: "no_trustline" }, { status: 409 });
      }
      return NextResponse.json(
        { error: `Transaction did not succeed (${got.status}).` },
        { status: 502 }
      );
    }

    return NextResponse.json({ hash: sent.hash, amount: FAUCET_AMOUNT });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no_trust|trustline|#13/i.test(msg)) {
      return NextResponse.json({ error: "no_trustline" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
