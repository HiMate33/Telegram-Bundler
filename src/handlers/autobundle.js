const tempInputMap = {};// temp memory for user input flow

const axios = require("axios");
const { User } = require("../models/userModel");
const fetch = require("node-fetch");
const bs58 = require("bs58");
const { Keypair, Connection, VersionedTransaction, PublicKey } = require("@solana/web3.js");
const cron = require("node-cron");
const moment = require("moment"); // For easier date parsing, install with: npm install moment


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
      liquidity: data.liquidity_score || 0, // CoinGecko may not provide liquidity, so fallback to 0
      address,
    };
  } catch (err) {
    console.error("CoinGecko error:", err.message);
    return {
      name: "Not found",
      symbol: "-",
      price: 0,
      marketCap: 0,
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

    const priceUrl = `https://lite-api.jup.ag/price/v2?ids=${outputMint}&vsToken=${inputMint}`;
    const priceRes = await fetch(priceUrl);
    const priceData = await priceRes.json();
    const priceObj = priceData.data[outputMint];
    if (!priceObj || !priceObj.price) throw new Error("No price data on Jupiter.");
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

    await bot.sendMessage(chatId, "🔍 Please enter the *token address* you want to bundle-buy:", {
      parse_mode: "Markdown",
    });
  },

  handleUserReply: async (bot, msg) => {
    const telegramId = msg.from.id;
    const chatId = msg.chat.id;
    const state = tempInputMap[telegramId];

    if (!state) return;


    if (state.step === "awaiting_token_address") {
      const tokenAddress = msg.text.trim();
      const details = await fetchTokenDetails(tokenAddress);

      tempInputMap[telegramId] = {
        step: "awaiting_buy_option",
        token: details,
      };

      await bot.sendMessage(
        chatId,
        `🧾 *Token Details:*\n\n` +
        `• Name: ${details.name}\n` +
        `• Symbol: ${details.symbol}\n` +
        `• Market Cap: $${details.marketCap.toLocaleString()}\n` +
          `• Price: $${details.price}\n` +
        `• Address: $${details.address.toLocaleString()}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🟢 Buy Now", callback_data: "bundle_buy_now" },
                { text: "⏰ Buy Later", callback_data: "bundle_buy_later" },
              ],
              [
                { text: "💰 Buy on Condition", callback_data: "bundle_buy_on_condition" },
                { text: "🧨 Buy All", callback_data: "bundle_buy_all" }
              ]
            ],
          },
        }
      );
    }


    else if (state.step === "awaiting_amount") {
      const amount = parseFloat(msg.text.trim());
      if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(chatId, "❌ Please enter a valid amount (positive number).");
      }

      tempInputMap[telegramId].amount = amount;
      tempInputMap[telegramId].step = "awaiting_confirm";

      await bot.sendMessage(
        chatId,
        `✅ Ready to execute *${state.buyType}*:\n\n` +
        `Token: ${state.token.name} (${state.token.symbol})\n` +
        `Amount per wallet: ${amount}\n\n` +
        `Press *Confirm* to execute.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "✅ Confirm Buy", callback_data: "bundle_confirm_buy" }]],
          },
        }
      );
    }


    else if (state.step === "awaiting_condition_price") {
      const price = parseFloat(msg.text.trim());
      if (isNaN(price) || price <= 0) {
        return bot.sendMessage(chatId, "❌ Please enter a valid price.");
      }

      tempInputMap[telegramId].conditionPrice = price;
      tempInputMap[telegramId].step = "awaiting_amount";

      return bot.sendMessage(chatId, "💸 Now enter the *amount* (in SOL) each wallet should buy:");
    }


    else if (state.step === "awaiting_buy_time") {
      const input = msg.text.trim();
      const date = moment(input, "YYYY-MM-DD HH:mm", true);
      if (!date.isValid() || date.isBefore(moment())) {
        return bot.sendMessage(chatId, "❌ Please enter a valid future date and time in the format YYYY-MM-DD HH:mm (e.g., 2025-07-03 18:30)");
      }
      tempInputMap[telegramId].buyTime = date.toDate();
      tempInputMap[telegramId].step = "awaiting_amount";
      return bot.sendMessage(chatId, "💸 Enter the *amount (in SOL)* each bundled wallet should buy:");
    }
  },

  handleAutoBundleActions: async (bot, callbackQuery) => {
    const telegramId = callbackQuery.from.id;
    const chatId = callbackQuery.message.chat.id;
    const action = callbackQuery.data;

    const state = tempInputMap[telegramId];
    if (!state || !state.token) return;


    if (action === "bundle_buy_now") {
      state.buyType = "Buy Now";
      state.step = "awaiting_amount";

      return bot.sendMessage(chatId, "💸 Enter the *amount of tokens* each bundled wallet should buy:");
    }

    if (action === "bundle_buy_later") {
      state.buyType = "Buy Later";
      state.step = "awaiting_buy_time";
      return bot.sendMessage(chatId, "⏰ Enter the *date and time* you want to buy (format: YYYY-MM-DD HH:mm):");
    }

    if (action === "bundle_buy_on_condition") {
      state.buyType = "Buy on Condition";
      state.step = "awaiting_condition_price";

      return bot.sendMessage(chatId, "📉 Enter the *price (in SOL)* the token should fall to before buying:");
    }


    if (action === "bundle_buy_all") {
  state.buyType = "Buy All";
  state.step = "awaiting_confirm";

  return bot.sendMessage(chatId, `🧨 You've chosen *Buy All*. This will use all SOL (minus ~0.01 for fees) in each bundled wallet to buy ${state.token.symbol}.\n\nPress *Confirm* to proceed.`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "✅ Confirm Buy", callback_data: "bundle_confirm_buy" }]],
    },
  });
}
    

    if (action === "bundle_confirm_buy") {
      const user = await User.findOne({ telegram_id: telegramId });

      if (!user || !user.bundled_wallets || user.bundled_wallets.length === 0) {
        return bot.sendMessage(chatId, "⚠️ You have no bundled wallets set.");
      }

      const { token, amount, conditionPrice, buyType, buyTime } = state;



 
   if (buyType === "Buy All") {
    await bot.sendMessage(chatId, `🧨 Executing *Buy All* for ${token.symbol} using all available SOL (minus fee) per wallet...`, {
      parse_mode: "Markdown",
    });

    const inputMint = "So11111111111111111111111111111111111111112";
    const outputMint = token.address;
    const pricesRes = await fetch(`https://lite-api.jup.ag/price/v3?ids=${inputMint},${outputMint}`);
    const prices = await pricesRes.json();
    const solUsd = prices[inputMint]?.usdPrice;
    const tokenUsd = prices[outputMint]?.usdPrice;

    if (!solUsd || !tokenUsd) {
      await bot.sendMessage(chatId, "❌ Failed to get price data.");
      return;
    }

    for (let wallet of user.bundled_wallets) {
      try {
        const connection = new Connection(user.rpc_provider?.url || "https://api.mainnet-beta.solana.com", "confirmed");
        const pubkey = new PublicKey(wallet.publicKey);
        const solBalanceLamports = await connection.getBalance(pubkey);
        const solBalance = solBalanceLamports / 1e9;

        const netSol = solBalance - 0.01;
        if (netSol <= 0) {
          await bot.sendMessage(chatId, `⚠️ [${wallet.publicKey}] Insufficient SOL after fee deduction.`);
          continue;
        }

        const totalUsd = netSol * solUsd;
        const tokenAmount = totalUsd / tokenUsd;

        const result = await buyTokenWithWallet({
          user,
          wallet,
          tokenMint: token.address,
          amount: tokenAmount,
        });

        if (result.success) {
          await bot.sendMessage(
            chatId,
            `✅ [${wallet.publicKey}] Bought ${tokenAmount.toFixed(6)} ${token.symbol}!\n[View Tx](https://solscan.io/tx/${result.signature})`,
            { parse_mode: "Markdown", disable_web_page_preview: false }
          );
        } else {
          await bot.sendMessage(
            chatId,
            `❌ [${wallet.publicKey}] Buy failed: ${result.error}`
          );
        }
      } catch (err) {
        await bot.sendMessage(chatId, `❌ [${wallet.publicKey}] Error: ${err.message}`);
      }
    }

    delete tempInputMap[telegramId];
    return;
  }     


      if (buyType === "Buy Later" && buyTime) {
        
        const cronTime = moment(buyTime).format("m H D M *"); // minute hour day month *
        cron.schedule(cronTime, async () => {
          await bot.sendMessage(chatId, "⏳ Performing scheduled buy now...");
          for (let wallet of user.bundled_wallets) {
            try {
              const result = await buyTokenWithWallet({
                user,
                wallet,
                tokenMint: token.address,
                amount,
              });
              if (result.success) {
                await bot.sendMessage(
                  chatId,
                  `✅ [${wallet.publicKey}] Buy successful!\n[View on Solscan](https://solscan.io/tx/${result.signature})`,
                  { parse_mode: "Markdown", disable_web_page_preview: false }
                );
              } else {
                await bot.sendMessage(
                  chatId,
                  `❌ [${wallet.publicKey}] Buy failed: ${result.error}`
                );
              }
            } catch (err) {
              await bot.sendMessage(
                chatId,
                `❌ [${wallet.publicKey}] Error: ${err.message}`
              );
            }
          }
        }, { scheduled: true, timezone: "UTC" });

        await bot.sendMessage(chatId, `⏰ Scheduled buy for ${moment(buyTime).format("YYYY-MM-DD HH:mm")} UTC!`);
        delete tempInputMap[telegramId];
        return;
      }

      await bot.sendMessage(chatId, `🚀 Executing *${buyType}* for ${token.symbol} with ${user.bundled_wallets.length} wallets...`, {
        parse_mode: "Markdown",
      
    });


      // Actually perform the buy for each wallet
      for (let wallet of user.bundled_wallets) {
        try {
          const result = await buyTokenWithWallet({
            user,
            wallet,
            tokenMint: token.address,
            amount,
          });
          if (result.success) {
            await bot.sendMessage(
              chatId,
              `✅ [${wallet.publicKey}] Buy successful!\n[View on Solscan](https://solscan.io/tx/${result.signature})`,
              { parse_mode: "Markdown", disable_web_page_preview: false }
            );
          } else {
            await bot.sendMessage(
              chatId,
              `❌ [${wallet.publicKey}] Buy failed: ${result.error}`
            );
          }
        } catch (err) {
          await bot.sendMessage(
            chatId,
            `❌ [${wallet.publicKey}] Error: ${err.message}`
          );
        }
      }

      delete tempInputMap[telegramId];
    }
  },
};