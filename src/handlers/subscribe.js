const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } = require("@solana/web3.js");
const bs58 = require("bs58");
const { User } = require("../models/userModel");

const SUBSCRIPTION_PRICE_SOL = 2;
const SUBSCRIPTION_WALLET = "88JiJ298UmqsuUorWbmVnoRNQNd8tTqGRiSyXGhuM4sf"; // Replace this

module.exports = (bot) => {
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const telegramId = query.from.id;
    const action = query.data;

    if (action === "subscribe") {
      return bot.sendMessage(chatId, `💸 Weekly Subscription: *${SUBSCRIPTION_PRICE_SOL} SOL*\n\nAccess premium features like:\n- Copy Trading\n- DEX Arbitrage\n- Bundle Buy/Sell\n- Sniping\n\nClick below to subscribe now.`, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Subscribe Now (2 SOL)", callback_data: "subscribe_now" }],
            [{ text: "⬅️ Cancel", callback_data: "back_to_start" }]
          ]
        }
      });
    }

    if (action === "subscribe_now") {
      const user = await User.findOne({ telegram_id: telegramId });

      if (!user || !user.wallet || !user.wallet.privateKey) {
        return bot.sendMessage(chatId, "❌ You need to connect your main wallet first.");
      }

      const privateKey = bs58.decode(user.wallet.privateKey);
      const keypair = Keypair.fromSecretKey(privateKey);
      const userPublicKey = keypair.publicKey;

      const connection = new Connection("https://api.devnet.solana.com");

      const balance = await connection.getBalance(userPublicKey);
      if (balance < SUBSCRIPTION_PRICE_SOL * LAMPORTS_PER_SOL) {
        return bot.sendMessage(chatId, `❌ You do not have enough SOL to subscribe.\n\nRequired: ${SUBSCRIPTION_PRICE_SOL} SOL\nAvailable: ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
      }

      try {
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: userPublicKey,
            toPubkey: new PublicKey(SUBSCRIPTION_WALLET),
            lamports: SUBSCRIPTION_PRICE_SOL * LAMPORTS_PER_SOL,
          })
        );

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userPublicKey;



        transaction.sign(keypair); // ✅ Proper signing

  const txid = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(txid);

  user.subscribed = true;
  await user.save();

        return bot.sendMessage(chatId, `✅ Subscription successful!\nTXID: \`${txid}\`\n\nYou can now access premium features.`, {
          parse_mode: "Markdown"
        });
      } catch (err) {
        console.error("Subscription TX failed:", err);
        return bot.sendMessage(chatId, "❌ Subscription failed. Please try again later.");
      }
    }
  });
};
