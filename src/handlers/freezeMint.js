const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { getMint, setAuthority, AuthorityType } = require("@solana/spl-token");
const bs58 = require("bs58");
const { User } = require("../models/userModel"); // CommonJS import

async function handleFreezeMint(bot, msg, chatId, _userUnused) {
  const telegramId = msg.from.id;

  try {
    const user = await User.findOne({ telegram_id: telegramId });

    if (!user || !user.wallet || !user.wallet.privateKey) {
      return bot.sendMessage(chatId, "❌ No main wallet found. Please set your wallet first using /main_wallet.");
    }

    await bot.sendMessage(chatId, `⚠️ Disabling *Freeze* & *Mint* authority is **irreversible**.

✅ You will no longer be able to:
• Mint new tokens
• Freeze user accounts

🔐 Make sure:
• You are the *original creator* of the token
• You have access to the *creator's private key*

➡️ Please send the *Mint Address* of the token you want to freeze:`, {
      parse_mode: "Markdown"
    });

    bot.once("message", async (msg2) => {
      const mintAddressInput = msg2.text.trim();

      try {
        const mintPublicKey = new PublicKey(mintAddressInput);

        await bot.sendMessage(chatId, `❗️Are you sure you want to disable Mint & Freeze authority for:

\`${mintPublicKey.toBase58()}\`

This action *cannot be undone*.

Type *YES* to confirm.`, {
          parse_mode: "Markdown"
        });

        bot.once("message", async (msg3) => {
          if (msg3.text.trim().toUpperCase() !== "YES") {
            return bot.sendMessage(chatId, "❌ Action cancelled.");
          }

          try {
            const secretKeyBytes = bs58.decode(user.wallet.privateKey);
            const payer = Keypair.fromSecretKey(secretKeyBytes);
            const connection = new Connection(user.rpc_provider.url);

            const mintInfo = await getMint(connection, mintPublicKey);

            // Disable Mint Authority
            if (
              mintInfo.mintAuthority &&
              mintInfo.mintAuthority.toBase58() === payer.publicKey.toBase58()
            ) {
              await setAuthority(
                connection,
                payer,
                mintPublicKey,
                payer.publicKey,
                AuthorityType.MintTokens,
                null
              );
              console.log("✅ Mint Authority disabled");
            }

            // Disable Freeze Authority
            if (
              mintInfo.freezeAuthority &&
              mintInfo.freezeAuthority.toBase58() === payer.publicKey.toBase58()
            ) {
              await setAuthority(
                connection,
                payer,
                mintPublicKey,
                payer.publicKey,
                AuthorityType.FreezeAccount,
                null
              );
              console.log("✅ Freeze Authority disabled");
            }

            await bot.sendMessage(chatId, `✅ Successfully disabled *Mint* & *Freeze* authority for:

\`${mintPublicKey.toBase58()}\``, {
              parse_mode: "Markdown"
            });

          } catch (err) {
            console.error("Error disabling authorities:", err);
            await bot.sendMessage(chatId, `❌ Failed to disable authorities.\n\nError: \`${err.message}\``, {
              parse_mode: "Markdown"
            });
          }
        });

      } catch (err) {
        return bot.sendMessage(chatId, "❌ Invalid mint address. Please try again.");
      }
    });
  } catch (err) {
    console.error("User lookup or Mongo error:", err);
    await bot.sendMessage(chatId, "❌ Unexpected error occurred while retrieving your wallet. Try again later.");
  }
}

module.exports = {
  handleFreezeMint
};
