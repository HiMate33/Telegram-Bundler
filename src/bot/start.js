const { User } = require("../models/userModel");

// Define constants for callback data to improve maintainability and reduce typos
const CALLBACK_DATA = {
  MAIN_WALLET: "main_wallet",
  BUNDLED_WALLETS: "bundled_wallets",
  CREATE_TOKEN: "create_token",
  BUY_TOKENS: "buy_tokens",
  BUNDLED_NETWORK: "bundled_network",
  AUTO_BUNDLE: "auto_bundle",
  ACCOUNT_INFO: "account_info",
};

module.exports = (bot) => {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id; // msg.from.id is already a number

    // Prepare user data from the message
    const userData = {
      telegram_id: telegramId,
      username: msg.from.username,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name,
      is_bot: msg.from.is_bot,
      language_code: msg.from.language_code,
      chat_id: chatId,
    };

    // Check if user exists
    let user = await User.findOne({ telegram_id: telegramId });

    if (!user) {
      try {
        user = await User.create(userData);
        console.log("✅ New user created:", user.username || user.first_name);
      } catch (error) {
        console.error("❌ Failed to create new user:", error);
        return bot.sendMessage(
          chatId,
          "An error occurred while setting up your account. Please try /start again."
        );
      }
    } else {
      // User exists, update their information in case it changed
      user.username = userData.username;
      user.first_name = userData.first_name;
      user.last_name = userData.last_name;
      user.language_code = userData.language_code;
      user.is_bot = userData.is_bot; // Though this is unlikely to change for a user
      user.chat_id = userData.chat_id; // Update chat_id if it could change
      try {
        await user.save();
        console.log("✅ User data updated:", user.username || user.first_name);
      } catch (error) {
        console.error("❌ Failed to update user data:", error);
        // Optionally, inform the user, or just log for admin purposes
        // For a non-critical update, you might not need to send a message.
      }
    }

    // Welcome message
    const welcomeMsg = `🤖 *GhostBundler* 🔗

Automate token creation and bundle-buy on *Pump.fun* 🚀

🎯 Features:
- 📦 Bundle multiple wallets
- 🛒 Auto-buy fresh token launches
- 🆕 Create and launch your own tokens
- 🌐 Network-wide bundling tools

Tap a button below to begin bundling your strategy!`;

    // Buttons using the defined constants for callback_data
    const buttons = [
      [{ text: "👛 Main Wallet", callback_data: CALLBACK_DATA.MAIN_WALLET }],
      [{ text: "📦 Bundled Wallets", callback_data: CALLBACK_DATA.BUNDLED_WALLETS }],
      [{ text: "🆕 Create Token", callback_data: CALLBACK_DATA.CREATE_TOKEN }],
      [{ text: "🛒 Buy Tokens", callback_data: CALLBACK_DATA.BUY_TOKENS }],
      [{ text: "🌐 Bundled Network", callback_data: CALLBACK_DATA.BUNDLED_NETWORK }],
      [{ text: "⚙️ Auto Bundle", callback_data: CALLBACK_DATA.AUTO_BUNDLE }],
      [{ text: "👤 Account Info", callback_data: CALLBACK_DATA.ACCOUNT_INFO }],
    ];

    bot.sendMessage(chatId, welcomeMsg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  });
};