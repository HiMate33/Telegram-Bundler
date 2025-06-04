const { User } = require("../models/userModel");
const bs58 = require("bs58");
const { Keypair } = require("@solana/web3.js");

module.exports = (bot) => {
  const importStates = {}; // Declare importStates here

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const telegramId = query.from.id;
    const action = query.data;

    if (action === "set_treasury_wallet") {
      const options = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🆕 Create New Wallet", callback_data: "create_wallet" }],
            [
              {
                text: "📥 Import Wallet (Private Key)",
                callback_data: "import_wallet",
              },
            ],
          ],
        },
      };
      return bot.sendMessage(chatId, "🔐 Choose a wallet option:", options);
    }

    // === CREATE WALLET ===
    if (action === "create_wallet") {
      const wallet = Keypair.generate();
      const publicKey = wallet.publicKey.toString();
      const privateKey = bs58.encode(wallet.secretKey);

      await User.findOneAndUpdate(
        { telegram_id: telegramId },
        { wallet: { publicKey, privateKey } },
        { upsert: true }
      );

      return bot.sendMessage(
        chatId,
        `🎉 <b>New wallet created successfully!</b>\n\n<b>Public Key:</b>\n<code>${publicKey}</code>\n\n<b>Private Key (Save this!):</b>\n<code>${privateKey}</code>`,
        { parse_mode: "HTML" }
      );
    }

    // === IMPORT WALLET ===
    if (action === "import_wallet") {
      importStates[telegramId] = true;
      return bot.sendMessage(
        chatId,
        "📥 Please paste your private key to import the wallet:"
      );
    }

    bot.answerCallbackQuery(query.id);
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    if (importStates[telegramId]) {
      const privateKeyString = msg.text.trim();

      try {
        const secretKey = bs58.decode(privateKeyString);
        const wallet = Keypair.fromSecretKey(secretKey);
        const publicKey = wallet.publicKey.toString();

        await User.findOneAndUpdate(
          { telegram_id: telegramId },
          {
            wallet: {
              publicKey,
              privateKey: privateKeyString,
            },
          },
          { upsert: true }
        );

        delete importStates[telegramId];

        return bot.sendMessage(
          chatId,
          `✅ <b>Wallet imported successfully!</b>\n\n<b>Public Key:</b>\n<code>${publicKey}</code>\n\n<b>Private Key (Save this!):</b>\n<code>${privateKeyString}</code>`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        return bot.sendMessage(
          chatId,
          "❌ Invalid private key. Please try again."
        );
      }
    }
  });
};