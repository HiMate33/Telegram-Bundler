const { User } = require("../models/userModel");

module.exports = (bot) => {
  bot.onText(/\/start/, async (msg) => {
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

Tap a button below to begin bundling your strategy!`;

    const buttons = [
      [{ text: "⚙️ Auto Bundle", callback_data: "auto_bundle" }],
      [{ text: "👛 Set Main Wallet", callback_data: "main_wallet" }, { text: "📦 Set Bundled Wallets", callback_data: "bundled_wallets" }],
      [{ text: "🆕 Create Token", callback_data: "create_token" }, { text: "🛒 Buy Tokens", callback_data: "buy_tokens" }],
      [{ text: "🌐 Set Newtork Provider (RPC)", callback_data: "bundled_network" }],
      [{ text: "👤 Account Info", callback_data: "account_info" }],
    ];

    bot.sendMessage(chatId, welcomeMsg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  });
};


