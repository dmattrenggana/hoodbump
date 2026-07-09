import { createRequire } from 'module'
const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16 uses Turbopack by default. Empty turbopack config disables
  // the legacy webpack-only build path warnings. We still keep the
  // webpack config below for the Coinbase SDK alias since the stub
  // is critical for Privy initialization.
  turbopack: {},

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
// Last rebuilt: 2026-07-10T00:50Z