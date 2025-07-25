const axios = require("axios");
const { User } = require("../models/userModel");

const BIRDEYE_API_KEY = "d8ff109a1d4a43ec9b0dcd623f83f13e";
const headers = { "x-api-key": BIRDEYE_API_KEY };

async function fetchTokenData(mint) {
  try {
    const pageSize = 50;
    const maxPages = 20;
    for (let page = 0; page < maxPages; page++) {
      const options = {
        method: 'GET',
        url: 'https://public-api.birdeye.so/defi/tokenlist',
        params: {
          sort_by: 'v24hUSD',
          sort_type: 'desc',
          offset: (page * pageSize).toString(),
          limit: pageSize.toString(),
          min_liquidity: '0'
        },
        headers: {
          accept: 'application/json',
          'x-chain': 'solana',
          'x-api-key': BIRDEYE_API_KEY
        }
      };

      const res = await axios.request(options);
      const tokens = res.data.data.tokens;
      const token = tokens.find(t => t.address === mint);
      if (token) {
        return {
          symbol: token.symbol,
          name: token.name,
          price: token.price,
          volume: token.v24hUSD,
          marketCap: token.mc
        };
      }
      if (tokens.length < pageSize) break;
    }
    return null;
  } catch (err) {
    console.error("Birdeye error:", err.message);
    return null;
  }
}

async function handleVolumeMenu(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;

  const user = await User.findOne({ telegram_id: telegramId });
  const enabled = user?.volume_tracking?.enabled !== false;

  const msg = `📊 *Volume Tracker Menu*\n\nAlerts: *${enabled ? "ON" : "OFF"}*\nSelect an action below:`;

  const buttons = [
    [
      { text: "➕ Add Token", callback_data: "volume_add" },
      { text: "⚙️ Set Condition", callback_data: "volume_condition" }
    ],
    [
      { text: "📄 My Tokens", callback_data: "volume_list" },
      { text: "❌ Remove Token", callback_data: "volume_remove" }
    ],
    [
      { text: enabled ? "🔕 Disable Alerts" : "🔔 Enable Alerts", callback_data: "volume_alerts_toggle" }
    ]
  ];

  await bot.sendMessage(chatId, msg, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons }
  });

  await bot.answerCallbackQuery(callbackQuery.id);
}

async function promptAddToken(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;

  await User.findOneAndUpdate(
    { telegram_id: telegramId },
    { temp_input: { type: "add_token" } }
  );

  await bot.sendMessage(chatId, "🆕 Please enter the token mint address you want to track.");
  await bot.answerCallbackQuery(callbackQuery.id);
}

async function promptSetCondition(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;

  await User.findOneAndUpdate(
    { telegram_id: telegramId },
    { temp_input: { type: "set_condition" } }
  );

  await bot.sendMessage(chatId, "⚙️ Please enter in the format:\n\n`mint volume% price% interval_minutes`\n\nExample:\n`6eNUb... 50 10 5`", {
    parse_mode: "Markdown"
  });

  await bot.answerCallbackQuery(callbackQuery.id);
}

async function promptRemoveToken(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;

  await User.findOneAndUpdate(
    { telegram_id: telegramId },
    { temp_input: { type: "remove_token" } }
  );

  await bot.sendMessage(chatId, "❌ Please enter the mint address of the token you want to remove.");
  await bot.answerCallbackQuery(callbackQuery.id);
}
async function handleMyTokens(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;
  const user = await User.findOne({ telegram_id: telegramId });

  const tokens = user?.volume_tracking?.tokens || [];

  if (!tokens.length) {
    return bot.sendMessage(chatId, "😕 You're not tracking any tokens.");
  }

  let message = `📊 *Tracked Tokens*:\n`;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const data = await fetchTokenData(t.mint);

    if (data) {
      message += `\n${i + 1}. \`${t.mint}\`\n`;
      message += `  🏷️ *${data.name}* (${data.symbol})\n`;
      message += `  💲 Price: $${data.price?.toLocaleString(undefined, {maximumFractionDigits: 6})}\n`;
      message += `  📊 Volume(24h): $${data.volume?.toLocaleString(undefined, {maximumFractionDigits: 2})}\n`;
      message += `  🏦 Market Cap: $${data.marketCap?.toLocaleString(undefined, {maximumFractionDigits: 2})}\n`;
    } else {
      message += `\n${i + 1}. \`${t.mint}\`\n  ⚠️ Token data not found\n`;
    }
    message += `  🔁 Every ${t.interval || 5}min | 📈 ${t.priceThresh || 10}% | 📊 ${t.volThresh || 50}%\n`;
  }

  await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  await bot.answerCallbackQuery(callbackQuery.id);
}

