const fetch = require('node-fetch');
const bs58 = require('bs58');
const { Connection, PublicKey, Keypair, clusterApiUrl } = require('@solana/web3.js');

const PRIVATE_KEY = 'hyjgAhVXVK7DryJpPAkyxUmBg6RzgkMPAzagNuZHLyPjD3jDVwe2kwjkucMQcQuaWQe3ccUzzKGgLBXuEkDMAfn';
const TOKEN_MINT = process.argv[2] || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Default USDC

const inputMint = "So11111111111111111111111111111111111111112"; // SOL mint
const outputMint = TOKEN_MINT;

const connection = new Connection(clusterApiUrl('mainnet-beta'));

async function getPrices(mints) {
  const url = `https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

(async () => {
  try {
    // Step 1: Load wallet
    const keypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
    const publicKey = keypair.publicKey;
    console.log(`🔑 Wallet: ${publicKey.toBase58()}`);

    // Step 2: Get SOL balance
    let solBalance = await connection.getBalance(publicKey);
    solBalance = solBalance / 1e9; // lamports to SOL
    const netSol = solBalance - 0.01; // deduct fee/rent
    if (netSol <= 0) {
      console.log("❌ Not enough balance after rent/fee deduction.");
      return;
    }
    console.log(`💰 SOL Balance (after 0.01 fee): ${netSol.toFixed(6)} SOL`);

    // Step 3: Get SOL and token prices
    const prices = await getPrices([inputMint, outputMint]);
    const solUsd = prices[inputMint]?.usdPrice;
    const tokenUsd = prices[outputMint]?.usdPrice;

    if (!solUsd || !tokenUsd) {
      console.log("❌ Could not fetch SOL or token price.");
      return;
    }

    const totalUsd = netSol * solUsd;
    const tokenAmount = totalUsd / tokenUsd;

    console.log(`💵 Total USD value: $${totalUsd.toFixed(6)}`);
    console.log(`🔄 Equivalent ${outputMint} tokens: ${tokenAmount.toFixed(6)}`);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
