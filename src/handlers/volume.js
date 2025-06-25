const axios = require("axios");
const { User } = require("../models/userModel");

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const headers = { "x-api-key": BIRDEYE_API_KEY };

// Fetch live price and volume data
async function fetchTokenData(mint) {
  try {
    const priceRes = await axios.get(`https://public-api.birdeye.so/public/price?address=${mint}`, { headers });
    const volumeRes = await axios.get(`https://public-api.birdeye.so/public/token/history_price?address=${mint}&interval=5m`, { headers });

    const price = parseFloat(priceRes.data.data.value);
    const volume = parseFloat(volumeRes.data.data.at(-1)?.volume || 0);

    return { price, volume };
  } catch (err) {
    console.error("Birdeye error:", err.message);
    return null;
  }
}

// Display volume tracker menu
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

// Prompt: Add Token
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

// Prompt: Set Condition
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

// Prompt: Remove Token
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

// Show tracked tokens
async function handleMyTokens(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;
  const user = await User.findOne({ telegram_id: telegramId });

  const tokens = user?.volume_tracking?.tokens || [];

  if (!tokens.length) {
    return bot.sendMessage(chatId, "😕 You're not tracking any tokens.");
  }

  let message = `📊 *Tracked Tokens*:\n`;
  tokens.forEach((t, i) => {
    message += `\n${i + 1}. \`${t.mint}\`\n  🔁 Every ${t.interval || 5}min | 📈 ${t.priceThresh || 10}% | 📊 ${t.volThresh || 50}%\n`;
  });

  await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  await bot.answerCallbackQuery(callbackQuery.id);
}

// Toggle alert switch
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

// Handle user's reply message based on temp_input state
async function handleUserReply(bot, msg) {
  const telegramId = msg.from.id;
  const chatId = msg.chat.id;
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

// Monitor prices/volume and alert users
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



/*
const axios = require("axios");
const { User } = require("../models/userModel");

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;

const headers = { "x-api-key": BIRDEYE_API_KEY };

async function fetchTokenData(mint) {
  try {
    const priceRes = await axios.get(`https://public-api.birdeye.so/public/price?address=${mint}`, { headers });
    const volumeRes = await axios.get(`https://public-api.birdeye.so/public/token/history_price?address=${mint}&interval=5m`, { headers });

    const price = parseFloat(priceRes.data.data.value);
    const volume = parseFloat(volumeRes.data.data.at(-1)?.volume || 0);

    return { price, volume };
  } catch (err) {
    console.error("Birdeye error:", err.message);
    return null;
  }
}

async function handleAddToken(bot, msg, args) {
  const telegramId = msg.from.id;
  const mint = args[0];

  if (!mint) return bot.sendMessage(msg.chat.id, "Usage: /addtoken <mint>");

  const user = await User.findOne({ telegram_id: telegramId });
  if (!user) return bot.sendMessage(msg.chat.id, "User not found.");

  if (!user.volume_tracking) user.volume_tracking = { enabled: true, tokens: [] };

  const exists = user.volume_tracking.tokens.find((t) => t.mint === mint);
  if (exists) return bot.sendMessage(msg.chat.id, "Token already being tracked.");

  user.volume_tracking.tokens.push({ mint });
  await user.save();

  bot.sendMessage(msg.chat.id, `✅ Now tracking token: ${mint}`);
}

async function handleSetCondition(bot, msg, args) {
  const [mint, vol, price, interval] = args;
  const telegramId = msg.from.id;

  const user = await User.findOne({ telegram_id: telegramId });
  if (!user?.volume_tracking?.tokens) return bot.sendMessage(msg.chat.id, "Add a token first.");

  const token = user.volume_tracking.tokens.find((t) => t.mint === mint);
  if (!token) return bot.sendMessage(msg.chat.id, "Token not tracked.");

  token.volThresh = parseFloat(vol);
  token.priceThresh = parseFloat(price);
  token.interval = parseInt(interval);
  await user.save();

  bot.sendMessage(msg.chat.id, `⚙️ Conditions updated for ${mint}`);
}

async function handleMyTokens(bot, msg) {
  const user = await User.findOne({ telegram_id: msg.from.id });
  const tokens = user?.volume_tracking?.tokens || [];

  if (!tokens.length) return bot.sendMessage(msg.chat.id, "You aren't tracking any tokens yet.");

  let reply = `📊 Your Tracked Tokens (Alerts: ${user.volume_tracking.enabled ? "ON" : "OFF"}):\n`;
  tokens.forEach(t => {
    reply += `\n- ${t.mint}\n  Volume: ${t.volThresh || 50}%, Price: ${t.priceThresh || 10}%, Every: ${t.interval || 5}min`;
  });

  bot.sendMessage(msg.chat.id, reply);
}

async function handleRemoveToken(bot, msg, args) {
  const telegramId = msg.from.id;
  const mint = args[0];

  const user = await User.findOne({ telegram_id: telegramId });
  if (!user) return;

  user.volume_tracking.tokens = user.volume_tracking.tokens.filter(t => t.mint !== mint);
  await user.save();

  bot.sendMessage(msg.chat.id, "❌ Token removed.");
}

// --- Toggle alerts ---
async function handleAlerts(bot, msg, args) {
  const telegramId = msg.from.id;
  const user = await User.findOne({ telegram_id: telegramId });

  if (!user) return;

  if (!args.length) {
    return bot.sendMessage(msg.chat.id, `🔔 Alerts are: ${user.volume_tracking?.enabled ? "ON" : "OFF"}`);
  }

  user.volume_tracking.enabled = args[0] === "on";
  await user.save();

  bot.sendMessage(msg.chat.id, `🔔 Alerts turned ${args[0].toUpperCase()}`);
}

// --- Background monitor (polls Birdeye) ---
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
  handleAddToken,
  handleSetCondition,
  handleMyTokens,
  handleRemoveToken,
  handleAlerts,
  volumeMonitor
};

*/