import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// The agent (agent/main.py) is the source of truth for what it attempted —
// it already writes every payment it sends to this sqlite file. Reading it
// directly is instant and makes no RPC calls, so it can't rate-limit or hang
// like the earlier block-scanning approach did. Tx hashes are still linked
// to arcscan so everything stays independently verifiable onchain.
const DB_PATH = path.join(process.cwd(), "..", "agent", "payments.db");
// payments.db is gitignored (local runtime state), so a fresh clone has no
// db file and nothing to show. payments.seed.json is a committed, static
// export of confirmed payments from a real run — see
// agent/export_payments_seed.py — so judges cloning the repo see real,
// verifiable payments instead of an empty table.
const SEED_PATH = path.join(process.cwd(), "..", "agent", "payments.seed.json");
const MAX_ROWS = 100;

export type PaymentStatus = "sent" | "confirmed" | "failed";

export type Payment = {
  key: string;
  name: string;
  to: `0x${string}`;
  amountUsdc: number;
  timestamp: string; // ISO 8601 UTC
  status: PaymentStatus;
  txHash: `0x${string}` | null;
  reason: string | null;
};

type Row = {
  id: number;
  timestamp: string;
  name: string;
  to_address: string;
  amount_usdc: number;
  status: string;
  tx_hash: string | null;
  reason: string | null;
};

// Confirmed payments (with a working tx hash) lead; failures are real
// operational history but shouldn't crowd out the successful payments a
// demo/judge is meant to see first.
const STATUS_RANK: Record<PaymentStatus, number> = { confirmed: 0, sent: 1, failed: 2 };

function sortPayments(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) => {
    const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rankDiff !== 0) return rankDiff;
    return b.timestamp.localeCompare(a.timestamp); // ISO strings sort chronologically
  });
}

function readFromDb(): Payment[] {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT id, timestamp, name, to_address, amount_usdc, status, tx_hash, reason
         FROM payments_log
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(MAX_ROWS) as Row[];

    return rows.map((row) => ({
      key: String(row.id),
      name: row.name,
      to: row.to_address as `0x${string}`,
      amountUsdc: row.amount_usdc,
      timestamp: `${row.timestamp.replace(" ", "T")}Z`,
      status: row.status as PaymentStatus,
      txHash: row.tx_hash ? (`0x${row.tx_hash}` as `0x${string}`) : null,
      reason: row.reason,
    }));
  } finally {
    db.close();
  }
}

function readFromSeed(): Payment[] {
  return JSON.parse(readFileSync(SEED_PATH, "utf-8")) as Payment[];
}

/** Reads payments from agent/payments.db, falling back to the committed
 * agent/payments.seed.json when the db doesn't exist (fresh clone). Returns
 * an empty list — never throws — if neither is present, so the caller can
 * render "No payments yet" instead of an error. Confirmed payments are
 * sorted first, then pending sends, then failures. */
export function getPayments(): Payment[] {
  if (existsSync(DB_PATH)) return sortPayments(readFromDb());
  if (existsSync(SEED_PATH)) return sortPayments(readFromSeed());
  return [];
}