async function toggleAlerts(bot, callbackQuery) {
  const telegramId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;
  const user = await User.findOne({ telegram_id: telegramId });

  user.volume_tracking.enabled = !user.volume_tracking.enabled;
  await user.save();

  await bot.sendMessage(chatId, `🔔 Alerts are now *${user.volume_tracking.enabled ? "ON" : "OFF"}*`, {
    parse_mode: "Markdown"
  });

  return handleVolumeMenu(bot, callbackQuery);
}

async function handleUserReply(bot, msg) {
  const telegramId = msg.from.id;
  const chatId = msg.chat.id;
  if (!msg.text) return;
  const text = msg.text.trim();

  const user = await User.findOne({ telegram_id: telegramId });
  const state = user?.temp_input;

  if (!state) return;

  if (state.type === "add_token") {
    const mint = text;

    const exists = user.volume_tracking.tokens?.some(t => t.mint === mint);
    if (exists) {
      user.temp_input = null;
      await user.save();
      return bot.sendMessage(chatId, "⚠️ Token already being tracked.");
    }

    user.volume_tracking.tokens.push({ mint });
    user.temp_input = null;
    await user.save();

    return bot.sendMessage(chatId, `✅ Now tracking token: ${mint}`);
  }

  if (state.type === "set_condition") {
    const [mint, vol, price, interval] = text.split(/\s+/);

    const token = user.volume_tracking.tokens.find(t => t.mint === mint);
    if (!token) {
      user.temp_input = null;
      await user.save();
      return bot.sendMessage(chatId, "❌ Token not found. Please add it first.");
    }

    token.volThresh = parseFloat(vol);
    token.priceThresh = parseFloat(price);
    token.interval = parseInt(interval);
    user.temp_input = null;
    await user.save();

    return bot.sendMessage(chatId, `⚙️ Conditions updated for ${mint}`);
  }

  if (state.type === "remove_token") {
    const mint = text;
    const initialLength = user.volume_tracking.tokens.length;

    user.volume_tracking.tokens = user.volume_tracking.tokens.filter(t => t.mint !== mint);
    user.temp_input = null;
    await user.save();

    if (user.volume_tracking.tokens.length === initialLength) {
      return bot.sendMessage(chatId, "⚠️ Token not found or already removed.");
    }

    return bot.sendMessage(chatId, `❌ Token removed: ${mint}`);
  }
}
async function volumeMonitor(bot) {
  const users = await User.find({ "volume_tracking.enabled": true });

  for (const user of users) {
    for (const token of user.volume_tracking.tokens) {
      const { mint, volThresh = 50, priceThresh = 10, lastSnapshot = {} } = token;

      const data = await fetchTokenData(mint);
      if (!data) continue;

      const { price, volume } = data;
      const oldPrice = lastSnapshot.price || price;
      const oldVol = lastSnapshot.volume || volume;

      const priceChange = ((price - oldPrice) / oldPrice) * 100;
      const volChange = ((volume - oldVol) / oldVol) * 100;

      if (Math.abs(priceChange) >= priceThresh || Math.abs(volChange) >= volThresh) {
        await bot.sendMessage(user.chat_id, `🚨 *Alert for ${mint}*\n` +
          `Price: ${oldPrice.toFixed(6)} → ${price.toFixed(6)} (${priceChange.toFixed(2)}%)\n` +
          `Volume: ${oldVol.toFixed(2)} → ${volume.toFixed(2)} (${volChange.toFixed(2)}%)`, {
          parse_mode: "Markdown"
        });
      }

      token.lastSnapshot = { price, volume };
    }

    await user.save();
  }
}

module.exports = {
  handleVolumeMenu,
  promptAddToken,
  promptSetCondition,
  promptRemoveToken,
  handleMyTokens,
  toggleAlerts,
  handleUserReply,
  volumeMonitor
};


