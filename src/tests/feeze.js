import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getMint,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import bs58 from "bs58";

// Replace with your base58-encoded private key string
const base58PrivateKey = "34sP7iU74k1rDuHUXdkVHbsNyisAQSno4L53nut3bzTVWdNfGzK5QNFiGt4uQ8Bsc1PgGBkxzUuQmgVoi7Yp9guj";

// Decode it to a Uint8Array
const payer = Keypair.fromSecretKey(bs58.decode(base58PrivateKey));

// Your connection and mint setup
const connection = new Connection(clusterApiUrl("devnet"));
const mintPublicKey = new PublicKey("9zSfuqXxWVs6yk1bXynHgQJLUdRwuSEuGmXs2SUg7RWH");

async function disableAuthorities() {
  console.log("Fetching mint info...");
  const mint = await getMint(connection, mintPublicKey);
  console.log("Current Mint Authority:", mint.mintAuthority?.toBase58());
  console.log("Current Freeze Authority:", mint.freezeAuthority?.toBase58());

  if (mint.mintAuthority) {
    console.log("Disabling Mint Authority...");
    await setAuthority(
      connection,
      payer,               // Fee payer and signer
      mintPublicKey,
      payer.publicKey,     // Current authority
      AuthorityType.MintTokens,
      null                 // Set to null to disable
    );
  }

  // Disable Freeze Authority
  if (mint.freezeAuthority) {
    console.log("Disabling Freeze Authority...");
    await setAuthority(
      connection,
      payer,
      mintPublicKey,
      payer.publicKey,
      AuthorityType.FreezeAccount,
      null
    );
  }

  console.log("Authorities disabled!");
}

disableAuthorities().catch(console.error);

