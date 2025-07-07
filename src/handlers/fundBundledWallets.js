const fundState = {};

const { User } = require("../models/userModel");
const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = require("@solana/web3.js");
const bs58 = require("bs58");



module.exports = async function fundBundledWallets(bot, callbackQuery) {
  const telegramId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;

  const user = await User.findOne({ telegram_id: telegramId });
  if (!user) {
    return bot.sendMessage(chatId, "❌ User not found. Please /start first.");
  }
  if (!user.wallet?.privateKey || !user.wallet?.publicKey) {
    return bot.sendMessage(chatId, "❌ Main wallet not set or missing private key.");
  }
  if (!user.bundled_wallets?.length) {
    return bot.sendMessage(chatId, "❌ No bundled wallets found.");
  }

  // Show main wallet address and balance
  const connection = new Connection(user.rpc_provider?.url || "https://api.mainnet-beta.solana.com");
  let mainBalance = 0;
  try {
    mainBalance = await connection.getBalance(new PublicKey(user.wallet.publicKey));
  } catch (e) {
    return bot.sendMessage(chatId, "❌ Could not fetch main wallet balance.");
  }
  const mainSOL = (mainBalance / 1e9).toFixed(4);

  await bot.sendMessage(
    chatId,
    `👛 *Main Wallet*\n\`${user.wallet.publicKey}\`\n💰 Balance: *${mainSOL} SOL*`,
    { parse_mode: "Markdown" }
  );

  fundState[telegramId] = {
    step: 0,
    amounts: [],
    chatId,
    bundled_wallets: user.bundled_wallets,
    user
  };

  await bot.sendMessage(
    chatId,
    `🔑 *Wallet 1*\n\`${user.bundled_wallets[0].publicKey}\`\n\nHow much SOL do you want to fund this wallet?`,
    { parse_mode: "Markdown" }
  );
};

// Handler for user replies
module.exports.handleUserReply = async function(bot, msg) {
  const telegramId = msg.from.id;
  const state = fundState[telegramId];
  if (!state) return;

  const { bundled_wallets, chatId } = state;

  // Collect amount for current wallet
  const amount = parseFloat(msg.text.trim());
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, "❌ Invalid amount. Please enter a positive number.");
    return;
  }
  state.amounts.push(amount);
  state.step++;

  if (state.step < bundled_wallets.length) {
    // Ask for next wallet
    await bot.sendMessage(
      chatId,
      `🔑 *Wallet ${state.step + 1}*\n\`${bundled_wallets[state.step].publicKey}\`\n\nHow much SOL do you want to fund this wallet?`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // All amounts collected, show summary and ask for confirmation
  let summary = "You are about to fund the following wallets:\n\n";
  for (let i = 0; i < bundled_wallets.length; i++) {
    summary += `Wallet ${i + 1}: \`${bundled_wallets[i].publicKey}\` - *${state.amounts[i]} SOL*\n`;
  }
  summary += "\nSend? (yes/no)";

  await bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });

  state.confirming = true;
};

module.exports.handleConfirmation = async function(bot, msg) {
  const telegramId = msg.from.id;
  const state = fundState[telegramId];
  if (!state || !state.confirming) return;

  const chatId = state.chatId;
  const answer = msg.text.trim().toLowerCase();

  if (answer !== "yes") {
    await bot.sendMessage(chatId, "❌ Funding cancelled.");
    delete fundState[telegramId];
    return;
  }

  // Proceed with funding
  const { user, bundled_wallets, amounts } = state;
  const connection = new Connection(user.rpc_provider?.url || "https://api.mainnet-beta.solana.com");
  const mainKeypair = Keypair.fromSecretKey(bs58.decode(user.wallet.privateKey));

  let success = 0, failed = 0;
  for (let i = 0; i < bundled_wallets.length; i++) {
    try {
      const toPubkey = new PublicKey(bundled_wallets[i].publicKey);
      const lamports = Math.floor(amounts[i] * 1e9);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: mainKeypair.publicKey,
          toPubkey,
          lamports
        })
      );

      const signature = await connection.sendTransaction(tx, [mainKeypair]);
      await bot.sendMessage(
        chatId,
        `✅ Sent *${amounts[i]} SOL* to wallet ${i + 1}.\nTx: [${signature}](https://solscan.io/tx/${signature})`,
        { parse_mode: "Markdown", disable_web_page_preview: true }
      );
      success++;
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Failed to fund wallet ${i + 1}: ${err.message}`);
      failed++;
    }
  }

  await bot.sendMessage(chatId, `Funding complete. Success: ${success}, Failed: ${failed}`);
  delete fundState[telegramId];
};

module.exports.fundState = fundState;