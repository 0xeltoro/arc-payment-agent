// Shared constants safe to import from both client and server code.
// The RPC URL is intentionally NOT here — it lives in lib/server/env.ts and
// must never be exposed to the browser (see lib/server/README notes).

export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ??
  "") as `0x${string}`;

export const USDC_ADDRESS: `0x${string}` =
  "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;

export const ARC_CHAIN_ID = 5042002;
export const ARCSCAN_URL = "https://testnet.arcscan.app";
export const GITHUB_REPO_URL = "https://github.com/0xeltoro/arc-payment-agent";

export const POLL_INTERVAL_MS = 15_000;
