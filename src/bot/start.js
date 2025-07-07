const { User } = require("../models/userModel");

module.exports = (bot) => {
  // Define the handler function
  const handler = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = Number(msg.from.id);

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
        user = await User.create(userData);
        console.log("✅ New user saved:", userData.username || userData.first_name);
      } catch (error) {
        console.error("❌ Failed to save user:", error);
        return bot.sendMessage(
          chatId,
          "An error occurred while saving your data. Please try again."
        );
      }
    }

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
      [{ text: "⚙️ Auto Bundle", callback_data: "auto_bundle" }],
      [{ text: "💰 Wallets", callback_data: "wallets_menu" }],
      [{ text: "📋 Copy Trading", callback_data: "copy_trading" }],
      [{ text: "🆕 Create Token", callback_data: "create_token" }, { text: "🛒 Buy Tokens", callback_data: "buy_token" }],
      [{ text: "📈 Volume Simulator", callback_data: "volume_simulator" }],
      [
        { text: "📊 Volume Tracker", callback_data: "volume" },
        { text: "🎯 Sniper(coming soon)", callback_data: "sniper" }
      ],
      [
        { text: "📡 Live Trade Signals (coming soon)", callback_data: "live_signals" }
      ],
      [{ text: "🌐 Set Newtork Provider (RPC)", callback_data: "bundled_network" }, { text: "👤 Account Info", callback_data: "account_info" }],
      [
        { text: "🔁 Cross DEX Arbitrage (coming soon)", callback_data: "dex_arbitrage" }
      ],
    ];

    bot.sendMessage(chatId, welcomeMsg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  };

  // Register the handler for /start
  bot.onText(/\/start/, handler);

  // Return the handler for direct call (e.g., from "Back" button)
  return handler;
};

