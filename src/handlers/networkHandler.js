const rpcProviders = require("../config/rpcProviders");
const { User } = require("../models/userModel");

module.exports = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;

  const buttons = rpcProviders.map((rpc, index) => {
    return [{ text: rpc.name, callback_data: `rpc_${index}` }];
  });

  await bot.sendMessage(chatId, "🌐 Select a network RPC provider:", {
    reply_markup: {
      inline_keyboard: buttons,
    },
  });

  bot.answerCallbackQuery(callbackQuery.id);
};
