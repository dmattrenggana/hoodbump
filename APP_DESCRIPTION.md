# HoodBump

**A volume bump bot for Robinhood Chain tokens.**

HoodBump automates trading volume on Robinhood Chain (chain ID 4663) using 10 encrypted bot wallets that rotate through native ETH → token swaps. The bot creates organic-looking activity by spreading buy transactions across multiple wallets, with each wallet independently funded by the user's smart wallet.

## Key features

- **10 EOA bot wallets per user** — generated server-side, encrypted with AES-256-GCM, stored in Supabase
- **Native ETH swaps** via 0x v2 Settler contract (no WETH wrap, no approvals needed)
- **True round-robin distribution** — swaps cycle through all funded wallets evenly via 0x's `allowance-holder/quote` endpoint
- **Configurable per session** — buy amount ($0.1–$3), swap interval (5s–10min), target token address
- **Live activity feed** — every swap logged on-chain + UI with explorer links
- **Bot wallet dashboard** — view all token holdings, transfer tokens back, or sell them for ETH

## How it works

1. User connects wallet via Privy (Kernel smart wallet)
2. App generates 10 encrypted bot wallets (private keys encrypted at rest)
3. User funds bot wallets with native ETH (covers gas + swap input)
4. User starts a session: picks target token, USD amount per swap, interval
5. Background worker (Railway) polls active sessions, executes swaps via 0x
6. 1% affiliate fee on each swap auto-sent to HoodBump treasury

## Access control

- **Hold gate** — users must hold ≥10M $HOODBUMP tokens to start a session (configurable, currently bypassed until token deployment)
- **Encrypted storage** — bot private keys never leave the server, decrypted in-memory only at signing time
- **Server-side worker** — Railway-hosted process polls Supabase and signs transactions

## Tech stack

- Next.js 16 (App Router) + React 19 + Tailwind v4
- viem for chain interactions, 0x Swap API v2 for routing
- Supabase (Postgres) for bot wallets, sessions, logs
- Privy for auth (Kernel smart wallet) + wagmi
- Railway for background worker (24/7 swap execution)
- Vercel for frontend hosting

## Use case

Token projects on Robinhood Chain use HoodBump to generate consistent on-chain trading volume, increase visibility on block explorers and DEX trackers, and provide organic-looking buy pressure for their token without requiring a centralized market maker.
