const fetch = require("node-fetch");
const bs58 = require("bs58");
const {
  PublicKey,
  Connection,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");

const secretKeyBs58 = "PRIVATE-KEY_STRING"; // <-- Replace with your bs58 secret key string
const secretKey = bs58.decode(secretKeyBs58);

const keypair = Keypair.fromSecretKey(secretKey);
const userPublicKey = keypair.publicKey;

const inputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDT
const outputMint = "So11111111111111111111111111111111111111112"; // SOL
const amount = "8600000"; // 10_000_000 = 10 USDT (USDT has 6 decimals)
const slippageBps = 50; // 0.5% slippage

const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

async function getQuote() {
  const url = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;

  console.log("Fetching quote from Jupiter...");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch quote. Status: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();

  if (!data || !data.routePlan || data.routePlan.length === 0) {
    throw new Error("No valid route found in quote response.");
  }

  console.log("✅ Quote fetched successfully.");
  return data;
}

async function buildSwapTransaction(quoteResponse) {
  console.log("Building swap transaction...");

  const res = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: userPublicKey.toBase58(),
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 1000000,
          priorityLevel: "veryHigh",
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Swap API failed: ${res.status} ${res.statusText} - ${errText}`
    );
  }

  const swapResponse = await res.json();

  if (!swapResponse.swapTransaction) {
    throw new Error("Swap transaction not returned.");
  }

  console.log("✅ Swap transaction built successfully.");
  return swapResponse.swapTransaction;
}

async function sendTransaction(base64Transaction) {
  console.log("Sending transaction to Solana...");

  const txBuffer = Buffer.from(base64Transaction, "base64");

  const versionedTx = VersionedTransaction.deserialize(txBuffer);

  versionedTx.sign([keypair]);

  const rawTx = versionedTx.serialize();

  const signature = await connection.sendRawTransaction(rawTx, {
    maxRetries: 2,
    skipPreflight: true,
  });

  console.log("✅ Transaction sent! Signature:", signature);

  const confirmation = await connection.confirmTransaction(
    { signature },
    "finalized"
  );

  if (confirmation.value.err) {
    throw new Error(
      `Transaction failed: ${JSON.stringify(
        confirmation.value.err
      )}\nhttps://solscan.io/tx/${signature}/`
    );
  } else {
    console.log(
      `🎉 Transaction confirmed: https://solscan.io/tx/${signature}/`
    );
  }
}

async function main() {
  try {
    const quote = await getQuote();
    const base64Tx = await buildSwapTransaction(quote);
    await sendTransaction(base64Tx);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

main();