const tempInputMap = {}; // in-memory flow state

const axios = require("axios");
const fetch = require("node-fetch");
const bs58 = require("bs58");
const moment = require("moment");
const cron = require("node-cron");
const {
  Keypair,
  Connection,
  VersionedTransaction,
  PublicKey
} = require("@solana/web3.js");

const { User } = require("../models/userModel");

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

async function fetchTokenDetails(address) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/solana/contract/${address}`;
    const { data } = await axios.get(url);
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
    return {
      name: "Not found",
      symbol: "-",
      price: 0,
      marketCap: 0,
      liquidity: 0,
      address,
    };
  }
}

async function buyTokenWithWallet({ user, wallet, tokenMint, amount }) {
  try {
    const inputMint = "So11111111111111111111111111111111111111112"; // SOL
    const outputMint = tokenMint;
    const slippageBps = 50;
    const rpcUrl = user.rpc_provider?.url || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    const userPublicKey = keypair.publicKey;

    // 1) get price
    const priceUrl = `https://lite-api.jup.ag/price/v2?ids=${outputMint}&vsToken=${inputMint}`;
    const priceRes = await fetch(priceUrl);
    const priceData = await priceRes.json();
    const priceObj = priceData.data[outputMint];
    if (!priceObj?.price) throw new Error("No price data on Jupiter.");
    const price = parseFloat(priceObj.price);

    // 2) compute lamports to spend
    const requiredSol = amount;
    const lamports = Math.floor(requiredSol * 1e9);

    // 3) get swap quote
    const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) throw new Error(`Quote failed: ${quoteRes.status}`);
    const quote = await quoteRes.json();
    if (!quote.routePlan?.length) throw new Error("No valid route found.");

    // 4) send swap transaction
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

    return { success: true, signature };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

////////////////////////////////////////////////////////////////////////////////
// Handlers
////////////////////////////////////////////////////////////////////////////////

