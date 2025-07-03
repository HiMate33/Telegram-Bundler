const connectWalletHandler = require("./walletConnect");
const networkHandler = require("./networkHandler");
const rpcProviders = require("../config/rpcProviders");
const { User } = require("../models/userModel");
const bundleHandler = require("./walletBundleHandler");
const handleBundleCreate = require("./bundleCreate");
const handleBundleImport = require("./bundleImport");
const accountInfoHandler = require("./accountInfo");
const handleCreateToken = require("./createToken");
const buyTokenHandler = require("./buyToken");
const volumeHandler = require("./volume");
// autobundle  import
const autobundleHandler = require("./autobundle");





module.exports = (bot) => {

   bot.onText(/\/create_token/, (msg) => handleCreateToken(bot, msg));
  bot.onText(/\/main_wallet/, (msg) => connectWalletHandler(bot, msg));
  bot.onText(/\/bundled_wallets/, (msg) => bundleHandler(bot, msg));
  bot.onText(/\/bundled_network/, (msg) => networkHandler(bot, msg));
  bot.onText(/\/account_info/, (msg) => accountInfoHandler(bot, msg));
  /*
 bot.onText(/\/addtoken (.+)/, (msg, match) => {
    volumeHandler.handleAddToken(bot, msg, match[1].split(" "));
  });

  bot.onText(/\/setcondition (.+)/, (msg, match) => {
    volumeHandler.handleSetCondition(bot, msg, match[1].split(" "));
  });

  bot.onText(/\/mytokens/, (msg) => {
    volumeHandler.handleMyTokens(bot, msg);
  });

  bot.onText(/\/remove (.+)/, (msg, match) => {
    volumeHandler.handleRemoveToken(bot, msg, match[1].split(" "));
  });

  bot.onText(/\/alerts(?: (on|off))?/, (msg, match) => {
    volumeHandler.handleAlerts(bot, msg, match.slice(1));
  });
*/
  //VOLUME HANDLER

  bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const action = callbackQuery.data;
    const telegramId = callbackQuery.from.id;

    if (
      action === "main_wallet" ||
      action === "create_wallet" ||
      action === "import_wallet"
    ) {
      return connectWalletHandler(bot, callbackQuery);
    }
    if (action === "bundled_wallets") {
  return bundleHandler(bot, callbackQuery);
}


    if (action === "bundled_network") {
      return networkHandler(bot, callbackQuery);
    }
if (action === "account_info") {
  return accountInfoHandler(bot, callbackQuery);
}

if (action.startsWith("bundle_create_")) {
  const count = parseInt(action.split("_")[2], 10);
  return handleBundleCreate(bot, telegramId, chatId, count);
}
if (action === "create_token") {
 return handleCreateToken(bot, callbackQuery)
}
if (action.startsWith("confirm_buy_token_") || action === "buy_token") {
  return buyTokenHandler(bot, callbackQuery);
}
// autobundle 

if (action === "auto_bundle") {
  return autobundleHandler.handleAutoBundleStart(bot, callbackQuery);
}
if (action.startsWith("bundle_")) {
  return autobundleHandler.handleAutoBundleActions(bot, callbackQuery);
}


if (action === "volume") return volumeHandler.handleVolumeMenu(bot, callbackQuery);
if (action === "volume_add") return volumeHandler.promptAddToken(bot, callbackQuery);
if (action === "volume_condition") return volumeHandler.promptSetCondition(bot, callbackQuery);
if (action === "volume_remove") return volumeHandler.promptRemoveToken(bot, callbackQuery);
if (action === "volume_list") return volumeHandler.handleMyTokens(bot, callbackQuery);
if (action === "volume_alerts_toggle") return volumeHandler.toggleAlerts(bot, callbackQuery);

if (action.startsWith("confirm_buy_token_")) {
  const [, , tokenMint, amount] = action.split("_");
 
  await bot.sendMessage(chatId, `You confirmed buying ${amount} of token ${tokenMint}.`);
   return;
}

if (action.startsWith("bundle_import_")) {
  const count = parseInt(action.split("_")[2], 10);
  return handleBundleImport(bot, telegramId, chatId, count);
}


    if (action.startsWith("rpc_")) {
      const index = parseInt(action.split("_")[1], 10);
      const selectedRPC = rpcProviders[index];

      await User.findOneAndUpdate(
        { telegram_id: telegramId },
        { rpc_provider: selectedRPC }
      );

      await bot.sendMessage(chatId, `✅ RPC Provider set to *${selectedRPC.name}*`, {
        parse_mode: "Markdown",
      });

      return bot.answerCallbackQuery(callbackQuery.id);
    }

    bot.answerCallbackQuery(callbackQuery.id);
  });

  // Add this to handle user replies for volume tracker
  bot.on("message", async (msg) => {
    // Ignore messages that are commands (start with '/')
    if (msg.text && msg.text.startsWith("/")) return;
    await volumeHandler.handleUserReply(bot, msg);
     await autobundleHandler.handleUserReply(bot, msg);
  });

 
};
