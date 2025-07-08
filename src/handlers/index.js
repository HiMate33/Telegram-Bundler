const connectWalletHandler = require("./walletConnect");
const networkHandler = require("./networkHandler");
const rpcProviders = require("../config/rpcProviders");
const { User } = require("../models/userModel");
const bundleHandler = require("./walletBundleHandler");
const handleBundleCreate = require("./bundleCreate");
const bundleImportHandler = require("./bundleImport"); // <-- Add this line
const accountInfoHandler = require("./accountInfo");
const handleCreateToken = require("./createToken");
const buyTokenHandler = require("./buyToken");
const volumeHandler = require("./volume");
const autobundleHandler = require("./autobundle");
const startHandler = require("../bot/start")
const viewWalletHanlder = require("./viewWallets");
const fundBundledWalletsHandler = require("./fundBundledWallets");
const fundBundledWalletsState = require("./fundBundledWallets").fundState;
//withdraw to main 
const withdrawToMainHandler = require("./withdrawToMain");




module.exports = (bot) => {

   bot.onText(/\/create_token/, (msg) => handleCreateToken(bot, msg));
  bot.onText(/\/main_wallet/, (msg) => connectWalletHandler(bot, msg));
  bot.onText(/\/bundled_wallets/, (msg) => bundleHandler(bot, msg));
  bot.onText(/\/bundled_network/, (msg) => networkHandler(bot, msg));
  bot.onText(/\/account_info/, (msg) => accountInfoHandler(bot, msg));


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
 if (action === "wallets_menu") {
      const walletButtons = [
        [{ text: "👛 Set Main Wallet", callback_data: "main_wallet" }, { text: "👜  Set Bundled Wallets", callback_data: "bundled_wallets" }],
        [{ text: "💵 Fund Bundled Wallets", callback_data: "fund_wallet" }, { text: "👀 View Wallets", callback_data: "view_wallets" }],        
         [
      { text: "⬆️ Withdraw All to Main", callback_data: "withdraw_all_to_main" }
    ],
        [{ text: "⬅️ Back", callback_data: "back_to_start" }]
      ];
      return bot.sendMessage(chatId, "Choose a wallet option:", {
        reply_markup: { inline_keyboard: walletButtons },
      });
    } 
    // withdraw all to main 

if (action === "withdraw_all_to_main" || action === "withdraw_all_to_main_confirmed"){
  return withdrawToMainHandler(bot, callbackQuery);
}
// wallets options end

    if (action === "bundled_network") {
      return networkHandler(bot, callbackQuery);
    }
if (action === "account_info") {
  return accountInfoHandler(bot, callbackQuery);
}
if (action === "view_wallets") {
  return viewWalletHanlder(bot, callbackQuery);
}
if (action === "back_to_start") {
  // Call the start handler directly
  const msg = {
    chat: { id: chatId },
    from: { id: telegramId }
  };
  return startHandler(bot)(msg);
}
if (action.startsWith("bundle_create_")) {
  const count = parseInt(action.split("_")[2], 10);
  return handleBundleCreate(bot, telegramId, chatId, count);
}
if (action.startsWith("bundle_import_")) {
  const count = parseInt(action.split("_")[2], 10);
   //console.log("bundle_import_ callback triggered", { telegramId, chatId, count });
  return bundleImportHandler(bot, telegramId, chatId, count);
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
if (action === "fund_wallet" || action === "add_fund_wallet") {
  return fundBundledWalletsHandler(bot, callbackQuery);
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

  bot.on("message", async (msg) => {
    if (msg.text && msg.text.startsWith("/")) return;

     // Prioritize fundBundledWallets flow
  const telegramId = msg.from.id;
  if (fundBundledWalletsState && fundBundledWalletsState[telegramId]) {
    if (fundBundledWalletsState[telegramId].confirming) {
      await fundBundledWalletsHandler.handleConfirmation(bot, msg);
    } else {
      await fundBundledWalletsHandler.handleUserReply(bot, msg);
    }
    return;
  }

    await volumeHandler.handleUserReply(bot, msg);
    await autobundleHandler.handleUserReply(bot, msg);
    await bundleImportHandler.handleUserReply(bot, msg);
  //  await fundBundledWalletsHandler.handleConfirmation(bot, msg);
  });

 
};
