const { User } = require("../models/userModel");
const { Connection, PublicKey } = require("@solana/web3.js");

module.exports = async (bot, callbackQuery) => {
  const telegramId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;

  const user = await User.findOne({ telegram_id: telegramId });

  if (!user) {
    return bot.sendMessage(chatId, "❌ User not found. Please /start first.");
  }

  const connection = new Connection(user.rpc_provider?.url || "https://api.mainnet-beta.solana.com");

  let mainWalletSOL = 0;
  let bundledWalletsText = "";

  try {
    if (user.wallet?.publicKey) {
      const mainBalance = await connection.getBalance(new PublicKey(user.wallet.publicKey));
      mainWalletSOL = mainBalance / 1e9;
    }

    if (user.bundled_wallets?.length > 0) {
      for (let i = 0; i < user.bundled_wallets.length; i++) {
        const wallet = user.bundled_wallets[i];
        const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
        bundledWalletsText += `\n🔑 *Wallet ${i + 1}*\nPublic Key: ${wallet.publicKey}\n💰 SOL: *${(balance / 1e9).toFixed(4)}*\n`;
      }
    } else {
      bundledWalletsText = "\n🚫 No bundled wallets found.";
    }
  } catch (error) {
    console.error("❌ Failed to fetch wallet balances:", error);
    bundledWalletsText = "\n⚠️ Could not fetch wallet balances.";
  }

  const message = `👤 *Account Info*

🧑 Name: *${user.first_name || "N/A"}*
🆔 Telegram ID: ${user.telegram_id}
👛 Main Wallet: ${user.wallet?.publicKey || "Not Set"}
🌐 RPC Network: *${user.rpc_provider?.name || "Not Set"}*
💰 Main Wallet SOL: *${mainWalletSOL.toFixed(4)}*

📦 *Bundled Wallets*:
${bundledWalletsText}`;

  return bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
  });
};
