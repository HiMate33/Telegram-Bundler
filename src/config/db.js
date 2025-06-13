
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Successful \nDatabase is running ⏳ ... ");
  } catch (err) {
    console.error(
      "Ooops ❌ \nFailed to connect to database 😢. \nCheck whitelisted access or database connection string."
    );
    process.exit(1);
  }
};

module.exports = connectDB;
