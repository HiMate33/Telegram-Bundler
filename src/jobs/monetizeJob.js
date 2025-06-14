const cron = require("node-cron");
const { User } = require("../models/userModel");

module.exports = function setupMonetizJob(bot) {
  // Runs every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    try {
      const users = await User.find({});
      const message = `⚡️ *Notice: GhostBundler will be monetized in 30 days!*\n\n*Subscription will be required to access the bot.*\nEarly users may receive special benefits. Stay tuned!`;

      for (const user of users) {
        if (user.chat_id) {
          await bot.sendMessage(user.chat_id, message, { parse_mode: "Markdown" });
        }
      }
      console.log("✅ Monetization notice sent to all users.");
    } catch (err) {
      console.error("❌ Failed to send monetization notice:", err);
    }
  });
};