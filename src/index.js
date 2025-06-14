require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const connectDB = require("./config/db");
const startHandler = require("./bot/start");
const setupCron = require("./jobs/reminderJob")

const setupMonetizeJob = require("./jobs/monetizeJob"); // <-- add this
connectDB();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const app = express();

setupCron(bot);

setupMonetizeJob(bot); // <-- add this
startHandler(bot);
require("./handlers/index")(bot);

app.use(express.json());

app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on port ${process.env.PORT}`);
}); 