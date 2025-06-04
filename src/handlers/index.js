const { User } = require("../models/userModel");
const bs58 = require("bs58");
const { Keypair } = require("@solana/web3.js");

const userState = {};

module.exports = (bot) => {
  bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const action = callbackQuery.data;
    const telegramId = callbackQuery.from.id;

    if (action === "set_treasury_wallet") {
      const options = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🆕 Create New Wallet", callback_data: "create_wallet" }],
            [{ text: "📥 Import Wallet (Private Key)", callback_data: "import_wallet" }],
          ],
        },
      };
      return bot.sendMessage(chatId, "🔐 Choose a wallet option:", options);
    }

    if (action === "create_wallet") {
      const keypair = Keypair.generate();
      const publicKey = keypair.publicKey.toString();
      const privateKey = bs58.encode(keypair.secretKey);

      await User.findOneAndUpdate(
        { telegram_id: telegramId },
        { wallet: { publicKey, privateKey } },
        { upsert: true }
      );

      return bot.sendMessage(
        chatId,
        `🎉 <b>Wallet created successfully!</b>\n\n<b>Public Key:</b>\n<code>${publicKey}</code>\n\n<b>Private Key (Save this!):</b>\n<code>${privateKey}</code>`,
        { parse_mode: "HTML" } // Use backticks for template literals
      );
    }

    if (action === "import_wallet") {
      userState[telegramId] = "awaiting_private_key";
      return bot.sendMessage(chatId, "🔑 Please send your private key to import your wallet:");
    }

    bot.answerCallbackQuery(callbackQuery.id);
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const text = msg.text.trim();

    if (userState[telegramId] === "awaiting_private_key") {
      try {
        const decodedKey = bs58.decode(text);
        const publicKey = Keypair.fromSecretKey(decodedKey).publicKey.toString();

        await User.findOneAndUpdate(
          { telegram_id: telegramId },
          { wallet: { publicKey, privateKey: text } },
          { upsert: true }
        );

        delete userState[telegramId];

        return bot.sendMessage(
          chatId,
          `✅ <b>Wallet imported successfully!</b>\n\n<b>Public Key:</b>\n<code>${publicKey}</code>\n\n<b>Private Key (Save this!):</b>\n<code>${text}</code>`,
          { parse_mode: "HTML" } // Corrected to template literal and HTML tags
        );
      } catch (error) {
        return bot.sendMessage(chatId, "❌ Invalid private key format. Please try again.");
      }
    }
  });
};