# Arc Payment Agent

**Live demo:** https://arc-payment-agent-beta.vercel.app

An autonomous agent that sends scheduled USDC payments from a vault whose spending policy is enforced onchain, not by the agent itself.

## The problem

Agents that hold funds usually keep their spending limits in their own code — a guard guarding itself. One bad input or a leaked key and the balance is gone.

## How it works

The vault holds USDC. The agent's key can call exactly one function: `executePayment`. The contract checks recipient allowlist, per-tx cap, daily cap and pause on every call. Policy changes, adding recipients and withdrawals are owner-only. A compromised agent key caps damage at one day's limit, to pre-approved addresses.

```text
   owner                                  agent
   |  setPolicy, addRecipient,            |  executePayment(to, amount)
   |  pause/unpause, withdraw             |  <- the only call the agent can make
   v                                      v
           PaymentVault (holds USDC)
```

## Live on Arc testnet

- Contract: [`0xD2e9449646F60Ff7E6ED3f81C7a522C4aB73c076`](https://testnet.arcscan.app/address/0xD2e9449646F60Ff7E6ED3f81C7a522C4aB73c076)
- Example payment executed by the agent: [`0x5bf73fcd7ad8a156aed9ee60d477fdb142bb75b5366247fb0074375865418917`](https://testnet.arcscan.app/tx/0x5bf73fcd7ad8a156aed9ee60d477fdb142bb75b5366247fb0074375865418917)
- USDC predeploy: `0x3600000000000000000000000000000000000000`

## Why Arc

Gas is denominated in USDC, so an agent making hundreds of small payments has predictable costs — no separate gas token to hold or price in. Sub-second finality means the agent knows a payment landed before moving on to the next one.

## Running it

### Contracts

```bash
forge test

# deploy — reads PRIVATE_KEY, USDC_ADDRESS, AGENT_ADDRESS from .env (see .env.example)
source .env
forge script script/DeployPaymentVault.s.sol --rpc-url $ARC_RPC_URL --broadcast
```

### Agent

```bash
cd agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python main.py --dry-run   # preview canPay for each scheduled payment, sends nothing
python main.py             # runs continuously, executing due payments each tick
```

Needs `ARC_RPC_URL`, `VAULT_ADDRESS`, and `AGENT_PRIVATE_KEY` in the repo-root `.env`. The payment schedule itself lives in `agent/config.yaml`, not in `.env` — edit it to add or change payments.

### Dashboard

```bash
cd dashboard
npm install
cp .env.local.example .env.local   # fill in ARC_RPC_URL and NEXT_PUBLIC_VAULT_ADDRESS
npm run dev
```

Open `http://localhost:3000`. Vault status is read live from the chain. Payments are read from `agent/payments.db`, which is gitignored local state — on a fresh clone with no db file yet, the dashboard falls back to the committed `agent/payments.seed.json` so there's still real, verifiable payment history to look at.

## Notes from building

- Arc's native gas balance is 18 decimals; the USDC ERC-20 interface used for payments is 6. Mixing the two up silently produces amounts off by 10^12 — verify decimals empirically per-value, don't assume.
- The public RPC (`rpc.testnet.arc.network`) geo-blocks some regions and rate-limits aggressively. A provider endpoint (Alchemy) is what's actually configured in `.env` for both the agent and the dashboard.
- USDC on Arc testnet is a predeploy at a fixed address (`0x3600...0000`), not a contract anyone deploys — don't go looking for its deployment tx.

## Tests

11 passing Foundry tests (`forge test`):

- payment succeeds within policy limits
- reverts when amount exceeds `maxPerTx`
- reverts when amount exceeds `dailyLimit`
- daily spend counter resets after a day passes
- reverts when recipient is not allowlisted
- reverts when the vault is paused
- reverts when the caller is not the agent
- agent cannot call `setPolicy`
- agent cannot call `addRecipient`
- agent cannot call `withdraw`
- owner can withdraw
