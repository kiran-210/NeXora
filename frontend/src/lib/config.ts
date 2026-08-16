// NeXora network + contract configuration (Stellar testnet).

export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const RPC_URL = "https://soroban-testnet.stellar.org";

export const CONTRACTS = {
  pool: "CDJ6PB7ZFG4JBEQCJAIQTKEIEYS3GAW2AYQEECDSNNLHSIP6PGUFB4TN",
  collateralManager: "CDN2NQXMAB72NQQV4N5NGYCT752IIGLENMUQ3QHQZ2YOZ7MCFUMG7LOQ",
  usdc: "CCC353VPTJ4DM75ZAFEIEBAPE2XTROQOV4M5XPJZAWRSDJRRQX7GH2O2",
  xlm: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  oracle: "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63",
};

// The test USDC is a Stellar classic asset. Holding/receiving it requires a
// trustline to this issuer (see `enableUsdc`).
export const USDC_CODE = "USDC";
export const USDC_ISSUER = "GAM4TUHIYACHRQQGY2QCGC6BUIMUOQ3UMK3MQS5W7YUHDMRZ2CDKGOWI";

// On-chain fixed-point scale: all amounts use 7 decimals (Stellar precision).
export const SCALE = 10_000_000;

export const SECONDS_PER_YEAR = 31_536_000;

// Protocol parameters (mirror the contract constants for client-side previews).
export const MIN_COLLATERAL_RATIO_BPS = 15_000; // 150%
export const LIQUIDATION_THRESHOLD_BPS = 12_000; // 120%
export const LIQUIDATION_BONUS_BPS = 1_000; // 10%

export const EXPLORER_TX = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const EXPLORER_CONTRACT = (id: string) =>
  `https://stellar.expert/explorer/testnet/contract/${id}`;
