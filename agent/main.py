"""Autonomous payment agent for the PaymentVault contract on Arc testnet.

Loads a schedule of payments from config.yaml and, on each tick, executes
any payment that is due and passes the vault's onchain spending policy
(checked via canPay before every send). The agent's private key can only
ever call executePayment — it has no ability to alter policy or withdraw
funds outside of it.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sqlite3
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import load_dotenv
from web3 import Web3
from web3.exceptions import ContractLogicError, Web3RPCError

AGENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = AGENT_DIR.parent

load_dotenv(REPO_ROOT / ".env")

DB_PATH = AGENT_DIR / "payments.db"
CONFIG_PATH = AGENT_DIR / "config.yaml"
ABI_PATH = AGENT_DIR / "abi.json"

DEFAULT_TICK_SECONDS = 15

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("agent")


def log_line(name: str, action: str, detail: str = "") -> None:
    log.info("%s | %s | %s", name, action, detail)


SCHEDULE_RE = re.compile(r"^every\s+(\d+)\s+(minute|minutes|hour|hours)$", re.IGNORECASE)


def parse_schedule_seconds(schedule: str) -> int:
    match = SCHEDULE_RE.match(schedule.strip())
    if not match:
        raise ValueError(
            f"unsupported schedule {schedule!r}; expected 'every N minutes' or 'every N hours'"
        )
    n, unit = match.groups()
    n = int(n)
    return n * 60 if unit.lower().startswith("minute") else n * 3600


@dataclass
class Payment:
    name: str
    to: str
    amount_usdc: float
    schedule: str
    interval_seconds: int
    last_run: float | None = None

    @property
    def amount_units(self) -> int:
        return int(round(self.amount_usdc * 10**6))

    def is_due(self, now: float) -> bool:
        return self.last_run is None or (now - self.last_run) >= self.interval_seconds


def load_config() -> tuple[int, list[Payment]]:
    with open(CONFIG_PATH) as f:
        raw = yaml.safe_load(f) or {}

    tick_seconds = int(raw.get("tick_seconds", DEFAULT_TICK_SECONDS))
    payments = []
    for item in raw.get("payments", []):
        payments.append(
            Payment(
                name=item["name"],
                to=Web3.to_checksum_address(item["to"]),
                amount_usdc=float(item["amount_usdc"]),
                schedule=item["schedule"],
                interval_seconds=parse_schedule_seconds(item["schedule"]),
            )
        )
    return tick_seconds, payments


def init_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS payments_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            name TEXT NOT NULL,
            to_address TEXT NOT NULL,
            amount_usdc REAL NOT NULL,
            status TEXT NOT NULL,
            tx_hash TEXT,
            reason TEXT
        )
        """
    )
    conn.commit()
    return conn


