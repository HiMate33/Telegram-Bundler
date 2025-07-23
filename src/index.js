require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const connectDB = require("./config/db");
const startHandler = require("./bot/start");
const setupCron = require("./jobs/reminderJob")
const setupMonetizeJob = require("./jobs/monetizeJob");

const {volumeMonitor} = require("./handlers/volume"); // <-- add this
connectDB();
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const app = express();


setInterval(()=> {
  volumeMonitor(bot); // <-- add this
}, 60 * 1000)


setupCron(bot);
setupMonetizeJob(bot); 


(async () => {
  try {
    bot.botInfo = await bot.getMe();
    console.log("🤖 Bot username:", bot.botInfo.username);

    startHandler(bot);
    require("./handlers/index")(bot);
  } catch (error) {
    console.error("❌ Failed to initialize bot:", error.message);
    process.exit(1);
  }
})();



//startHandler(bot);
//require("./handlers/index")(bot);

app.use(express.json());

app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on port ${process.env.PORT}`);
}); 