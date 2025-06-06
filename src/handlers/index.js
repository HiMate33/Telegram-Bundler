const connectWalletHandler = require("./walletConnect");
const networkHandler = require("./networkHandler");
const rpcProviders = require("../config/rpcProviders");
const { User } = require("../models/userModel");
const bundleHandler = require("./walletBundleHandler");
const handleBundleCreate = require("./bundleCreate");
const handleBundleImport = require("./bundleimport");
const accountInfoHandler = require("./accountInfo");
const handleCreateToken = require("./createToken");
const setupCron = require("../config/jobs/reminderJob");

module.exports = (bot) => {
  // Setup cron jobs
  setupCron(bot);

  bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const action = callbackQuery.data;
    const telegramId = callbackQuery.from.id;

    // Handle wallet actions
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


    // ✅ Handle "bundled_network" action (maps to "set_rpc_provider" in start.js)
    // Note: start.js uses "set_rpc_provider", ensure consistency or map it.
    // If "bundled_network" is the intended callback from an older button, this is fine.
    // If it's for the "Set Network Provider (RPC)" button from start.js, that button sends "set_rpc_provider".
    if (action === "set_rpc_provider" || action === "bundled_network") { // Handling both for flexibility
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
      // Pass the full callbackQuery to handleCreateToken.
      // This allows it to correctly access callbackQuery.from.id and answer the query.
      return handleCreateToken(bot, callbackQuery);
    }

    if (action.startsWith("bundle_import_")) {
      const count = parseInt(action.split("_")[2], 10);
      return handleBundleImport(bot, telegramId, chatId, count);
    }

    if (action.startsWith("rpc_")) {
      try {
        const indexStr = action.split("_")[1];
        const index = parseInt(indexStr, 10);

        if (isNaN(index) || index < 0 || index >= rpcProviders.length) {
          console.error(`❌ Invalid RPC index parsed: ${indexStr} from action: ${action}`);
          await bot.sendMessage(chatId, "❌ Invalid RPC option selected. Please try again.");
          // Answer callback to remove loading state from button
          return bot.answerCallbackQuery(callbackQuery.id, { text: "Invalid option", show_alert: true });
        }
        const selectedRPC = rpcProviders[index];

        await User.findOneAndUpdate({ telegram_id: telegramId }, { rpc_provider: selectedRPC });

        await bot.sendMessage(chatId, `✅ RPC Provider set to *${selectedRPC.name}*`, {
          parse_mode: "Markdown",
        });
        return bot.answerCallbackQuery(callbackQuery.id, { text: `RPC set to ${selectedRPC.name}` });
      } catch (error) {
        console.error(`❌ Error processing rpc_ action for user ${telegramId}:`, error.message);
        await bot.sendMessage(chatId, "❌ An error occurred while setting the RPC provider. Please try again.");
        // Ensure callback is answered even on error
        return bot.answerCallbackQuery(callbackQuery.id, { text: "Error setting RPC", show_alert: true });
      }
    }

    // Default answer for any unhandled callback queries
    // This ensures that if no other handler processed and returned,
    // the callback query is still answered to prevent the client from hanging.
    if (!callbackQuery.answered) {
        try {
            await bot.answerCallbackQuery(callbackQuery.id);
        } catch (err) {
            // Log if answering fails, e.g., if already answered by a sub-handler that didn't return.
            console.error("⚠️ Failed to answer callbackQuery in default handler:", err.message);
        }
    }
  });
};