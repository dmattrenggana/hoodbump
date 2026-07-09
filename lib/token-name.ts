/**
 * Token metadata lookup with in-memory cache.
 *
 * Used to display friendly token names ("HOODIE", "CLANKHOOD") instead of
 * raw addresses ("0xc72c01aa...") in the activity feed and swap logs.
 *
 * Reads `symbol()` and `decimals()` from the ERC-20 contract on first access.
 * Cache TTL: 1 hour (token metadata rarely changes).
 */
import type { Address } from "viem"
import { createPublicClient, http, erc20Abi } from "viem"
import { robinhoodChain } from "./chain-config"

interface TokenMetadata {
  symbol: string
  decimals: number
  fetchedAt: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const cache = new Map<string, TokenMetadata>()

const NATIVE_ETH: TokenMetadata = {
  symbol: "ETH",
  decimals: 18,
  fetchedAt: Date.now(),
}

export async function getTokenMetadata(
  tokenAddress: Address | "ETH",
  rpcUrl?: string
): Promise<{ symbol: string; decimals: number }> {
  if (tokenAddress === "ETH") return NATIVE_ETH

  const key = tokenAddress.toLowerCase()
  const cached = cache.get(key)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { symbol: cached.symbol, decimals: cached.decimals }
  }

  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl || process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL!),
  })

  try {
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
      }) as Promise<string>,
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }) as Promise<number>,
    ])

    const meta: TokenMetadata = {
      symbol,
      decimals: Number(decimals),
      fetchedAt: Date.now(),
    }
    cache.set(key, meta)
    return { symbol: meta.symbol, decimals: meta.decimals }
  } catch (error: any) {
    // Fallback to truncated address
    console.warn(`Failed to fetch metadata for ${tokenAddress}:`, error.message)
    return {
      symbol: `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`,
      decimals: 18,
    }
  }
}

/**
 * Quick helper: get just the symbol (faster cache hit if already cached).
 */
export function getCachedSymbol(tokenAddress: Address | "ETH"): string | null {
  if (tokenAddress === "ETH") return "ETH"
  const cached = cache.get(tokenAddress.toLowerCase())
  return cached?.symbol || null
}