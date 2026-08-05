"use client";

import { useEffect, useState } from "react";
import { POLL_INTERVAL_MS } from "@/lib/config";
import { formatUsdc, truncateAddress } from "@/lib/format";
import StatusCard from "./StatusCard";

type StatusResponse = {
  balance: string;
  maxPerTx: string;
  dailyLimit: string;
  remainingToday: string;
  paused: boolean;
  agent: `0x${string}`;
  stale: boolean;
};

export default function VaultStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error(`Status request failed (${res.status})`);
        const data: StatusResponse = await res.json();
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load vault status");
        }
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div>
      {status?.stale && (
        <div className="mb-2 text-xs text-amber-500">
          Showing last known status — live update failed
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatusCard
          label="USDC Balance"
          value={status ? `${formatUsdc(BigInt(status.balance))} USDC` : "…"}
        />
        <StatusCard
          label="Max Per Tx"
          value={status ? `${formatUsdc(BigInt(status.maxPerTx))} USDC` : "…"}
        />
        <StatusCard
          label="Daily Limit"
          value={status ? `${formatUsdc(BigInt(status.dailyLimit))} USDC` : "…"}
        />
        <StatusCard
          label="Remaining Today"
          value={status ? `${formatUsdc(BigInt(status.remainingToday))} USDC` : "…"}
        />
        <StatusCard
          label="Status"
          value={
            status ? (
              <span className={status.paused ? "text-red-400" : "text-emerald-400"}>
                {status.paused ? "paused" : "active"}
              </span>
            ) : (
              "…"
            )
          }
        />
        <StatusCard
          label="Agent"
          value={status ? truncateAddress(status.agent) : "…"}
        />
      </div>
    </div>
  );
}
