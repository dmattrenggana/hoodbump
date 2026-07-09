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
    if (!isServer) {
      // Alias optional peer deps to false (we don't use these features)
      // These come from Privy + wagmi/connectors optional chains
      config.resolve.alias = {
        ...config.resolve.alias,
        // Tempo chain (we use Robinhood)
        accounts: false,
        // Stripe crypto payments
        '@stripe/crypto': false,
        // Farcaster mini app (Solana)
        '@farcaster/mini-app-solana': false,
        // MetaMask specific EVM connector
        '@metamask/connect-evm': false,
        // Abstract chain
        '@abstract-foundation/agw-client': false,
        // Base account
        '@base-org/account': false,
      }
    }
    return config
  },
}

export default nextConfig