def record(
    conn: sqlite3.Connection,
    name: str,
    to: str,
    amount_usdc: float,
    status: str,
    tx_hash: str | None = None,
    reason: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO payments_log (timestamp, name, to_address, amount_usdc, status, tx_hash, reason)
        VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)
        """,
        (name, to, amount_usdc, status, tx_hash, reason),
    )
    conn.commit()


def load_env() -> tuple[str, str | None, str]:
    rpc_url = os.environ.get("ARC_RPC_URL")
    vault_address = os.environ.get("VAULT_ADDRESS")
    agent_private_key = os.environ.get("AGENT_PRIVATE_KEY")

    if not rpc_url:
        raise SystemExit("ARC_RPC_URL is not set in .env")
    if not vault_address:
        raise SystemExit("VAULT_ADDRESS is not set in .env")

    return rpc_url, agent_private_key, vault_address


def connect(rpc_url: str, vault_address: str) -> tuple[Web3, "Contract"]:
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    with open(ABI_PATH) as f:
        abi = json.load(f)
    contract = w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=abi)
    return w3, contract


def explain_skip(contract, to: str, amount_units: int) -> str:
    reasons = []
    try:
        if contract.functions.paused().call():
            reasons.append("vault is paused")
        if not contract.functions.allowedRecipients(to).call():
            reasons.append(f"recipient {to} not allowlisted")
        remaining = contract.functions.remainingToday().call()
        if amount_units > remaining:
            reasons.append(
                f"amount {amount_units} exceeds remainingToday {remaining}"
            )
    except (ContractLogicError, Web3RPCError, ValueError) as exc:
        reasons.append(f"could not fetch reason: {exc}")
    return "; ".join(reasons) if reasons else "canPay returned false (unknown reason)"


def send_payment(
    w3: Web3, contract, account, payment: Payment, conn: sqlite3.Connection
) -> None:
    amount_units = payment.amount_units
    try:
        nonce = w3.eth.get_transaction_count(account.address, "pending")
        tx = contract.functions.executePayment(payment.to, amount_units).build_transaction(
            {
                "from": account.address,
                "nonce": nonce,
                "gasPrice": w3.eth.gas_price,
            }
        )
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        tx_hash_hex = tx_hash.hex()
    except (ContractLogicError, Web3RPCError, ValueError) as exc:
        log_line(payment.name, "failed", f"send error: {exc}")
        record(conn, payment.name, payment.to, payment.amount_usdc, "failed", reason=str(exc))
        return

    log_line(payment.name, "sent", f"tx={tx_hash_hex}")
    record(conn, payment.name, payment.to, payment.amount_usdc, "sent", tx_hash=tx_hash_hex)

    try:
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    except Exception as exc:  # receipt polling can time out or hit a transient RPC error
        log_line(payment.name, "failed", f"no receipt: {exc}")
        record(
            conn,
            payment.name,
            payment.to,
            payment.amount_usdc,
            "failed",
            tx_hash=tx_hash_hex,
            reason=f"no receipt: {exc}",
        )
        return

    if receipt.status == 1:
        log_line(payment.name, "confirmed", f"tx={tx_hash_hex} block={receipt.blockNumber}")
        record(
            conn, payment.name, payment.to, payment.amount_usdc, "confirmed", tx_hash=tx_hash_hex
        )
    else:
        log_line(payment.name, "failed", f"tx={tx_hash_hex} reverted onchain")
        record(
            conn,
            payment.name,
            payment.to,
            payment.amount_usdc,
            "failed",
            tx_hash=tx_hash_hex,
            reason="reverted onchain",
        )


def tick(w3: Web3, contract, account, payments: list[Payment], conn: sqlite3.Connection) -> None:
    now = time.time()
    for payment in payments:
        if not payment.is_due(now):
            continue
        payment.last_run = now

        try:
            can_pay = contract.functions.canPay(payment.to, payment.amount_units).call()
        except (ContractLogicError, Web3RPCError, ValueError) as exc:
            log_line(payment.name, "skipped", f"canPay call failed: {exc}")
            record(
                conn,
                payment.name,
                payment.to,
                payment.amount_usdc,
                "skipped",
                reason=f"canPay call failed: {exc}",
            )
            continue

        if not can_pay:
            reason = explain_skip(contract, payment.to, payment.amount_units)
            log_line(payment.name, "skipped", reason)
            record(conn, payment.name, payment.to, payment.amount_usdc, "skipped", reason=reason)
            continue

        send_payment(w3, contract, account, payment, conn)


def run_dry_run(rpc_url: str, vault_address: str, payments: list[Payment]) -> None:
    log_line("startup", "dry-run", f"rpc={rpc_url} vault={vault_address}")
    w3, contract = connect(rpc_url, vault_address)

    try:
        chain_id = w3.eth.chain_id
        block = w3.eth.block_number
        log_line("startup", "connected", f"chain_id={chain_id} block={block}")
    except Exception as exc:
        log_line("startup", "connect_failed", str(exc))
        return

    for payment in payments:
        try:
            can_pay = contract.functions.canPay(payment.to, payment.amount_units).call()
            reason = "" if can_pay else explain_skip(contract, payment.to, payment.amount_units)
        except (ContractLogicError, Web3RPCError, ValueError) as exc:
            can_pay = False
            reason = f"canPay call failed: {exc}"
        log_line(
            payment.name,
            "preview",
            f"to={payment.to} amount_usdc={payment.amount_usdc} "
            f"schedule={payment.schedule!r} canPay={can_pay} {reason}".strip(),
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="PaymentVault agent")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="parse config, connect, and preview canPay for each payment without sending any tx",
    )
    args = parser.parse_args()

    rpc_url, agent_private_key, vault_address = load_env()
    tick_seconds, payments = load_config()

    if not payments:
        log_line("startup", "warning", "no payments configured")

    if args.dry_run:
        run_dry_run(rpc_url, vault_address, payments)
        return

    if not agent_private_key:
        raise SystemExit("AGENT_PRIVATE_KEY is not set in .env")

    w3, contract = connect(rpc_url, vault_address)
    account = w3.eth.account.from_key(agent_private_key)
    conn = init_db()

    log_line(
        "startup",
        "running",
        f"agent={account.address} vault={vault_address} tick={tick_seconds}s "
        f"payments={[p.name for p in payments]}",
    )

    while True:
        try:
            tick(w3, contract, account, payments, conn)
        except Exception as exc:  # keep the loop alive across transient RPC/node errors
            log_line("loop", "error", str(exc))
        time.sleep(tick_seconds)


if __name__ == "__main__":
    main()
