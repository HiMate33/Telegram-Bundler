const tempInputMap = {};

const axios = require("axios");
const { User } = require("../models/userModel");
const fetch = require("node-fetch");
const bs58 = require("bs58");
const { Keypair, Connection, VersionedTransaction, PublicKey } = require("@solana/web3.js");
const cron = require("node-cron");
const moment = require("moment");
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function fetchTokenDetails(address) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/solana/contract/${address}`;
    const res = await axios.get(url);
    const data = res.data;
    return {
      name: data.name,
      symbol: data.symbol.toUpperCase(),
      price: data.market_data.current_price.usd,
      marketCap: data.market_data.market_cap.usd,
      liquidity: data.liquidity_score || 0,
      address,
    };
  } catch (err) {
    console.error("CoinGecko error:", err.message);
    return { name: "Not found", symbol: "-", price: 0, marketCap: 0, address };
  }
}

async function buyTokenWithWallet({ user, wallet, tokenMint, amount }) {
  try {
    const inputMint = SOL_MINT;
    const outputMint = tokenMint;
    const slippageBps = 50;
    const rpcUrl = user.rpc_provider?.url || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const userPublicKey = keypair.publicKey;

    // Convert amount SOL to lamports
    const lamports = Math.floor(amount * 1e9);

    // Request Jupiter quote
    const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}` +
      `&amount=${lamports}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) throw new Error(`Quote failed: ${quoteRes.status}`);
    const quoteData = await quoteRes.json();

    // Execute swap
    const swapRes = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteResponse: quoteData, userPublicKey: userPublicKey.toBase58(), dynamicComputeUnitLimit: true, dynamicSlippage: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1000000, priorityLevel: "veryHigh" } } }),
    });
    if (!swapRes.ok) throw new Error(`Swap API failed: ${swapRes.status}`);
    const swapData = await swapRes.json();
    if (!swapData.swapTransaction) throw new Error("No transaction returned.");

    // Sign and send transaction
    const txBuffer = Buffer.from(swapData.swapTransaction, "base64");
    const versionedTx = VersionedTransaction.deserialize(txBuffer);
    versionedTx.sign([keypair]);
    const rawTx = versionedTx.serialize();
    const signature = await connection.sendRawTransaction(rawTx, { maxRetries: 2, skipPreflight: true });
    await connection.confirmTransaction({ signature }, "finalized");

    return { success: true, signature };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  handleAutoBundleStart: async (bot, callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    tempInputMap[telegramId] = { step: "awaiting_token_address" };
    await bot.sendMessage(chatId, "🔍 Please enter the *token address* you want to bundle-buy:", { parse_mode: "Markdown" });
  },

  handleUserReply: async (bot, msg) => {
    const telegramId = msg.from.id;
    const chatId = msg.chat.id;
    const state = tempInputMap[telegramId];
    if (!state) return;

    if (state.step === "awaiting_token_address") {
      const tokenAddress = msg.text.trim();
      const details = await fetchTokenDetails(tokenAddress);
      tempInputMap[telegramId] = { step: "awaiting_buy_option", token: details };
      return bot.sendMessage(chatId,
        `🧾 *Token Details:*\n\n• Name: ${details.name}\n• Symbol: ${details.symbol}\n• Market Cap: $${details.marketCap.toLocaleString()}\n• Price: $${details.price}\n• Address: ${details.address}`,
        { parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [
            [{ text: "🟢 Buy Now", callback_data: "bundle_buy_now" }, { text: "⏰ Buy Later", callback_data: "bundle_buy_later" }],
            [{ text: "💰 Buy on Condition", callback_data: "bundle_buy_on_condition" }, { text: "💯 Buy All", callback_data: "bundle_buy_all" }]
          ] }
        }
      );
    }

    if (state.step === "awaiting_amount") {
      const amount = parseFloat(msg.text.trim());
      if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, "❌ Please enter a valid amount.");
      state.amount = amount;
      state.step = "awaiting_confirm";
      return bot.sendMessage(chatId,
        `✅ Ready to execute *${state.buyType}*:\n\nToken: ${state.token.name} (${state.token.symbol})\nAmount per wallet: ${amount}\n\nPress *Confirm* to execute.`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "✅ Confirm Buy", callback_data: "bundle_confirm_buy" }]] } }
      );
    }

    if (state.step === "awaiting_condition_price") {
      const price = parseFloat(msg.text.trim());
      if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, "❌ Please enter a valid price.");
      state.conditionPrice = price;
      state.step = "awaiting_amount";
      return bot.sendMessage(chatId, "💸 Now enter the *amount* (in SOL) each wallet should buy:", { parse_mode: "Markdown" });
    }

    if (state.step === "awaiting_buy_time") {
      const date = moment(msg.text.trim(), "YYYY-MM-DD HH:mm", true);
      if (!date.isValid() || date.isBefore(moment())) return bot.sendMessage(chatId, "❌ Invalid date.");
      state.buyTime = date.toDate();
      state.step = "awaiting_amount";
      return bot.sendMessage(chatId, "💸 Enter the *amount* (in SOL) each wallet should buy:", { parse_mode: "Markdown" });
    }
  },

  handleAutoBundleActions: async (bot, callbackQuery) => {
    const telegramId = callbackQuery.from.id;
    const chatId = callbackQuery.message.chat.id;
    const action = callbackQuery.data;
    const state = tempInputMap[telegramId];
    if (!state || !state.token) return;

    // Buy All option
    if (action === "bundle_buy_all") {
      state.buyType = "Buy All";
      state.buyAll = true;
      state.step = "awaiting_confirm";
      const user = await User.findOne({ telegram_id: telegramId });
      return bot.sendMessage(chatId,
        `✅ Ready to execute *Buy All* for ${state.token.symbol} with ${user?.bundled_wallets?.length || 0} wallets\nPress *Confirm* to execute.`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "✅ Confirm Buy", callback_data: "bundle_confirm_buy" }]] } }
      );
    }

    if (action === "bundle_buy_now") {
      state.buyType = "Buy Now";
      state.step = "awaiting_amount";
      return bot.sendMessage(chatId, "💸 Enter the *amount* (in SOL) each bundled wallet should buy:", { parse_mode: "Markdown" });
    }
    if (action === "bundle_buy_later") {
      state.buyType = "Buy Later";
      state.step = "awaiting_buy_time";
      return bot.sendMessage(chatId, "⏰ Enter the *date and time* you want to buy (YYYY-MM-DD HH:mm):", { parse_mode: "Markdown" });
    }
    if (action === "bundle_buy_on_condition") {
      state.buyType = "Buy on Condition";
      state.step = "awaiting_condition_price";
      return bot.sendMessage(chatId, "📉 Enter the *price (in USDC)* the token should rise to before buying:", { parse_mode: "Markdown" });
    }

    if (action === "bundle_confirm_buy") {
      const user = await User.findOne({ telegram_id: telegramId });
      if (!user || !user.bundled_wallets?.length) return bot.sendMessage(chatId, "⚠️ You have no bundled wallets set.");
      const { token, amount: inputAmount, buyType, buyTime, buyAll } = state;

      // Prepare connection for Buy All
      let connection;
      if (buyAll) connection = new Connection(user.rpc_provider?.url || "https://api.mainnet-beta.solana.com", "confirmed");

      // Scheduled Buy Later
      if (buyType === "Buy Later" && buyTime) {
        const cronTime = moment(buyTime).format("m H D M *");
        cron.schedule(cronTime, async () => {
          await bot.sendMessage(chatId, "⏳ Performing scheduled buy now...");
          for (let wallet of user.bundled_wallets) {
            let amt = inputAmount;
            if (buyAll) {
              const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
              amt = balance / 1e9;
            }
            const result = await buyTokenWithWallet({ user, wallet, tokenMint: token.address, amount: amt });
            if (result.success) await bot.sendMessage(chatId, `✅ [${wallet.publicKey}] Buy successful!\n[View on Solscan](https://solscan.io/tx/${result.signature})`, { parse_mode: "Markdown", disable_web_page_preview: false });
            else         await bot.sendMessage(chatId, `❌ [${wallet.publicKey}] Buy failed: ${result.error}`);
          }
        }, { scheduled: true, timezone: "UTC" });
        await bot.sendMessage(chatId, `⏰ Scheduled buy for ${moment(buyTime).format("YYYY-MM-DD HH:mm")} UTC!`);
        delete tempInputMap[telegramId];
        return;
      }

      // Immediate or conditional Buy
      await bot.sendMessage(chatId, `🚀 Executing *${buyType}* for ${token.symbol} with ${user.bundled_wallets.length} wallets...`, { parse_mode: "Markdown" });
      for (let wallet of user.bundled_wallets) {
        let amt = inputAmount;
        if (buyAll) {
          const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
          amt = balance / 1e9;
        }
        const result = await buyTokenWithWallet({ user, wallet, tokenMint: token.address, amount: amt });
        if (result.success) await bot.sendMessage(chatId, `✅ [${wallet.publicKey}] Buy successful!\n[View on Solscan](https://solscan.io/tx/${result.signature})`, { parse_mode: "Markdown", disable_web_page_preview: false });
        else         await bot.sendMessage(chatId, `❌ [${wallet.publicKey}] Buy failed: ${result.error}`);
      }
      delete tempInputMap[telegramId];
    }
  }
};
