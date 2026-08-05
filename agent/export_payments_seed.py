"""Exports confirmed payments from payments.db to payments.seed.json.

payments.db is gitignored (local runtime state); payments.seed.json is
committed so a fresh clone of the repo has real, verifiable payment data to
show instead of an empty table. Re-run this after a demo-worthy payment run
to refresh the seed.
"""

import json
import sqlite3
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent
DB_PATH = AGENT_DIR / "payments.db"
SEED_PATH = AGENT_DIR / "payments.seed.json"


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT id, timestamp, name, to_address, amount_usdc, status, tx_hash, reason
        FROM payments_log
        WHERE status = 'confirmed'
        ORDER BY id DESC
        """
    ).fetchall()

    payments = [
        {
            "key": str(row["id"]),
            "name": row["name"],
            "to": row["to_address"],
            "amountUsdc": row["amount_usdc"],
            "timestamp": row["timestamp"].replace(" ", "T") + "Z",
            "status": row["status"],
            "txHash": f"0x{row['tx_hash']}" if row["tx_hash"] else None,
            "reason": row["reason"],
        }
        for row in rows
    ]

    SEED_PATH.write_text(json.dumps(payments, indent=2) + "\n")
    print(f"Wrote {len(payments)} confirmed payment(s) to {SEED_PATH}")


if __name__ == "__main__":
    main()
