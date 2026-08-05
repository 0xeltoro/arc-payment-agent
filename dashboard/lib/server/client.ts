import "server-only";
import { createPublicClient, defineChain, http } from "viem";
import { ARC_CHAIN_ID } from "@/lib/config";
import { RPC_URL } from "./env";

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(RPC_URL),
});
