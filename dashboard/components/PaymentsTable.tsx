"use client";

import { useEffect, useState } from "react";
import { ARCSCAN_URL, POLL_INTERVAL_MS } from "@/lib/config";
import { truncateAddress } from "@/lib/format";

type PaymentStatus = "sent" | "confirmed" | "failed";

type Payment = {
  key: string;
  name: string;
  to: `0x${string}`;
  amountUsdc: number;
  timestamp: string;
  status: PaymentStatus;
  txHash: `0x${string}` | null;
  reason: string | null;
};

type PaymentsResponse = {
  payments: Payment[];
  error?: string;
};

function statusColor(status: PaymentStatus): string {
  switch (status) {
    case "confirmed":
      return "text-emerald-400";
    case "failed":
      return "text-red-400";
    default:
      return "text-amber-400";
  }
}

export default function PaymentsTable() {
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/payments");
        if (!res.ok) throw new Error(`Payments request failed (${res.status})`);
        const next: PaymentsResponse = await res.json();
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load payments");
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

  const payments = data?.payments ?? [];
  const loading = !data && !error;
  const softError = !error && data?.error;

  return (
    <div className="rounded-lg border border-zinc-800">
      <div className="border-b border-zinc-800 px-4 py-3">
        <span className="text-sm font-medium text-zinc-300">Payments</span>
      </div>
      {error && <div className="px-4 py-3 text-sm text-red-400">{error}</div>}
      {softError && (
        <div className="px-4 py-3 text-sm text-amber-500">{data.error}</div>
      )}
      {!error && loading && (
        <div className="px-4 py-6 text-center text-sm text-zinc-500">
          Loading…
        </div>
      )}
      {!error && !loading && payments.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-zinc-500">
          No payments yet
        </div>
      )}
      {!error && payments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2 font-normal">Time</th>
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Recipient</th>
                <th className="px-4 py-2 font-normal">Amount</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">Tx</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.key} className="border-t border-zinc-900">
                  <td className="px-4 py-2 text-zinc-400">
                    {new Date(p.timestamp).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "medium",
                    })}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">{p.name}</td>
                  <td className="px-4 py-2 font-mono text-zinc-200">
                    {truncateAddress(p.to)}
                  </td>
                  <td className="px-4 py-2 font-mono text-zinc-200">
                    {p.amountUsdc.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}{" "}
                    USDC
                  </td>
                  <td className={`px-4 py-2 ${statusColor(p.status)}`}>
                    {p.status}
                  </td>
                  <td className="px-4 py-2 font-mono">
                    {p.txHash ? (
                      <a
                        href={`${ARCSCAN_URL}/tx/${p.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-400 transition-colors hover:text-emerald-400"
                      >
                        {truncateAddress(p.txHash)}
                      </a>
                    ) : (
                      <span className="text-zinc-600" title={p.reason ?? undefined}>
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
