const { User } = require("../models/userModel");
const fetch = require("node-fetch");
const bs58 = require("bs58");
const { Keypair, Connection, VersionedTransaction, PublicKey } = require("@solana/web3.js");

const tempBuyState = {};

module.exports = async function buyTokenHandler(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;

  // Step 1: Ask for token mint address
  await bot.sendMessage(chatId, "🔗 Please enter the *token mint address* you want to buy:", { parse_mode: "Markdown" });

  bot.once("message", async (msg) => {
    if (!msg.text) return;
    const tokenMint = msg.text.trim();

    // Step 2: Ask for amount
    await bot.sendMessage(chatId, "💵 Enter the *amount of tokens* you want to buy:", { parse_mode: "Markdown" });

    bot.once("message", async (msg) => {
      if (!msg.text) return;
      const amount = msg.text.trim();

      // Step 3: Show confirmation button
      const summary = `🛒 *Review Buy Order:*\n\nToken: \`${tokenMint}\`\nAmount: *${amount}*\n\nPress the button below to buy.`;
      bot.sendMessage(chatId, summary, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🚀 Buy Token", callback_data: `confirm_buy_token_${tokenMint}_${amount}` }]],
        },
      });
    });
  });

  bot.on("callback_query", async (cbQuery) => {
    const userId = cbQuery.from.id;
    const chatId = cbQuery.message.chat.id;

    if (cbQuery.data.startsWith("confirm_buy_token_") && tempBuyState[userId]?.step === "confirm") {
      const [, tokenMint, amount] = cbQuery.data.split("_");
      const user = await User.findOne({ telegram_id: userId });

      if (!user || !user.wallet?.privateKey) {
        await bot.answerCallbackQuery(cbQuery.id);
        return bot.sendMessage(chatId, "❌ No main wallet found. Please set it first.");
      }

      await bot.answerCallbackQuery(cbQuery.id, { text: "Processing buy...", show_alert: false });
      await bot.sendMessage(chatId, "⏳ Buying token, please wait...");

      try {
        // Setup
        const inputMint = "So11111111111111111111111111111111111111112"; // SOL
        const outputMint = tokenMint;
        const slippageBps = 50;
        const rpcUrl = user.rpc_provider?.url || "https://api.mainnet-beta.solana.com";
        const connection = new Connection(rpcUrl, "confirmed");
        const keypair = Keypair.fromSecretKey(bs58.decode(user.wallet.privateKey));
        const userPublicKey = keypair.publicKey;

        // Get quote (amount is in output token, so get SOL needed)
        const priceUrl = `https://lite-api.jup.ag/price/v2?ids=${outputMint}&vsToken=${inputMint}`;
        const priceRes = await fetch(priceUrl);
        const priceData = await priceRes.json();
        const price = parseFloat(priceData.data[outputMint].price);
        const requiredSol = parseFloat(amount) * price;
        const lamports = Math.floor(requiredSol * 1e9);

        // Get Jupiter quote
        const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
        const quoteRes = await fetch(quoteUrl);
        if (!quoteRes.ok) throw new Error(`Quote failed: ${quoteRes.status}`);
        const quote = await quoteRes.json();
        if (!quote.routePlan || quote.routePlan.length === 0) throw new Error("No valid route found.");

        // Build swap transaction
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

        // Sign and send transaction
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
      delete tempBuyState[userId];
    }
  });
};