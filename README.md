# HoodBump

**Trending Bot for Robinhood Chain** 🚀

Automated token bumping for the Robinhood Chain ecosystem.

## Status

🟢 **Phase 1: Foundation** (current)

## What it does

HoodBump is a bot that automatically buys a target token on Robinhood Chain with small, periodic purchases from multiple bot wallets. This drives trading volume and helps tokens trend on aggregators.

## Tech Stack

- **Framework**: Next.js 16 + React 19
- **Blockchain**: Robinhood Chain (chain ID 4663)
- **Auth**: Privy (smart wallets via Account Abstraction)
- **Wallet**: Wagmi + Viem
- **Styling**: Tailwind CSS v4

## Robinhood Chain Details

- **Chain ID**: 4663
- **RPC**: https://rpc.mainnet.chain.robinhood.com
- **Native gas**: ETH
- **Explorer**: https://robinhoodchain.blockscout.com
- **Gas fee waiver**: 90 days from mainnet launch (July 2, 2026)

## Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   # or
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.local.example .env.local
   ```
   Then fill in:
   - `NEXT_PUBLIC_PRIVY_APP_ID` - Get from [dashboard.privy.io](https://dashboard.privy.io)
   - `NEXT_PUBLIC_HOODBUMP_ALCHEMY_URL` (recommended) or use public RPC

3. **Run dev server**:
   ```bash
   pnpm dev
   ```

4. **Open** [http://localhost:3000](http://localhost:3000)

## Roadmap

- [x] **Phase 1: Foundation** - Next.js setup, Privy auth, Robinhood Chain config
- [ ] **Phase 2: Smart Wallets** - 5 bot wallets per user (CDP integration)
- [ ] **Phase 3: Swap Execution** - 0x API integration, swap logic
- [ ] **Phase 4: Bot Automation** - Worker loop, wallet rotation
- [ ] **Phase 5: Polish** - Branding, UX, analytics
- [ ] **Phase 6: Deploy** - Vercel + testnet validation

## License

TBD
