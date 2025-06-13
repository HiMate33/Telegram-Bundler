const { User } = require("../models/userModel");
const fs = require("fs");
const path = require("path");
const bs58 = require("bs58");

const {
  createFungible,
  mplTokenMetadata,
} = require("@metaplex-foundation/mpl-token-metadata");
const {
  createTokenIfMissing,
  findAssociatedTokenPda,
  getSplAssociatedTokenProgramId,
  mintTokensTo,
} = require("@metaplex-foundation/mpl-toolbox");
const {
  createGenericFile,
  percentAmount,
  signerIdentity,
  createSignerFromKeypair,
} = require("@metaplex-foundation/umi");
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { irysUploader } = require("@metaplex-foundation/umi-uploader-irys");
const { base58 } = require("@metaplex-foundation/umi/serializers");

const tempState = {}; // in-memory per-user session

// Renamed `msg` to `callbackQuery` for clarity, as it's passed from an inline button press
module.exports = async function handleCreateToken(bot, callbackQuery) {

  // Correctly access chatId from callbackQuery.message.chat.id
  const chatId = callbackQuery.message.chat.id;
  // userId is the user who pressed the button, correctly accessed from callbackQuery.from.id
  const userId = callbackQuery.from.id; 

  console.log("🔍 Looking for user with telegram_id:", userId);
  tempState[userId] = { step: "name" };
  bot.sendMessage(chatId, "📝 Please enter *Token Name*:", { parse_mode: "Markdown" });

  // The 'msg' parameter in these nested handlers refers to a new Message object from the user's reply
  bot.once("message", async function handleName(msg) {
    if (!msg.text || !tempState[userId] || tempState[userId].step !== "name") return; // Added checks for state
    tempState[userId].name = msg.text;
    tempState[userId].step = "symbol";

    bot.sendMessage(chatId, "🔤 Enter *Token Symbol*:", { parse_mode: "Markdown" });

    bot.once("message", async function handleSymbol(msg) {
      if (!msg.text || !tempState[userId] || tempState[userId].step !== "symbol") return;
      tempState[userId].symbol = msg.text.toUpperCase();
      tempState[userId].step = "amount";

      bot.sendMessage(chatId, "💰 Enter *Total Supply to Mint* (e.g. 1000000):", { parse_mode: "Markdown" });

      bot.once("message", async function handleAmount(msg) {
        if (!msg.text || isNaN(msg.text) || !tempState[userId] || tempState[userId].step !== "amount") return;
        tempState[userId].amount = parseFloat(msg.text);
        tempState[userId].step = "decimals";

        bot.sendMessage(chatId, "🔢 Enter *Decimals* (default is 9):", { parse_mode: "Markdown" });

        bot.once("message", async function handleDecimals(msg) {
          if (!tempState[userId] || tempState[userId].step !== "decimals") return;
          const decimals = msg.text && !isNaN(msg.text) ? parseInt(msg.text) : 9;
          tempState[userId].decimals = decimals;
          tempState[userId].step = "image";

          bot.sendMessage(chatId, "🖼️ Please upload a token image now (as a photo).");

          bot.once("photo", async function handlePhoto(msg) {
            if (!tempState[userId] || tempState[userId].step !== "image") return;
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const file = await bot.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

            tempState[userId].imageUrl = fileUrl;
            tempState[userId].step = "confirm";

            await bot.sendMessage(chatId, "✅ Image uploaded successfully!");

            const summary = `🔧 *Review Token Details:*

- Name: ${tempState[userId].name}
- Symbol: ${tempState[userId].symbol}
- Amount: ${tempState[userId].amount}
- Decimals: ${tempState[userId].decimals}

Click below to *Create Token*
`;
            const confirmButtons = {
              reply_markup: {
                inline_keyboard: [[{ text: "🚀 Create Token", callback_data: "confirm_create_token" }]],
              },
              parse_mode: "Markdown",
            };
            await bot.sendMessage(chatId, summary, confirmButtons);
          });
        });
      });
    });
  });

  bot.on("callback_query", async (cbQuery) => { // Renamed to cbQuery to avoid conflict
    const cbUserId = cbQuery.from.id;
    const cbChatId = cbQuery.message.chat.id;

    if (
      cbQuery.data === "confirm_create_token" &&
      tempState[cbUserId] &&
      tempState[cbUserId].step === "confirm"
    ) {
      const state = tempState[cbUserId];
      // It's important to clear or manage state to prevent re-processing or errors
      // For a more robust solution, consider removing the specific listener or using a more advanced state machine.
      // delete tempState[cbUserId]; // Clear state after processing

      const user = await User.findOne({ telegram_id: cbUserId });
      console.log("User from DB:", user);

      if (!user) {
        await bot.answerCallbackQuery(cbQuery.id);
        return bot.sendMessage(cbChatId, "❌ User not found in DB.");
      }

      if (!user.wallet || !user.wallet.privateKey) {
        console.log("⚠️ Wallet check failed:", user.wallet);
        await bot.answerCallbackQuery(cbQuery.id);
        return bot.sendMessage(cbChatId, "❌ No main wallet found. Please set it first.");
      }

      // Inform user that token creation is in progress
      await bot.answerCallbackQuery(cbQuery.id, { text: "🚀 Creating token..." });
      await bot.sendMessage(cbChatId, "⏳ Creating your token, please wait...");


      const umi = createUmi(user.rpc_provider.url)
        .use(mplTokenMetadata())
        .use(irysUploader());

      const secretKeyBytes = bs58.decode(user.wallet.privateKey);
      const keypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
      const signer = createSignerFromKeypair(umi, keypair);
      umi.use(signerIdentity(signer));

      const imageBuffer = await (await fetch(state.imageUrl)).arrayBuffer();
      const umiImageFile = createGenericFile(Buffer.from(imageBuffer), "token.png", {
        tags: [{ name: "Content-Type", value: "image/png" }],
      });

      const imageUri = await umi.uploader.upload([umiImageFile]);

      const metadata = {
        name: state.name,
        symbol: state.symbol,
        description: `${state.name} created using GhostBundler Bot`,
        image: imageUri[0],
      };

      const metadataUri = await umi.uploader.uploadJson(metadata);

      const mintKepair = umi.eddsa.generateKeypair();
      const mintSigner = createSignerFromKeypair(umi, mintKepair);

      const createFungibleIx = createFungible(umi, {
        mint: mintSigner,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadataUri,
        sellerFeeBasisPoints: percentAmount(0),
        decimals: state.decimals,
      });

      const createTokenIx = createTokenIfMissing(umi, {
        mint: mintSigner.publicKey,
        owner: umi.identity.publicKey,
        ataProgram: getSplAssociatedTokenProgramId(umi),
      });

      const mintTokensIx = mintTokensTo(umi, {
        mint: mintSigner.publicKey,
        token: findAssociatedTokenPda(umi, {
          mint: mintSigner.publicKey,
          owner: umi.identity.publicKey,
        }),
        amount: BigInt(state.amount) * BigInt(10 ** state.decimals),
      });

      try {
        const tx = await createFungibleIx
          .add(createTokenIx)
          .add(mintTokensIx)
          .sendAndConfirm(umi);

        const signature = base58.deserialize(tx.signature)[0];
        const mintAddress = mintSigner.publicKey;
        
        // Construct explorer URLs
        const explorerBaseUrl = user.rpc_provider.url.includes("devnet") 
            ? "https://explorer.solana.com" 
            : "https://explorer.solana.com"; // Adjust for mainnet if needed, or make it configurable
        const networkQueryParam = user.rpc_provider.url.includes("devnet") ? "?cluster=devnet" : "";

        const txUrl = `${explorerBaseUrl}/tx/${signature}${networkQueryParam}`;
        const mintUrl = `${explorerBaseUrl}/address/${mintAddress}${networkQueryParam}`;


        await bot.sendMessage(cbChatId, `✅ Token Created Successfully!\n\nMint Address: \`${mintAddress}\`\n\n🔗 View Transaction\n🔗 View Token Mint`, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        });
        delete tempState[cbUserId]; // Clear state on success
      } catch (err) {
        console.error("❌ Token creation transaction failed:", err);
        await bot.sendMessage(cbChatId, "❌ Token creation failed. Please check your SOL balance and try again.");
        // Optionally, keep state for retry or clear it: delete tempState[cbUserId];
      }
    } else if (cbQuery.data === "confirm_create_token") {
        // Handle cases where state might be missing or incorrect
        console.warn(`⚠️ Received confirm_create_token for user ${cbUserId} but state was not 'confirm' or missing.`);
        await bot.answerCallbackQuery(cbQuery.id, { text: "Session expired or invalid. Please start over.", show_alert: true });
        delete tempState[cbUserId]; // Clean up potentially stale state
    }
    
    // Answer other callback queries if not already answered
    if (!cbQuery.answered && cbQuery.data !== "confirm_create_token") { // Avoid double answering for confirm_create_token
      try {
        await bot.answerCallbackQuery(cbQuery.id);
      } catch (e) {
        // console.error("Error answering CBQ (non-confirm):", e.message);
      }
    }
  });
};
