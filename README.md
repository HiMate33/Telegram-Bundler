# 🤖 GhostBundler Telegram Bot

GhostBundler is a powerful Telegram bot designed to automate token creation and bundle-buy strategies for the Pump.fun platform on the Solana blockchain.

---

## 🚀 Project Summary

GhostBundler is built to simplify and streamline the process of token interaction on Pump.fun by automating tasks like:

- Creating SPL tokens and uploading metadata to IPFS
- Buying newly launched tokens instantly using bundling strategies
- Managing multiple wallets (main and bundled)
- Setting RPC providers for network optimization

This bot empowers users to operate more efficiently in the fast-paced DeFi token environment using a simple chat interface.

---

## 🔧 Features

- **📦 Bundle Wallets**: Add multiple wallets to execute group buys in one go.
- **🛒 Auto-Buy Tokens**: Automatically detect and purchase new token launches.
- **🆕 Token Creation**: Deploy custom tokens on Solana Devnet using NFT metadata.
- **🌐 RPC Management**: Choose and set Solana RPC providers dynamically.
- **👛 Wallet Control**: Set your main wallet and manage private keys (encrypted in production).
- **📊 Account Overview**: View your connected accounts and wallet info.

---

## 🧠 Technologies Used

- **Node.js** for the backend
- **Telegraf / Node Telegram Bot API** for Telegram bot interactions
- **MongoDB + Mongoose** for user and wallet data persistence
- **Solana Web3.js** for blockchain interactions
- **@metaplex/js** for NFT and metadata handling
- **Pinata API** for IPFS image and metadata storage
- **dotenv** for environment variable management

---


---

## ⚙️ Setup & Installation

### 1. **Clone the Repository**

```bash
git clone https://github.com/your-username/ghostbundler-bot.git
cd ghostbundler-bot


