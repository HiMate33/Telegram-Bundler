require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const connectDB = require("./config/db");
const startHandler = require("./bot/start");

// Ensure BOT_TOKEN is defined
if (!process.env.BOT_TOKEN) {
  console.error("FATAL ERROR: BOT_TOKEN is not defined in .env file.");
  process.exit(1);
}

async function startApp() {
  try {
    // Connect to Database and wait for it to complete
    await connectDB();
    // If connectDB was successful and didn't exit, we can log success here
    // (The log in db.js might be commented out or you might prefer it here)
    console.log("✅ MongoDB connected successfully (verified in index.js).");

    const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
    console.log("🤖 Bot started polling..."); // Add log for bot polling
    const app = express();

    // Register handlers
    startHandler(bot);
    require("./handlers/index")(bot);

    app.use(express.json());

    const PORT = process.env.PORT || 3000; // Define PORT once
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("❌ Failed to start the application:", error);
    process.exit(1);
  }
}

startApp();