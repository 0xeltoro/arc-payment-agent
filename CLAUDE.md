# Arc Payment Agent

Autonomous payments agent on Arc. A vault contract holds USDC with spending
policy enforced onchain; an off-chain Python agent executes payments but
cannot alter policy or withdraw funds.

## Stack
- Contracts: Solidity + Foundry
- Agent: Python 3.11, web3.py
- Dashboard: Next.js (later)

## Network — Arc Testnet
- RPC: https://rpc.testnet.arc.network
- WS: wss://rpc.testnet.arc.network
- Chain ID: 5042002
- Explorer: https://testnet.arcscan.app
- Faucet: https://faucet.circle.com
- Native gas token: USDC
- NOTE: decimals are contested between sources (6 vs 18). Verify empirically
  before relying on any conversion.

## Conventions
- Contracts in src/, tests in test/, deploy scripts in script/
- Agent code in agent/
- Write a test before implementing any contract function
- Never hardcode addresses or keys — use .env
- Never commit .env

## Current state
- [x] Repo initialized
- [x] Wallet funded with testnet USDC
- [x] Foundry project scaffolded
- [x] PaymentVault contract
- [ ] Agent
- [ ] Dashboard
