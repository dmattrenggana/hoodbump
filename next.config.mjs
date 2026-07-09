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
    // Disable Coinbase SDK completely (Privy auto-imports it but we use Kernel wallets)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@coinbase/wallet-sdk': false,
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
