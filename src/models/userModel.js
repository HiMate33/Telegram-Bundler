const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const userSchema = new mongoose.Schema({
  telegram_id: { type: Number, required: true, unique: true },
  username: { type: String },
  first_name: { type: String },
  last_name: { type: String },
  is_bot: { type: Boolean, default: false },
  language_code: { type: String },
  chat_id: { type: Number },

  wallet: {
    publicKey: { type: String },
    privateKey: { type: String },
  },


  bundled_wallets: [
  {
    publicKey: { type: String },
    privateKey: { type: String },
  },
],
bundled_wallet_buy_amount: [Number],



  
   
  rpc_provider: {
  name: { type: String, default: "Mainnet Beta" },
  url: { type: String, default: "https://api.mainnet-beta.solana.com" },
},

  // OTHER MODELS
});

const User = mongoose.model("User", userSchema);

module.exports = { User };