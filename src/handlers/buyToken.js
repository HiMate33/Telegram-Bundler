const { User } = require("../models/userModel");
const fetch = require("node-fetch");
const bs58 = require("bs58");
const { Keypair, Connection, VersionedTransaction, PublicKey } = require("@solana/web3.js");

const tempBuyState = {};

async function getTokenInfo(mintAddress) {
  const url = "https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json";
  const response = await fetch(url);
  if (!response.ok) return { name: "Unknown", symbol: "Unknown" };
  const data = await response.json();
  const token = data.tokens.find(t => t.address === mintAddress);
  if (!token) return { name: "Unknown", symbol: "Unknown" };
  return { name: token.name, symbol: token.symbol };
}

module.exports = async function buyTokenHandler(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;

  if (callbackQuery.data && callbackQuery.data.startsWith("confirm_buy_token_")) {
    
    const dataWithoutPrefix = callbackQuery.data.replace("confirm_buy_token_", "");
    const lastUnderscore = dataWithoutPrefix.lastIndexOf("_");
    const tokenMint = dataWithoutPrefix.substring(0, lastUnderscore);
    const amount = dataWithoutPrefix.substring(lastUnderscore + 1);
    const user = await User.findOne({ telegram_id: telegramId });

    if (!user || !user.wallet?.privateKey) {
      await bot.answerCallbackQuery(callbackQuery.id);
      return bot.sendMessage(chatId, "❌ No main wallet found. Please set it first.");
    }

    await bot.answerCallbackQuery(callbackQuery.id, { text: "Processing buy...", show_alert: false });
    await bot.sendMessage(chatId, "⏳ Buying token, please wait...");

    try {
      const inputMint = "So11111111111111111111111111111111111111112"; 
      const outputMint = tokenMint;
      const slippageBps = 50;
      const rpcUrl = user.rpc_provider?.url || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = Keypair.fromSecretKey(bs58.decode(user.wallet.privateKey));
      const userPublicKey = keypair.publicKey;

      const priceUrl = `https://lite-api.jup.ag/price/v2?ids=${outputMint}&vsToken=${inputMint}`;
      const priceRes = await fetch(priceUrl);
      const priceData = await priceRes.json();
      console.log("Jupiter price API response:", priceData);
      const priceObj = priceData.data[outputMint];
      if (!priceObj || !priceObj.price) {
        await bot.sendMessage(chatId, "❌ This token is not supported or has no price data on Jupiter. Please check the mint address.");
        return;
      }
      const price = parseFloat(priceObj.price);
      const requiredSol = parseFloat(amount) * price;
      const lamports = Math.floor(requiredSol * 1e9);

      const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
      const quoteRes = await fetch(quoteUrl);
      if (!quoteRes.ok) throw new Error(`Quote failed: ${quoteRes.status}`);
      const quote = await quoteRes.json();
      if (!quote.routePlan || quote.routePlan.length === 0) throw new Error("No valid route found.");

      const swapRes = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quote,
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
      if (!swapRes.ok) throw new Error(`Swap API failed: ${swapRes.status}`);
      const swapData = await swapRes.json();
      if (!swapData.swapTransaction) throw new Error("No transaction returned.");

      const txBuffer = Buffer.from(swapData.swapTransaction, "base64");
      const versionedTx = VersionedTransaction.deserialize(txBuffer);
      versionedTx.sign([keypair]);
      const rawTx = versionedTx.serialize();

      const signature = await connection.sendRawTransaction(rawTx, {
        maxRetries: 2,
        skipPreflight: true,
      });

      await connection.confirmTransaction({ signature }, "finalized");

      await bot.sendMessage(chatId, `✅ *Token bought successfully!*\n\nTx: [View on Solscan](https://solscan.io/tx/${signature})`, {
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      });
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Buy failed: ${err.message}`);
    }
    delete tempBuyState[telegramId]; // <-- FIXED HERE
    return;
  }

  // Otherwise, start the buy flow
  await bot.sendMessage(chatId, "🔗 Please enter the *token mint address* you want to buy:", { parse_mode: "Markdown" });

  bot.once("message", async (msg) => {
    if (!msg.text) return;
    const tokenMint = msg.text.trim();

    // Fetch token info here
    const { name, symbol } = await getTokenInfo(tokenMint);

    await bot.sendMessage(chatId, "💵 Enter the *amount of tokens* you want to buy:", { parse_mode: "Markdown" });

    bot.once("message", async (msg) => {
      if (!msg.text) return;
      const amount = msg.text.trim();

      // Fetch SOL price for the token
      const inputMint = "So11111111111111111111111111111111111111112"; // SOL
      const outputMint = tokenMint;
      const priceUrl = `https://lite-api.jup.ag/price/v2?ids=${outputMint}&vsToken=${inputMint}`;
      const priceRes = await fetch(priceUrl);
      const priceData = await priceRes.json();
      const price = parseFloat(priceData.data[outputMint]?.price || 0);
      const requiredSol = price ? (parseFloat(amount) * price) : null;

      const summary = `🛒 *Review Buy Order:*\n\nToken: \`${tokenMint}\`\nName: *${name}*\nSymbol: *${symbol}*\nAmount: *${amount}*\n${requiredSol !== null ? `Cost: *${requiredSol} SOL*\n` : ""}\nPress the button below to buy.`;
      bot.sendMessage(chatId, summary, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🚀 Buy Token", callback_data: `confirm_buy_token_${tokenMint}_${amount}` }]],
        },
      });
    });
  });
};