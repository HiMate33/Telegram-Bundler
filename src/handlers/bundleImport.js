const { User } = require("../models/userModel");

module.exports = async function handleBundleImport(bot, telegramId, chatId, count) {
  const wallets = [];
  let current = 0;

  const askForKey = () => {
    if (current >= count) return saveImportedWallets();

    bot.sendMessage(chatId, `📥 Send *private key* for wallet #${current + 1}`, {
      parse_mode: "Markdown",
      reply_markup: { force_reply: true },
    }).then(() => {
      bot.once("message", async reply => {
        const privateKey = reply.text.trim();
        try {
          const bs58 = require("bs58");
          const { Keypair } = require("@solana/web3.js");

          const secretKey = bs58.decode(privateKey);
          const keypair = Keypair.fromSecretKey(secretKey);
          const publicKey = keypair.publicKey.toBase58();

          wallets.push({ publicKey, privateKey });

          await bot.sendMessage(chatId, `🧾 Wallet #${current + 1} Imported\n\n🔐 Private Key:\n\`${privateKey}\`\n\n🔓 Public Key:\n\`${publicKey}\``, {
            parse_mode: "Markdown",
          });

          current++;
          askForKey();
        } catch (err) {
          bot.sendMessage(chatId, "❌ Invalid key. Try again.");
          askForKey();
        }
      });
    });
  };

  const saveImportedWallets = async () => {
    await User.findOneAndUpdate(
      { telegram_id: telegramId },
      { $set: { bundled_wallets: wallets, bundled_wallet_buy_amount: [] } },
    );

    await bot.sendMessage(chatId, `✅ Successfully imported ${count} wallets.\n\n📌 *Please save your private keys securely.*`, {
      parse_mode: "Markdown",
    });

    askBuyAmounts(bot, telegramId, chatId, wallets.length);
  };

  askForKey();
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
          return ask();
        }

        amounts.push(amount);
        current++;
        ask();
      });
    });
  };

  ask();
}
