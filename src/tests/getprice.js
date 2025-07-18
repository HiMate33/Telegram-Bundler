const fetch = require('node-fetch');

// Get tokenMint from command line input or default to JUP
const tokenMint = process.argv[2] || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const inputMint = "So11111111111111111111111111111111111111112"; // SOL (fixed input)
const outputMint = tokenMint; // User-provided output mint

async function getTokenPrices(input, output) {
  const url = `https://lite-api.jup.ag/price/v3?ids=${input},${output}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    console.log("📊 Token Prices:\n");
    for (const mint in data) {
      const token = data[mint];
      console.log(`Mint: ${mint}`);
      console.log(`USD Price: $${token.usdPrice.toFixed(6)}`);
      console.log(`Decimals: ${token.decimals}`);
      console.log(`Block ID: ${token.blockId}`);
      console.log(`24h Change: ${(token.priceChange24h * 100).toFixed(2)}%`);
      console.log('-----------------------------');
    }
  } catch (error) {
    console.error("❌ Error fetching price:", error.message);
  }
}

getTokenPrices(inputMint, outputMint);
