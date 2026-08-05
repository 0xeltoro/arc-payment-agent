import "server-only";
import { VAULT_ADDRESS } from "@/lib/config";

// ARC_RPC_URL is deliberately NOT prefixed with NEXT_PUBLIC_ — the configured
// endpoint is an Alchemy URL with an API key in the path, so it's used
// server-side only (see lib/server/rpc.ts). Never rename this to a
// NEXT_PUBLIC_ variable; that would ship the key to every visitor.
export const RPC_URL = process.env.ARC_RPC_URL as string;

if (!RPC_URL) {
  throw new Error(
    "Missing ARC_RPC_URL — copy dashboard/.env.local.example to dashboard/.env.local and fill it in.",
  );
}

if (!VAULT_ADDRESS) {
  throw new Error(
    "Missing NEXT_PUBLIC_VAULT_ADDRESS — copy dashboard/.env.local.example to dashboard/.env.local and fill it in.",
  );
}
