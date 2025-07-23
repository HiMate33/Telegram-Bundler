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


//Volume starts
volume_tracking: {
    enabled: { type: Boolean, default: true },
    tokens: [
      {
        mint: { type: String },
        volThresh: { type: Number, default: 50 },
        priceThresh: { type: Number, default: 10 },
        interval: { type: Number, default: 5 }, // in minutes
        lastSnapshot: {
          price: { type: Number, default: 0 },
          volume: { type: Number, default: 0 },
        },
      },
    ],
  },
  temp_input: {
  type: Object,
  default: null, // e.g. { type: 'add_token' } or { type: 'set_condition', mint: '...' }
},
  // Volume ends

  // referrals
 referral: {
  code: { type: String },
  referredBy: { type: String },
  referrals: { type: [Number], default: [] },
  earnings: { type: Number, default: 0 },
},

  subscribed: { type: Boolean, default: false },



});

const User = mongoose.model("User", userSchema);

module.exports = { User };