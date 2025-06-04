const mongoose = require("mongoose");

// Utility function to exit after a short delay, allowing logs to flush
const exitGracefully = (code, message) => {
  if (message) console.error(message);
  console.log(`[DEBUG] Exiting with code ${code} in a moment (from db.js)...`);
  setTimeout(() => process.exit(code), 100); // Delay exit by 100ms
};

const connectDB = async () => {
  console.log("[DEBUG] connectDB function called.");
  try {
    const mongoURI = process.env.MONGO_URI;
    // Log only a portion of the URI for security, or just its existence
    console.log("[DEBUG] MONGO_URI in connectDB:", mongoURI ? `Exists (e.g., ${mongoURI.substring(0, mongoURI.indexOf('@') > 0 ? mongoURI.indexOf('@') : 20)}...)` : "MISSING");

    if (!mongoURI) {
      exitGracefully(1, "❌ MONGO_URI not found in .env file (checked inside connectDB). Exiting.");
      return; // Stop further execution in this function
    }

    console.log("[DEBUG] Attempting to connect to MongoDB...");
    await mongoose.connect(mongoURI);
    // If mongoose.connect fails, it throws an error, and this line won't be reached.
    // The success log is already in index.js, which is good.

    // The "MongoDB connected successfully." message is already in your src/index.js
    // If you want it here instead, you can uncomment the line below and remove it from index.js
    // console.log("MongoDB Connected...");
  } catch (err) {
    console.error("❌ MongoDB connection error in connectDB catch block:", err.message);
    console.error("[DEBUG] Full MongoDB connection error object:", err);
    exitGracefully(1, "❌ Exiting due to MongoDB connection error.");
  }
};

module.exports = connectDB;