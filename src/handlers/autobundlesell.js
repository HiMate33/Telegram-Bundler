const tempInputMap = {};

const axios = require("axios");
const { User } = require("../models/userModel");
const fetch = require("node-fetch");
const bs58 = require("bs58");
const { Keypair, Connection, VersionedTransaction, PublicKey } = require("@solana/web3.js");
const cron = require("node-cron");
const moment = require("moment");
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function getTokenDecimals(tokenMintAddress, connection) {
  try {
    const tokenMintPublicKey = new PublicKey(tokenMintAddress);
    const info = await connection.getParsedAccountInfo(tokenMintPublicKey);
    if (info.value && info.value.data && info.value.data.parsed && info.value.data.parsed.info) {
      return info.value.data.parsed.info.decimals;
    }
    return 0;
  } catch (error) {
    console.error(`Error fetching decimals for ${tokenMintAddress}:`, error.message);
    return 0;
  }
}

async function fetchTokenDetails(address) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/solana/contract/${address}`;
    const res = await axios.get(url);
    const data = res.data;
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
    const decimals = await getTokenDecimals(address, connection);
    return {
      name: data.name,
      symbol: data.symbol.toUpperCase(),
      price: data.market_data.current_price.usd,
      marketCap: data.market_data.market_cap.usd,
      liquidity: data.liquidity_score || 0,
      address,
      decimals,
    };
  } catch (err) {
    console.error("CoinGecko error:", err.message);
    let decimals = 0;
    try {
      const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
      decimals = await getTokenDecimals(address, connection);
    } catch (decimalErr) {
      console.error("Error fetching decimals fallback:", decimalErr.message);
    }
    return {
      name: "Not found",
      symbol: "-",
      price: 0,
      marketCap: 0,
      address,
      decimals,
    };
  }
}

// Core sell logic using Jupiter
async function sellTokenWithWallet({ user, wallet, tokenMint, amount }) {
  try {
    const rpcUrl     = user.rpc_provider?.url || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const keypair    = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const userPubKey = keypair.publicKey;

    // Amount in smallest units
    const decimals      = await getTokenDecimals(tokenMint, connection);
    const amountInUnits = BigInt(Math.floor(amount * Math.pow(10, decimals)));

    // Jupiter quote
    const slippageBps = 50;
    const quoteUrl =
      `https://lite-api.jup.ag/swap/v1/quote` +
      `?inputMint=${tokenMint}` +
      `&outputMint=${SOL_MINT}` +
      `&amount=${amountInUnits}` +
      `&slippageBps=${slippageBps}` +
      `&restrictIntermediateTokens=true`;
    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) {
      const text = await quoteRes.text();
      throw new Error(`Quote failed HTTP ${quoteRes.status}: ${text}`);
    }
    const quoteData = await quoteRes.json();

    // Jupiter swap
    const swapRes = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: userPubKey.toBase58(),
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: { maxLamports: 1000000, priorityLevel: "veryHigh" }
        }
      })
    });
    if (!swapRes.ok) throw new Error(`Swap API failed: ${swapRes.status}`);
    const swapData = await swapRes.json();
    if (!swapData.swapTransaction) throw new Error("No transaction returned from Jupiter.");

    // Sign & send
    const txBuffer    = Buffer.from(swapData.swapTransaction, "base64");
    const versionedTx = VersionedTransaction.deserialize(txBuffer);
    versionedTx.sign([keypair]);
    const rawTx       = versionedTx.serialize();
    const signature   = await connection.sendRawTransaction(rawTx, { maxRetries: 2, skipPreflight: true });
    await connection.confirmTransaction({ signature }, "finalized");

    return { success: true, signature };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  handleAutoBundleSell: async (bot, callbackQuery) => {
    const chatId     = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    tempInputMap[telegramId] = { step: "awaiting_token_address" };
    await bot.sendMessage(chatId,
      "🔍 Please enter the *token address* you want to bundle-sell:",
      { parse_mode: "Markdown" }
    );
  },

  handleUserReply: async (bot, msg) => {
    const telegramId = msg.from.id;
    const chatId     = msg.chat.id;
    const state      = tempInputMap[telegramId];
    if (!state) return;

    if (state.step === "awaiting_token_address") {
      const tokenAddress = msg.text.trim();
      const details      = await fetchTokenDetails(tokenAddress);
      tempInputMap[telegramId] = { step: "awaiting_sell_option", token: details };
      return bot.sendMessage(
        chatId,
        `🧾 *Token Details:*\n\n• Name: ${details.name}\n• Symbol: ${details.symbol}\n• Market Cap: $${details.marketCap.toLocaleString()}\n• Price: $${details.price}\n• Address: ${details.address}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🟢 Sell Now",           callback_data: "bundle_sell_now" },
                { text: "⏰ Sell Later",         callback_data: "bundle_sell_later" }
              ],
              [
                { text: "💰 Sell on Condition", callback_data: "bundle_sell_on_condition" },
                { text: "💯 Sell All",           callback_data: "bundle_sell_all" }
              ]
            ]
          }
        }
      );
    }

    if (state.step === "awaiting_amount") {
      const amount = parseFloat(msg.text.trim());
      if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(chatId, "❌ Please enter a valid amount.");
      }
      state.amount   = amount;
      state.step     = "awaiting_confirm";
      return bot.sendMessage(
        chatId,
        `✅ Ready to execute *${state.sellType}*:\n\nToken: ${state.token.name} (${state.token.symbol})\nAmount per wallet: ${amount}\n\nPress *Confirm* to execute.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "✅ Confirm Sell", callback_data: "bundle_sell_confirm" }]]
          }
        }
      );
    }

    if (state.step === "awaiting_condition_price") {
      const price = parseFloat(msg.text.trim());
      if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, "❌ Please enter a valid price.");
      state.conditionPrice = price;
      state.step           = "awaiting_amount";
      return bot.sendMessage(
        chatId,
        "💸 Now enter the *amount* (in SOL) each wallet should sell:",
        { parse_mode: "Markdown" }
      );
    }

    if (state.step === "awaiting_sell_time") {
      const date = moment(msg.text.trim(), "YYYY-MM-DD HH:mm", true);
      if (!date.isValid() || date.isBefore(moment())) {
        return bot.sendMessage(chatId, "❌ Invalid date. Use YYYY-MM-DD HH:mm and a future time.");
      }
      state.sellTime = date.toDate();
      state.step     = "awaiting_amount";
      return bot.sendMessage(
        chatId,
        "💸 Enter the *amount* each bundled wallet should sell:",
        { parse_mode: "Markdown" }
      );
    }
  },

  handleAutoBundleActions: async (bot, callbackQuery) => {
    const telegramId = callbackQuery.from.id;
    const chatId     = callbackQuery.message.chat.id;
    const action     = callbackQuery.data;
    const state      = tempInputMap[telegramId];
    if (!state || !state.token) return;

    // Sell All (100%) option
    if (action === "bundle_sell_all") {
      state.sellType = "Sell All";
      state.sellAll  = true;
      state.step     = "awaiting_confirm";
      const user = await User.findOne({ telegram_id: telegramId });
      return bot.sendMessage(
        chatId,
        `✅ Ready to execute *Sell All* for ${state.token.symbol} with ${user?.bundled_wallets?.length || 0} wallets\nPress *Confirm* to execute.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "✅ Confirm Sell", callback_data: "bundle_sell_confirm" }]]
          }
        }
      );
    }

    if (action === "bundle_sell_now") {
      state.sellType = "Sell Now";
      state.step     = "awaiting_amount";
      return bot.sendMessage(chatId, "💸 Enter the *amount* each bundled wallet should sell:", { parse_mode: "Markdown" });
    }

    if (action === "bundle_sell_later") {
      state.sellType = "Sell Later";
      state.step     = "awaiting_sell_time";
      return bot.sendMessage(chatId, "⏰ Enter the *date and time* you want to sell (YYYY-MM-DD HH:mm):", { parse_mode: "Markdown" });
    }

    if (action === "bundle_sell_on_condition") {
      state.sellType = "Sell on Condition";
      state.step     = "awaiting_condition_price";
      return bot.sendMessage(chatId, "📉 Enter the *price (in SOL)* the token should reach before selling:", { parse_mode: "Markdown" });
    }

    if (action === "bundle_sell_confirm") {
      const user = await User.findOne({ telegram_id: telegramId });
      if (!user || !user.bundled_wallets?.length) {
        return bot.sendMessage(chatId, "⚠️ You have no bundled wallets set.");
      }
      const { token, amount: inputAmount, sellType, sellTime, sellAll } = state;

      // Prepare chain connection if Sell All
      let connection, decimals;
      if (sellAll) {
        connection = new Connection(user.rpc_provider?.url || "https://api.mainnet-beta.solana.com", "confirmed");
        decimals   = await getTokenDecimals(token.address, connection);
      }

      // Scheduled Sell Later
      if (sellType === "Sell Later" && sellTime) {
        const cronTime = moment(sellTime).format("m H D M *");
        cron.schedule(cronTime, async () => {
          await bot.sendMessage(chatId, "⏳ Performing scheduled sell now...");
          for (let wallet of user.bundled_wallets) {
            let amt = inputAmount;
            if (sellAll) {
              const parsed = await connection.getParsedTokenAccountsByOwner(
                new PublicKey(wallet.publicKey),
                { mint: new PublicKey(token.address) }
              );
              const raw = parsed.value.reduce((sum, acct) => sum + BigInt(acct.account.data.parsed.info.tokenAmount.amount), BigInt(0));
              amt = Number(raw) / Math.pow(10, decimals);
            }
            const result = await sellTokenWithWallet({ user, wallet, tokenMint: token.address, amount: amt });
            if (result.success) {
              await bot.sendMessage(chatId, `✅ [${wallet.publicKey}] Sell successful!\n[View on Solscan](https://solscan.io/tx/${result.signature})`, { parse_mode: "Markdown", disable_web_page_preview: false });
            } else {
              await bot.sendMessage(chatId, `❌ [${wallet.publicKey}] Sell failed: ${result.error}`);
            }
          }
        }, { scheduled: true, timezone: "UTC" });
        await bot.sendMessage(chatId, `⏰ Scheduled sell for ${moment(sellTime).format("YYYY-MM-DD HH:mm")} UTC!`);
        delete tempInputMap[telegramId];
        return;
      }

      // Immediate or conditional sell
      await bot.sendMessage(chatId, `🚀 Executing *${sellType}* for ${token.symbol} with ${user.bundled_wallets.length} wallets...`, { parse_mode: "Markdown" });
      for (let wallet of user.bundled_wallets) {
        let amt = inputAmount;
        if (sellAll) {
          const parsed = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(wallet.publicKey),
            { mint: new PublicKey(token.address) }
          );
          const raw = parsed.value.reduce((sum, acct) => sum + BigInt(acct.account.data.parsed.info.tokenAmount.amount), BigInt(0));
          amt = Number(raw) / Math.pow(10, decimals);
        }
        const result = await sellTokenWithWallet({ user, wallet, tokenMint: token.address, amount: amt });
        if (result.success) {
          await bot.sendMessage(chatId, `✅ [${wallet.publicKey}] Sell successful!\n[View on Solscan](https://solscan.io/tx/${result.signature})`, { parse_mode: "Markdown", disable_web_page_preview: false });
        } else {
          await bot.sendMessage(chatId, `❌ [${wallet.publicKey}] Sell failed: ${result.error}`);
        }
      }
      delete tempInputMap[telegramId];
    }
  }
};
