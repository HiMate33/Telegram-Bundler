console.log("[VERY EARLY DEBUG] src/index.js execution started.");

// Utility function to exit after a short delay, allowing logs to flush
const exitGracefully = (code, message) => {
  if (message) console.error(message);
  console.log(`[DEBUG] Exiting with code ${code} in a moment (from index.js)...`);
  setTimeout(() => process.exit(code), 100); // Delay exit by 100ms
};

const dotenvResult = require("dotenv").config();

if (dotenvResult.error) {
  exitGracefully(1, `❌ Error loading .env file: ${dotenvResult.error.message || dotenvResult.error}`);
} else {
  console.log("[DEBUG] .env file loaded. Parsed variables:", dotenvResult.parsed ? Object.keys(dotenvResult.parsed).join(', ') : "None (or empty file)");
}
console.log("[DEBUG] Initial BOT_TOKEN:", process.env.BOT_TOKEN ? "Exists" : "MISSING");
console.log("[DEBUG] Initial MONGO_URI:", process.env.MONGO_URI ? "Exists (details in db.js)" : "MISSING");

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const connectDB = require("./config/db");
const startHandler = require("./bot/start");

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000; // Default to port 3000 if not specified

if (!BOT_TOKEN) {
  exitGracefully(1, "❌ Error: BOT_TOKEN is not defined in your .env file. Exiting.");
  return; // Stop further execution in this script path
}

const main = async () => {
  try {
    await connectDB(); // Ensure DB is connected before proceeding
    console.log("✅ MongoDB connected successfully. Database is running ⏳.");

    const bot = new TelegramBot(BOT_TOKEN, { polling: true });
    const app = express();

    startHandler(bot);

    // require("./handlers/index")(bot); // Uncomment when you have more handlers

    app.use(express.json());

    // A simple health check endpoint
    app.get("/", (req, res) => {
      res.send("Telegram Bot server is running!");
    });

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log("🤖 Bot started polling...");
    });
  } catch (error) {
    exitGracefully(1, `❌ Failed to start the application: ${error.message || error}`);
  }
};

main();