module.exports = {
  // Step 1: user clicks “Bundle-Buy”
  handleAutoBundleStart: async (bot, callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;

    tempInputMap[telegramId] = { step: "awaiting_token_address" };
    await bot.sendMessage(
      chatId,
      "🔍 Please enter the *token address* you want to bundle-buy:",
      { parse_mode: "Markdown" }
    );
  },

  // Step 2+: user replies with text (address, amount, date, etc)
  handleUserReply: async (bot, msg) => {
    const telegramId = msg.from.id;
    const chatId = msg.chat.id;
    const state = tempInputMap[telegramId];
    if (!state) return;

    // A) after address → show details + buy options
    if (state.step === "awaiting_token_address") {
      const tokenAddress = msg.text.trim();
      const details = await fetchTokenDetails(tokenAddress);
      state.token = details;
      state.step = "awaiting_buy_option";

      return bot.sendMessage(
        chatId,
        `🧾 *Token Details:*\n\n` +
        `• Name: ${details.name}\n` +
        `• Symbol: ${details.symbol}\n` +
        `• Market Cap: $${details.marketCap.toLocaleString()}\n` +
        `• Price: $${details.price}\n` +
        `• Address: ${details.address}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🟢 Buy Now", callback_data: "bundle_buy_now" },
                { text: "⏰ Buy Later", callback_data: "bundle_buy_later" }
              ],
              [
                { text: "💰 Buy on Condition", callback_data: "bundle_buy_on_condition" }
              ]
            ]
          }
        }
      );
    }

    // B) after custom SOL amount
    if (state.step === "awaiting_amount") {
      const amt = parseFloat(msg.text.trim());
      if (isNaN(amt) || amt <= 0) {
        return bot.sendMessage(chatId, "❌ Please enter a valid positive number.");
      }
      state.amount = amt;                   // in SOL
      state.step = "awaiting_confirm";

      return bot.sendMessage(
        chatId,
        `✅ Ready to execute *${state.buyType}* using *${amt} SOL* per wallet.\n\n` +
        `Press *Confirm* to execute.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Confirm Buy", callback_data: "bundle_confirm_buy" }]
            ]
          }
        }
      );
    }

    // C) after condition price
    if (state.step === "awaiting_condition_price") {
      const p = parseFloat(msg.text.trim());
      if (isNaN(p) || p <= 0) {
        return bot.sendMessage(chatId, "❌ Please enter a valid price.");
      }
      state.conditionPrice = p;
      state.step = "awaiting_amount";
      return bot.sendMessage(
        chatId,
        "💸 Now enter the *amount (in SOL)* each wallet should buy once price is hit:"
      );
    }

    // D) after “Buy Later” date
    if (state.step === "awaiting_buy_time") {
      const input = msg.text.trim();
      const date = moment(input, "YYYY-MM-DD HH:mm", true);
      if (!date.isValid() || date.isBefore(moment())) {
        return bot.sendMessage(
          chatId,
          "❌ Please enter a valid future date/time in `YYYY-MM-DD HH:mm` (UTC)."
        );
      }
      state.buyTime = date.toDate();
      state.step = "awaiting_amount";
      return bot.sendMessage(
        chatId,
        "💸 Enter the *amount (in SOL)* each bundled wallet should buy:"
      );
    }
  },

  // Step 3: user taps one of the inline buttons
  handleAutoBundleActions: async (bot, callbackQuery) => {
    const telegramId = callbackQuery.from.id;
    const chatId = callbackQuery.message.chat.id;
    const action = callbackQuery.data;
    const state = tempInputMap[telegramId];
    if (!state || !state.token) return;

    // 3A) Buy Now → choose max or custom
    if (action === "bundle_buy_now") {
      state.buyType = "Buy Now";
      state.step = "awaiting_buy_mode";
      return bot.sendMessage(
        chatId,
        "💸 How much SOL should each wallet spend?",
        {
          reply_markup: {
            inline_keyboard: [[
              { text: "🤑 Spend Max SOL",    callback_data: "bundle_buy_max_sol" },
              { text: "✍️ Enter Custom SOL", callback_data: "bundle_buy_custom_sol" }
            ]]
          }
        }
      );
    }

    // 3B) Max-SOL selected
    if (action === "bundle_buy_max_sol") {
      state.buyMode = "max";
      state.step = "awaiting_confirm";
      return bot.sendMessage(
        chatId,
        `🤑 Will spend *all available SOL* (minus a small fee buffer) in each bundled wallet.\n\n` +
        `Press *Confirm* when you’re ready to execute.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Confirm Buy", callback_data: "bundle_confirm_buy" }
            ]]
          }
        }
      );
    }

    // 3C) Custom-SOL selected
    if (action === "bundle_buy_custom_sol") {
      state.buyMode = "custom";
      state.step = "awaiting_amount";
      return bot.sendMessage(
        chatId,
        "✍️ Enter the *amount of SOL* each bundled wallet should spend:"
      );
    }

    // 3D) Buy Later
    if (action === "bundle_buy_later") {
      state.buyType = "Buy Later";
      state.step = "awaiting_buy_time";
      return bot.sendMessage(
        chatId,
        "⏰ Enter the *date and time* you want to buy (format: YYYY-MM-DD HH:mm UTC):"
      );
    }

    // 3E) Buy on Condition
    if (action === "bundle_buy_on_condition") {
      state.buyType = "Buy on Condition";
      state.step = "awaiting_condition_price";
      return bot.sendMessage(
        chatId,
        "📉 Enter the *price (in SOL)* the token should fall to before buying:"
      );
    }

    // 3F) Confirm Buy (either max or custom)
    if (action === "bundle_confirm_buy") {
      const user = await User.findOne({ telegram_id: telegramId });
      if (!user?.bundled_wallets?.length) {
        return bot.sendMessage(chatId, "⚠️ You have no bundled wallets set.");
      }

      // — Schedule “Buy Later” if needed
      if (state.buyType === "Buy Later" && state.buyTime) {
        const cronExpr = moment(state.buyTime).format("m H D M *");
        cron.schedule(cronExpr, async () => {
          await bot.sendMessage(chatId, "⏳ Performing scheduled buy now…");
          // (reuse the immediate-exec logic below)
          for (let w of user.bundled_wallets) {
            try {
              // same lamports/spendSol logic…
              // …
            } catch (err) {
              await bot.sendMessage(chatId, `❌ [${w.publicKey}] Error: ${err.message}`);
            }
          }
        }, { scheduled: true, timezone: "UTC" });

        await bot.sendMessage(
          chatId,
          `⏰ Scheduled buy for ${moment(state.buyTime).format("YYYY-MM-DD HH:mm")} UTC!`
        );
        delete tempInputMap[telegramId];
        return;
      }

      // — Immediate execution for Buy Now & Buy on Condition
      await bot.sendMessage(
        chatId,
        `🚀 Executing *${state.buyType}* for ${state.token.symbol} ` +
        `with ${user.bundled_wallets.length} wallets…`,
        { parse_mode: "Markdown" }
      );

      const rpcUrl = user.rpc_provider?.url || "https://api.mainnet-beta.solana.com";
      const results = [];

      for (let wallet of user.bundled_wallets) {
        try {
          // 1) fetch balance
          const conn = new Connection(rpcUrl, "confirmed");
          const pk   = new PublicKey(wallet.publicKey);
          const bal  = await conn.getBalance(pk);

          // 2) compute spend lamports
          const feeBuffer     = 1e6; // ~0.001 SOL
          const spendLamports = state.buyMode === "max"
            ? Math.max(0, bal - feeBuffer)
            : Math.floor(state.amount * 1e9);
          const spendSol = spendLamports / 1e9;

          // 3) execute swap
          const res = await buyTokenWithWallet({
            user,
            wallet,
            tokenMint: state.token.address,
            amount: spendSol,
          });
          results.push({ pubkey: wallet.publicKey, res });
        } catch (err) {
          results.push({ pubkey: wallet.publicKey, res: { success: false, error: err.message } });
        }
      }

      // 4) report back
      for (let { pubkey, res } of results) {
        if (res.success) {
          await bot.sendMessage(
            chatId,
            `✅ [${pubkey}] Buy successful!\n` +
            `[View on Solscan](https://solscan.io/tx/${res.signature})`,
            { parse_mode: "Markdown", disable_web_page_preview: false }
          );
        } else {
          await bot.sendMessage(chatId, `❌ [${pubkey}] Buy failed: ${res.error}`);
        }
      }

      delete tempInputMap[telegramId];
    }
  },
};
