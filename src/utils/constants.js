const BOT_STATE = {
  AWAITING_PRIVATE_KEY: "awaiting_private_key",
  // İhtiyaç duyuldukça diğer durumlar eklenebilir
};

const START_CALLBACK_DATA = {
  AUTO_BUNDLE: "auto_bundle",
  MAIN_WALLET: "main_wallet",
  BUNDLED_WALLETS: "bundled_wallets",
  CREATE_TOKEN: "create_token",
  BUY_TOKENS: "buy_tokens",
  BUNDLED_NETWORK: "bundled_network",
  ACCOUNT_INFO: "account_info",
};

module.exports = {
  BOT_STATE,
  START_CALLBACK_DATA,
};