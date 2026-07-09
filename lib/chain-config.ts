import { defineChain } from "viem"

/**
 * Robinhood Chain (chain ID 4663)
 * 
 * - Arbitrum Orbit L2 built by Robinhood
 * - Mainnet launched: July 2, 2026
 * - 90-day gas fee waiver active
 * - EVM-compatible, ETH as native gas
 * 
 * Docs: https://docs.robinhood.com/chain/
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  network: "robinhood",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      // Public RPC (rate-limited, OK for dev)
      http: ["https://rpc.mainnet.chain.robinhood.com"],
    },
    alchemy: {
      // Alchemy RPC (recommended for production)
      http: [
        process.env.NEXT_PUBLIC_HOODBUMP_ALCHEMY_URL ||
          "https://robinhood-mainnet.g.alchemy.com/v2/",
      ],
      webSocket: [
        process.env.NEXT_PUBLIC_HOODBUMP_WS_URL ||
          "wss://robinhood-mainnet.g.alchemy.com/v2/",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  testnet: false,
  contracts: {
    // Will be added in Phase 3
  },
})

/**
 * Robinhood Chain Testnet (chain ID 46630)
 * For development and testing
 */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  network: "robinhood-testnet",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
})
