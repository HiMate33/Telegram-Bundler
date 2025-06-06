const rpcProviders = [
  {
    name: "Mainnet Beta (Default)",
    url: "https://api.mainnet-beta.solana.com",
  },
  {
    name: "Helius Mainnet",
    // Ensure HELIUS_API_KEY is set in your .env file
    url: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || 'YOUR_HELIUS_API_KEY_PLACEHOLDER'}`,
  },
  {
    name: "Devnet",
    url: "https://api.devnet.solana.com",
  },
];

module.exports = rpcProviders;