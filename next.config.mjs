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
      // Alias 'accounts' (Tempo SDK) to false - we don't use Tempo chain
      // This prevents webpack from trying to resolve the optional peer dep
      config.resolve.alias = {
        ...config.resolve.alias,
        accounts: false,
        'tempo/connectors/createConnector': false,
      }
    }
    return config
  },
}

export default nextConfig
