const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const { User } = require("../models/userModel");

module.exports = async function handleBundleCreate(bot, telegramId, chatId, count) {
  const wallets = [];

  for (let i = 0; i < count; i++) {
    const keypair = Keypair.generate();
    const privateKey = bs58.encode(keypair.secretKey);
    const publicKey = keypair.publicKey.toBase58();

    wallets.push({ publicKey, privateKey });

    await bot.sendMessage(chatId, `🧾 Wallet #${i + 1}\n\n🔐 Private Key:\n\`${privateKey}\`\n\n🔓 Public Key:\n\`${publicKey}\``, {
      parse_mode: "Markdown",
    });
  }

  await User.findOneAndUpdate(
    { telegram_id: telegramId },
    { $set: { bundled_wallets: wallets, bundled_wallet_buy_amount: [] } },
    { new: true }
  );

  await bot.sendMessage(chatId, "✅ *Congratulations!* Wallets were created successfully.\n\n📌 *Please save your private keys securely.*", {
    parse_mode: "Markdown",
  });

  // Set individual buy amounts
  askBuyAmounts(bot, telegramId, chatId, wallets.length);
};

async function askBuyAmounts(bot, telegramId, chatId, count) {
  const amounts = [];
  let current = 0;

  const ask = () => {
    if (current >= count) {
      return User.findOneAndUpdate(
        { telegram_id: telegramId },
        { $set: { bundled_wallet_buy_amount: amounts } },
      ).then(() => {
        bot.sendMessage(chatId, `💰 Successfully set SOL buy amounts per wallet.`);
      });
    }

    bot.sendMessage(chatId, `💵 How much SOL should *Wallet #${current + 1}* use to buy tokens?`, {
      parse_mode: "Markdown",
      reply_markup: { force_reply: true },
    }).then(() => {
      bot.once("message", async (reply) => {
        const amount = parseFloat(reply.text);
        if (isNaN(amount) || amount <= 0) {
          await bot.sendMessage(chatId, "❌ Invalid number. Please try again.");
          return ask(); // Retry
        }

        amounts.push(amount);
        current++;
        ask();
      });
    });
  };

  ask();
}
