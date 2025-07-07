const { User } = require("../models/userModel");

module.exports = (bot, callbackQuery) => {
  const telegramId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;

  bot.sendMessage(chatId, "🧩 How many bundled wallets would you like to manage?", {
    reply_markup: {
      force_reply: true,
    },
  }).then(sentMessage => {
    bot.once("message", async (reply) => {
      const count = parseInt(reply.text);
      if (isNaN(count) || count <= 0) {
        return bot.sendMessage(chatId, "❌ Please enter a valid number.");
      }

      const options = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🆕 Create Wallets", callback_data: `bundle_create_${count}` }], 
            [{ text: "📥 Import Wallets", callback_data: `bundle_import_${count}` }],
          ],
        },
      };

      bot.sendMessage(chatId, `🔢 You selected *${count}* bundled wallets. What would you like to do?`, {
        parse_mode: "Markdown",
        ...options,
      });
    });
  });
};
