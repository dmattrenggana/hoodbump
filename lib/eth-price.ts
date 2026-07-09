/**
 * ETH price oracle using CoinGecko (free, no API key required).
 * 
 * Used to convert USD amounts to ETH for swap amount calculation.
 */

const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
const FALLBACK_PRICE = 3000 // USD per ETH (used if API fails)

let cachedPrice: number | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 30_000 // 30 seconds

/**
 * Get current ETH price in USD.
 * 
 * Caches for 30 seconds to avoid rate limiting.
 * Falls back to $3000 if API fails.
 */
export async function getEthPriceUsd(): Promise<number> {
  const now = Date.now()
  if (cachedPrice && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedPrice
  }

  try {
    const response = await fetch(COINGECKO_API, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    })

    if (!response.ok) throw new Error(`CoinGecko ${response.status}`)

    const data = await response.json()
    const price = data?.ethereum?.usd

    if (typeof price !== "number" || price <= 0) {
      throw new Error("Invalid price data")
    }

    cachedPrice = price
    cacheTimestamp = now
    return price
  } catch (error) {
    console.warn("⚠️ Failed to fetch ETH price, using fallback:", error)
    return FALLBACK_PRICE
  }
}

/**
 * Convert USD amount to ETH wei.
 * 
 * @param usd - Amount in USD
 * @param ethPriceUsd - Current ETH price in USD
 * @returns Amount in wei
 */
export function usdToWei(usd: number, ethPriceUsd: number): bigint {
  if (ethPriceUsd <= 0) throw new Error("Invalid ETH price")
  const eth = usd / ethPriceUsd
  // Use floor + multiply to avoid floating-point issues
  return BigInt(Math.floor(eth * 1e18))
}

/**
 * Convert ETH wei to USD.
 */
export function weiToUsd(wei: bigint, ethPriceUsd: number): number {
  return (Number(wei) / 1e18) * ethPriceUsd
}
