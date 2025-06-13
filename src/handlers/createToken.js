const { User } = require("../models/userModel");
const fs = require("fs");
const path = require("path");
const bs58 = require("bs58");
const fetch = require('node-fetch');
const axios = require('axios');
const FormData = require('form-data');

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

const tempState = {}; 
const userSession = {}; 

async function uploadImageToPinata(imageBuffer, fileName = 'image.png') {
 
  
const PINATA_API_KEY = 'd9805c7dc7dfcc3b8b32';
const PINATA_API_SECRET = 'dbc9a55e0c0d2c4f01ad3d0ffc62fb4996eb5afe4a65a85b112d0dce05b7d383';

  const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;

  const formData = new FormData();
  formData.append('file', imageBuffer, fileName);

  const res = await axios.post(url, formData, {
    maxBodyLength: Infinity,
    headers: {
      ...formData.getHeaders(),
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
  });

  return res.data.IpfsHash; 
}

module.exports = async function handleCreateToken(bot, callbackQuery) {

  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id; 

  console.log("🔍 Looking for user with telegram_id:", userId);
  tempState[userId] = { step: "name" };
  bot.sendMessage(chatId, "📝 Please enter *Token Name*:", { parse_mode: "Markdown" });

  bot.once("message", async function handleName(msg) {
    if (!msg.text || !tempState[userId] || tempState[userId].step !== "name") return; 
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

  bot.on("callback_query", async (cbQuery) => {
    const cbUserId = cbQuery.from.id;
    const cbChatId = cbQuery.message.chat.id;

    if (
      cbQuery.data === "confirm_create_token" &&
      tempState[cbUserId] &&
      tempState[cbUserId].step === "confirm"
    ) {
      const state = tempState[cbUserId];
    

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
      await bot.answerCallbackQuery(cbQuery.id, { text: "🚀 Creating token..." });
      await bot.sendMessage(cbChatId, "⏳ Creating your token, please wait...");


      const umi = createUmi(user.rpc_provider.url)
        .use(mplTokenMetadata())
        .use(irysUploader());

      const secretKeyBytes = bs58.decode(user.wallet.privateKey);
      const keypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
      const signer = createSignerFromKeypair(umi, keypair);
      umi.use(signerIdentity(signer));

      try {
        const response = await fetch(state.imageUrl);
        const imageBuffer = await response.buffer();

        const ipfsHash = await uploadImageToPinata(imageBuffer, 'token.png');
        const imageUri = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

        const metadata = {
          name: state.name,
          symbol: state.symbol,
          description: `${state.name} created using GhostBundler Bot`,
          image: imageUri,
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
       
          const explorerBaseUrl = user.rpc_provider.url.includes("devnet") 
              ? "https://explorer.solana.com" 
              : "https://explorer.solana.com"; 
          const networkQueryParam = user.rpc_provider.url.includes("devnet") ? "?cluster=devnet" : "";

          const txUrl = `${explorerBaseUrl}/tx/${signature}${networkQueryParam}`;
          const mintUrl = `${explorerBaseUrl}/address/${mintAddress}${networkQueryParam}`;


          await bot.sendMessage(cbChatId, `✅ Token Created Successfully!\n\nMint Address: \`${mintAddress}\`\n\n🔗 View Transaction\n🔗 View Token Mint`, {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          });
          delete tempState[cbUserId]; 
        } catch (err) {
          console.error("❌ Token creation transaction failed:", err);
          await bot.sendMessage(cbChatId, "❌ Token creation failed. Please check your SOL balance and try again.");
          
        }
      } catch (err) {
        console.error("❌ Failed to fetch or upload image:", err);
        await bot.sendMessage(cbChatId, "❌ Failed to upload image. Please try again.");
        return;
      }
    } else if (cbQuery.data === "confirm_create_token") {
        console.warn(`⚠️ Received confirm_create_token for user ${cbUserId} but state was not 'confirm' or missing.`);
        await bot.answerCallbackQuery(cbQuery.id, { text: "Session expired or invalid. Please start over.", show_alert: true });
        delete tempState[cbUserId]; 
    }
    
    if (!cbQuery.answered && cbQuery.data !== "confirm_create_token") { 
      try {
        await bot.answerCallbackQuery(cbQuery.id);
      } catch (e) {
      }
    }
  });

  bot.on('photo', async (msg) => {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(fileUrl);
    const imageBuffer = await response.buffer();

    const ipfsHash = await uploadImageToPinata(imageBuffer, 'token.png');
    const imageUri = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

    userSession[msg.chat.id] = { ...userSession[msg.chat.id], imageUri };


  });

  bot.onText(/\/create_token/, async (msg) => {
    const imageUri = userSession[msg.chat.id]?.imageUri;
    if (!imageUri) {
      await bot.sendMessage(msg.chat.id, "❌ No image found. Please upload an image first.");
      return;
    }
  });
};
