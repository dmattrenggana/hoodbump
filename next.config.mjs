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
    const stubPath = require.resolve('./stubs/coinbase-wallet-sdk.js')
    // Apply aliases on BOTH server and client since Privy's main
    // index.mjs auto-imports these at module load time
    config.resolve.alias = {
      ...config.resolve.alias,
      // Coinbase SDK — auto-imported by @privy-io/react-auth.
      // Coinbase Smart Wallet doesn't support Robinhood Chain (4663).
      // Catch BOTH the bare import AND the subpath imports
      // (Privy bundles a few: dist/CoinbaseWalletSDK, dist/createCoinbaseWalletSDK, etc.)
      '@coinbase/wallet-sdk$': stubPath,
      '@coinbase/wallet-sdk': stubPath,
      // WalletConnect — also auto-imported. We use Privy embedded
      // wallets + wagmi, don't need WC provider here.
      '@walletconnect/ethereum-provider': false,
      // Safe Apps SDK — wagmi/connectors optional dep we don't use
      '@safe-global/safe-apps-sdk': false,
      '@safe-global/safe-apps-provider': false,
    }

    if (!isServer) {
      // Client-only aliases
      config.resolve.alias = {
        ...config.resolve.alias,
        // Optional peer deps we don't use
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
// Last rebuilt: 2026-07-09T10:58:23Z
