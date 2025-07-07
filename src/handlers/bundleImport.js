const importState = {};

const { User } = require("../models/userModel");
const bs58 = require("bs58");
const { Keypair } = require("@solana/web3.js");

module.exports = async function handleBundleImport(bot, telegramId, chatId, count) {
  importState[telegramId] = {
    step: "import_wallet",
    count,
    current: 0,
    wallets: [],
    amounts: [],
    chatId
  };
  await bot.sendMessage(chatId, `📥 Send *private key* for wallet #1`, { parse_mode: "Markdown" });
};

// Handler for user replies
module.exports.handleUserReply = async function(bot, msg) {
  const telegramId = msg.from.id;
  const state = importState[telegramId];
  if (!state) return;

  if (state.step === "import_wallet") {
    const privateKey = msg.text.trim();
    try {
      const secretKey = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(secretKey);
      const publicKey = keypair.publicKey.toBase58();
      state.wallets.push({ publicKey, privateKey });
      state.current++;
      await bot.sendMessage(state.chatId, `🧾 Wallet #${state.current} Imported\n\n🔐 Private Key:\n\`${privateKey}\`\n\n🔓 Public Key:\n\`${publicKey}\``, { parse_mode: "Markdown" });
      if (state.current < state.count) {
        await bot.sendMessage(state.chatId, `📥 Send *private key* for wallet #${state.current + 1}`, { parse_mode: "Markdown" });
      } else {
        // Save wallets to DB
        await User.findOneAndUpdate(
          { telegram_id: telegramId },
          { $set: { bundled_wallets: state.wallets, bundled_wallet_buy_amount: [] } },
        );
        await bot.sendMessage(state.chatId, `✅ Successfully imported ${state.count} wallets.\n\n📌 *Please save your private keys securely.*`, { parse_mode: "Markdown" });
        state.step = "import_amount";
        state.current = 0;
        await bot.sendMessage(state.chatId, `💵 How much SOL should *Wallet #1* use to buy tokens?`, { parse_mode: "Markdown" });
      }
    } catch (err) {
      await bot.sendMessage(state.chatId, "❌ Invalid key. Try again.");
    }
    return;
  }

  if (state.step === "import_amount") {
    const amount = parseFloat(msg.text.trim());
    if (isNaN(amount) || amount <= 0) {
      await bot.sendMessage(state.chatId, "❌ Invalid number. Please try again.");
      return;
    }
    state.amounts.push(amount);
    state.current++;
    if (state.current < state.count) {
      await bot.sendMessage(state.chatId, `💵 How much SOL should *Wallet #${state.current + 1}* use to buy tokens?`, { parse_mode: "Markdown" });
    } else {
      await User.findOneAndUpdate(
        { telegram_id: telegramId },
        { $set: { bundled_wallet_buy_amount: state.amounts } },
      );
      await bot.sendMessage(state.chatId, `💰 Successfully set SOL buy amounts per wallet.`);
      delete importState[telegramId];
    }
    return;
  }
};