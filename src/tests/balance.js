const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const bs58 = require("bs58");

const secretKey = Uint8Array.from([
  108, 21, 143, 211, 58, 75, 126, 232, 129, 80, 235, 79, 54, 219, 65, 240, 219,
  8, 209, 149, 36, 201, 209, 222, 99, 137, 247, 40, 40, 192, 176, 101, 121, 143,
  187, 138, 212, 169, 248, 219, 101, 113, 91, 6, 7, 189, 200, 222, 217, 141, 0,
  15, 213, 247, 164, 43, 131, 238, 201, 243, 31, 157, 146, 70,
]);

const keypair = Keypair.fromSecretKey(secretKey);
const publicKey = keypair.publicKey.toBase58();
const privateKeyBs58 = bs58.encode(keypair.secretKey);

console.log("Public Key:", publicKey);
console.log("Private Key (bs58):", privateKeyBs58);

async function showBalance() {
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const balance = await connection.getBalance(new PublicKey(publicKey));
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");
}