const { User } = require("../models/userModel");
const bs58 = require("bs58");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
//mainnet-beta

// Game Reward Wallet (holds the SOL for rewards)
const GAME_REWARD_PRIVATE_KEY = process.env.GAME_REWARD_PRIVATE_KEY; // Store securely in .env
const gameRewardKeypair = Keypair.fromSecretKey(bs58.decode(GAME_REWARD_PRIVATE_KEY));



module.exports = (bot) => {
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const telegramId = query.from.id;
    const action = query.data;

    if (action === "referral") {
  let user = await User.findOne({ telegram_id: telegramId });

  // Ensure referral object is initialized
  if (!user.referral) {
    user.referral = {
      code: `ref_${telegramId}`,
      referredBy: null,
      referrals: [],
      earnings: 0,
    };
    await user.save();
  }

  if (!user.referral.code) {
    user.referral.code = `ref_${telegramId}`;
    await user.save();
  }

  const referralLink = `https://t.me/${bot.botInfo.username}?start=${user.referral.code}`;
  const earnings = typeof user.referral.earnings === "number" ? user.referral.earnings.toFixed(3) : "0.000";
  const referralsCount = Array.isArray(user.referral.referrals) ? user.referral.referrals.length : 0;

  const msg = `🎉 *Referral Program*

Share your link and earn *0.001 SOL* when a user joins the bot via your link.

🔗 *Your Referral Link:* 
[${referralLink}](${referralLink})

💰 *Earnings:* ${earnings} SOL
(minimum claimable earnings is 0.2 SOL)

👥 *Referrals Count:* ${referralsCount}`;

  const buttons = [
    [{ text: "👁 View My Referrals", callback_data: "view_referrals" }],
    [{ text: " 💰 Claim Earnings", callback_data: "claim_earnings" }], // Empty button for spacing
    [{ text: "⬅️ Back", callback_data: "back_to_start" }],
  ];

  return bot.sendMessage(chatId, msg, {
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons },
  });
}


    if (action === "view_referrals") {
      const user = await User.findOne({ telegram_id: telegramId });

      if (!user.referral?.referrals?.length) {
        return bot.sendMessage(chatId, "😕 You haven't referred anyone yet.");
      }

      const referredList = await User.find({
        telegram_id: { $in: user.referral.referrals }
      });

      const formatted = referredList
        .map((u, i) => `👤 ${u.first_name || u.username || "Anonymous"} [ID: ${u.telegram_id}]`)
        .join("\n");

      return bot.sendMessage(chatId, `📋 *Referred Users:*\n\n${formatted}`, {
        parse_mode: "Markdown"
      });
    }


    //added 

    if (action === "claim_earnings") {
  const user = await User.findOne({ telegram_id: telegramId });

  const earnings = user.referral?.earnings || 0;

  if (earnings < 0.001) {
    return bot.sendMessage(chatId, "⚠️ You're not eligible to claim earnings yet. Minimum claimable amount is *0.001 SOL*.", {
      parse_mode: "Markdown"
    });
  }

  if (!user.wallet?.publicKey) {
    return bot.sendMessage(chatId, "❌ You don't have a wallet connected to receive your rewards.");
  }

  const userPubKey = new PublicKey(user.wallet.publicKey);
  const lamports = earnings * 1e9;

  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: gameRewardKeypair.publicKey,
        toPubkey: userPubKey,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [gameRewardKeypair]);

    // Set earnings to 0 after success
    user.referral.earnings = 0;
    await user.save();

    return bot.sendMessage(chatId, `✅ *${earnings.toFixed(3)} SOL* has been sent to your wallet!\n\n🔗 [View Transaction](https://solscan.io/tx/${signature})`, {
      parse_mode: "Markdown",
      disable_web_page_preview: false
    });
  } catch (err) {
    console.error("Claim failed:", err);
    return bot.sendMessage(chatId, "❌ Failed to process your claim. Please try again later.");
  }
}
    //added end 

  });
};
