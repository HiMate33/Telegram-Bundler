const cron = require("node-cron");
const { User } = require("../../models/userModel"); // Adjust path if needed

module.exports = (bot) => {
  // Schedule job to run every hour
  cron.schedule("0 * * * *", async () => {
    try {
      const users = await User.find({}); // Fetch all users

      for (const user of users) {
        const name = user.first_name || user.username || "there";
        const message = `👋 Hey ${name}, don’t forget to check out *GhostBundler Bot*! 🚀\n\nManage your wallets, buy tokens, and bundle your strategy smarter!`;

        await bot.sendMessage(user.chat_id, message, {
          parse_mode: "Markdown",
        });
      }

      console.log("✅ Hourly reminder sent to all users");
    } catch (error) {
      console.error("❌ Failed to send hourly notifications:", error.message);
    }
  });
};