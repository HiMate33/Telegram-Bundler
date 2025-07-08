const { User } = require("../models/userModel");
const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } = require("@solana/web3.js");
const bs58 = require("bs58");

/**
 * Withdraws (almost) all SOL from each bundled wallet to the user's main wallet.
 * Leaves 0.001 SOL in each bundled wallet for rent exemption.
 */
module.exports = async function withdrawToMainHandler(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;

  // If this is the initial request, ask for confirmation
  if (!callbackQuery.data.endsWith("_confirmed")) {
    return bot.sendMessage(
      chatId,
      "⚠️ *This will empty all your bundled wallets and send the SOL to your main wallet.*\n\nAre you sure you want to proceed?",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Yes, Withdraw All", callback_data: "withdraw_all_to_main_confirmed" },
              { text: "❌ Cancel", callback_data: "wallets_menu" }
            ]
          ]
        }
      }
    );
  }

  // Proceed with withdrawal if confirmed
  const user = await User.findOne({ telegram_id: telegramId });
  if (!user || !user.wallet || !user.wallet.publicKey || !user.wallet.privateKey) {
    return bot.sendMessage(chatId, "❌ Main wallet not set.");
  }
  if (!user.bundled_wallets || user.bundled_wallets.length === 0) {
    return bot.sendMessage(chatId, "❌ No bundled wallets found.");
  }

  const connection = new Connection(user.rpc_provider?.url || "https://api.mainnet-beta.solana.com", "confirmed");
  const mainWallet = new PublicKey(user.wallet.publicKey);

  let anyTx = false;
  for (const bundled of user.bundled_wallets) {
    try {
      const kp = Keypair.fromSecretKey(bs58.decode(bundled.privateKey));
      const balance = await connection.getBalance(kp.publicKey);
      // Leave 0.001 SOL for rent
      const minBalance = 0.001 * LAMPORTS_PER_SOL;
      if (balance > minBalance) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: kp.publicKey,
            toPubkey: mainWallet,
            lamports: balance - minBalance,
          })
        );
        const sig = await connection.sendTransaction(tx, [kp]);
        await bot.sendMessage(
          chatId,
          `✅ Withdrawn from ${kp.publicKey.toBase58()}.\n[View on Solscan](https://solscan.io/tx/${sig})`,
          { parse_mode: "Markdown" }
        );
        anyTx = true;
      }
    } catch (err) {
      await bot.sendMessage(
        chatId,
        `❌ Error withdrawing from ${bundled.publicKey}: ${err.message}`
      );
    }
  }
  if (!anyTx) {
    await bot.sendMessage(chatId, "No bundled wallets had enough SOL to withdraw.");
  }
};