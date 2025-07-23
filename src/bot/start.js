const { User } = require("../models/userModel");

module.exports = (bot) => {
  const handler = async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = Number(msg.from.id);
    //const refCode = msg.text?.split(" ")[1]; 
    const refCode = (typeof msg.text === "string" && msg.text.startsWith("/start"))
  ? msg.text.split(" ")[1]
  : undefined;

    const userData = {
      telegram_id: telegramId,
      username: msg.from.username,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name,
      is_bot: msg.from.is_bot,
      language_code: msg.from.language_code,
      chat_id: chatId,
    };

    let user = await User.findOne({ telegram_id: telegramId });

    if (!user) {
      try {
        // ✅ First time user
        user = await User.create(userData);
        console.log("✅ New user saved:", userData.username || userData.first_name);

        // ✅ Handle Referral Logic
        if (refCode && refCode.startsWith("ref_")) {
          const referrerId = Number(refCode.replace("ref_", ""));

          if (referrerId !== telegramId) {
            const referrer = await User.findOne({ telegram_id: referrerId });

            if (referrer) {
              user.referral = {
                code: `ref_${telegramId}`,
                referredBy: refCode,
                referrals: [],
                earnings: 0,
              };

              // Avoid duplicate referrals
              if (!referrer.referral.referrals.includes(telegramId)) {
                referrer.referral.referrals.push(telegramId);
                referrer.referral.earnings += 0.001;

                await referrer.save();
                console.log("🎉 Referral bonus credited to:", referrer.username);
              }
              await user.save();
            }
          }
        } else {
          // No referral code? Still initialize own code
          user.referral = { code: `ref_${telegramId}`, referredBy: null, referrals: [], earnings: 0 };
          await user.save();
        }
      } catch (error) {
        console.error("❌ Failed to save user:", error);
        return bot.sendMessage(chatId, "An error occurred while saving your data. Please try again.");
      }
    }

    // Rest of your welcome message here...
    const currentProvider = user.rpc_provider?.name || "Not Set";

    const welcomeMsg = `🤖 *GhostBundler* 🔗

Automate token creation and bundle-buy on *Pump.fun* 🚀

🎯 Features:
- 📦 Bundle multiple wallets
- 🛒 Auto-buy fresh token launches
- 🆕 Create and launch your own tokens
- 🌐 Network-wide bundling tools

*🌐 Current Network:* \`${currentProvider}\`

*💡 Note: This bot will soon be monetized. Early users may receive special benefits!*

Tap a button below to begin bundling your strategy!`;

    const buttons = [
      [{ text: "⚙️ Auto Bundle Buy", callback_data: "auto_bundle_buy" }, { text: "💰 Auto Bundle Sell", callback_data: "auto_bundle_sell" }],
      [{ text: "💰 Wallets", callback_data: "wallets_menu" }],
      [{ text: "📋 Copy Trading", callback_data: "copy_trading" }],
      [{ text: "🆕 Create Token", callback_data: "create_token" }, { text: "🛒 Buy Tokens", callback_data: "buy_token" }],
      [{ text: "⬆️ Pump Your Token (📈 volume simulator)", callback_data: "volume_simulator" }],
      [{ text: "📊 Volume Tracker", callback_data: "volume" }, { text: "🎯 Sniper(coming soon)", callback_data: "sniper" }],
      [{ text: "📡 Live Trade Signals (coming soon)", callback_data: "live_signals" }],
      [{ text: "🌐 Set Newtork Provider (RPC)", callback_data: "bundled_network" }, { text: "👤 Account Info", callback_data: "account_info" }],
      [{ text: "🔁 Cross DEX Arbitrage (coming soon)", callback_data: "dex_arbitrage" }],
      [{ text: "🔗 Refferal and Earn", callback_data: "referral" }],
       [{ text: "📬 Subscribe", callback_data: "subscribe" }] // 👈 New button added here
    ];

    bot.sendMessage(chatId, welcomeMsg, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  };

  // Register /start handler with optional ref code
  bot.onText(/\/start(?: (.+))?/, handler);

  return handler;
};
