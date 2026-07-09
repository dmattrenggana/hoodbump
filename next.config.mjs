import { createRequire } from 'module'
const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    'viem',
    'wagmi',
    '@privy-io/wagmi',
    'permissionless',
    '@wagmi/core',
    '@wagmi/connectors',
  ],
  
  typescript: {
    ignoreBuildErrors: true,
  },
  
  images: {
    unoptimized: true,
  },

  webpack: (config, { isServer }) => {
    // Coinbase SDK aliased to a local stub — Privy tries to use Coinbase Smart
    // Wallet which doesn't support Robinhood Chain (4663). Stub returns a no-op
    // SDK so Privy initializes without crashing. Real Coinbase SDK is never loaded.
    const path = require('path')
    config.resolve.alias = {
      ...config.resolve.alias,
      '@coinbase/wallet-sdk': path.resolve('./lib/coinbase-stub.js'),
      '@walletconnect/ethereum-provider': false,
      '@safe-global/safe-apps-sdk': false,
      '@safe-global/safe-apps-provider': false,
    }

    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        accounts: false,
        '@stripe/crypto': false,
        '@farcaster/mini-app-solana': false,
        '@metamask/connect-evm': false,
        '@abstract-foundation/agw-client': false,
        '@base-org/account': false,
      }
    }
    return config
  },
}

export default nextConfig
// Last rebuilt: 2026-07-09T18:36Z
