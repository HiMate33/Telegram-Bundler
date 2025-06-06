const { User } = require("../models/userModel"); // Corrected path to userModel
const bs58 = require("bs58");
const { Keypair } = require("@solana/web3.js");
const { BOT_STATE } = require("../utils/constants"); // Assuming constants are defined elsewhere

// Define constants for callback data to improve maintainability and reduce typos
const WALLET_CALLBACK_DATA = {
  SET_TREASURY_WALLET: "set_treasury_wallet",
  CREATE_WALLET: "create_wallet",
  IMPORT_WALLET: "import_wallet",
};


module.exports = (bot) => {
  bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const action = callbackQuery.data;
    const telegramId = callbackQuery.from.id;

    if (action === WALLET_CALLBACK_DATA.SET_TREASURY_WALLET) {
      const options = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🆕 Create New Wallet", callback_data: WALLET_CALLBACK_DATA.CREATE_WALLET }],
            [{ text: "📥 Import Wallet (Private Key)", callback_data: WALLET_CALLBACK_DATA.IMPORT_WALLET }],
          ],
        },
      };
      await bot.sendMessage(chatId, "🔐 Choose a wallet option:", options);
      return bot.answerCallbackQuery(callbackQuery.id);
    }

    if (action === WALLET_CALLBACK_DATA.CREATE_WALLET) {
      const keypair = Keypair.generate();
      const publicKey = keypair.publicKey.toString();
      const privateKey = bs58.encode(keypair.secretKey);

      // CRITICAL SECURITY RISK: Storing unencrypted private keys.
      // Consider encryption or, preferably, avoiding server-side storage.
      await User.findOneAndUpdate(
        { telegram_id: telegramId },
        { wallet: { publicKey, privateKey } },
        { upsert: true }
      );

      // Clear any pending bot state
      await User.findOneAndUpdate({ telegram_id: telegramId }, { $unset: { bot_state: "" } });

      return bot.sendMessage(
        chatId,
        `🎉 <b>Wallet created successfully!</b>\n\n<b>Public Key:</b>\n<code>${publicKey}</code>\n\n<b>Private Key (Save this!):</b>\n<code>${privateKey}</code>`,
        { parse_mode: "HTML" }
      );
    }
    if (action === WALLET_CALLBACK_DATA.IMPORT_WALLET) {
      try {
        await User.findOneAndUpdate(
          { telegram_id: telegramId },
          { bot_state: BOT_STATE.AWAITING_PRIVATE_KEY }, // Example: BOT_STATE.AWAITING_PRIVATE_KEY = "awaiting_private_key"
          { upsert: true }
        );
        await bot.sendMessage(chatId, "🔑 Please send your private key to import your wallet:");
      } catch (error) {
        console.error(`Error setting state for import_wallet for user ${telegramId}:`, error);
        await bot.sendMessage(chatId, "An error occurred. Please try again.");
      }
      return bot.answerCallbackQuery(callbackQuery.id);
    }

    // Answer any other callback queries that weren't handled above
    return bot.answerCallbackQuery(callbackQuery.id);
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const text = msg.text.trim();

    // Fetch the user from the database to check their current state
    const user = await User.findOne({ telegram_id: telegramId });

    if (user && user.bot_state === BOT_STATE.AWAITING_PRIVATE_KEY) {
      try {
        const decodedKey = bs58.decode(text);
        const publicKey = Keypair.fromSecretKey(decodedKey).publicKey.toString();

        // CRITICAL SECURITY RISK: Storing unencrypted private keys.
        // This needs to be re-architected.
        await User.findOneAndUpdate(
          { telegram_id: telegramId },
          { 
            wallet: { publicKey, privateKey: text }, // Storing unencrypted private key
            $unset: { bot_state: "" } // Clear the state after successful import
          },
          { upsert: true }
        );

        return bot.sendMessage(
          chatId,
          `🎉 <b>Wallet imported successfully!</b>\n\n<b>Public Key:</b>\n<code>${publicKey}</code>\n\n<b>Private Key (Save this!):</b>\n<code>${text}</code>`,
          { parse_mode: "HTML" }
        );
      } catch (error) {
        console.error(`Error importing private key for user ${telegramId}:`, error); // Log the actual error
        // Optionally, inform the user their state is being reset or prompt again
        // await User.findOneAndUpdate({ telegram_id: telegramId }, { $unset: { bot_state: "" } });
        return bot.sendMessage(chatId, "❌ Invalid private key format or an unexpected error occurred. Please try again.");
      }
    }
  });
};