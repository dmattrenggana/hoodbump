import { createRequire } from 'module'
const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['viem', 'wagmi', '@privy-io/wagmi', 'permissionless'],
  
  typescript: {
    ignoreBuildErrors: true,
  },
  
  images: {
    unoptimized: true,
  },
}

export default nextConfig
