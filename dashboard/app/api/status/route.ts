import { NextResponse } from "next/server";
import { erc20Abi, vaultAbi } from "@/lib/abi";
import { USDC_ADDRESS, VAULT_ADDRESS } from "@/lib/config";
import { publicClient } from "@/lib/server/client";
import { rpcCall } from "@/lib/server/rpc";

type StatusSnapshot = {
  balance: string;
  maxPerTx: string;
  dailyLimit: string;
  remainingToday: string;
  paused: boolean;
  agent: `0x${string}`;
};

type StatusCacheState = {
  snapshot: StatusSnapshot | null;
};

const globalForStatus = globalThis as unknown as { __statusCache?: StatusCacheState };
const cache: StatusCacheState =
  globalForStatus.__statusCache ?? (globalForStatus.__statusCache = { snapshot: null });

// rpcCall retries 429s with its own backoff (built for the background scan,
// which can afford to wait). A request handler can't sit through that full
// schedule, so a live fetch here is capped at this wall-clock budget; past
// it we fall back to the last good snapshot rather than blocking the page.
const LIVE_FETCH_TIMEOUT_MS = 6_000;

async function fetchLiveStatus(): Promise<StatusSnapshot> {
  const [balance, maxPerTx, dailyLimit, remainingToday, paused, agent] = await Promise.all([
    rpcCall(() =>
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [VAULT_ADDRESS],
      }),
    ),
    rpcCall(() =>
      publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "maxPerTx",
      }),
    ),
    rpcCall(() =>
      publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "dailyLimit",
      }),
    ),
    rpcCall(() =>
      publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "remainingToday",
      }),
    ),
    rpcCall(() =>
      publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "paused",
      }),
    ),
    rpcCall(() =>
      publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "agent",
      }),
    ),
  ]);

  return {
    balance: balance.toString(),
    maxPerTx: maxPerTx.toString(),
    dailyLimit: dailyLimit.toString(),
    remainingToday: remainingToday.toString(),
    paused,
    agent,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("status fetch timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
    // Swallow a late rejection/resolution from the loser of the race so it
    // doesn't surface as an unhandled rejection.
    promise.catch(() => {});
  });
}

export async function GET() {
  try {
    const snapshot = await withTimeout(fetchLiveStatus(), LIVE_FETCH_TIMEOUT_MS);
    cache.snapshot = snapshot;
    return NextResponse.json({ ...snapshot, stale: false });
  } catch (err) {
    console.error("[status] live fetch failed, falling back to cache:", err);
    if (cache.snapshot) {
      return NextResponse.json({ ...cache.snapshot, stale: true });
    }
    // Nothing has ever loaded successfully — there's no snapshot to fall
    // back to, so this is the one case that can't render real data.
    return NextResponse.json(
      { error: "Vault status temporarily unavailable" },
      { status: 503 },
    );
  }
}
