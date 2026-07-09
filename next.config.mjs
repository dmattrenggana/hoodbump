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
    // Apply aliases on BOTH server and client since Privy's main
    // index.mjs auto-imports these at module load time
    config.resolve.alias = {
      ...config.resolve.alias,
      // Coinbase SDK — auto-imported by @privy-io/react-auth but
      // Coinbase Smart Wallet doesn't support Robinhood Chain (4663).
      // Stub it out to prevent crashes on init.
      '@coinbase/wallet-sdk': false,
      // WalletConnect — also auto-imported. We use Privy embedded
      // wallets + wagmi, don't need WC provider here.
      '@walletconnect/ethereum-provider': false,
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
