import {
  type Address,
  type Hex,
  parseUnits,
  formatUnits,
} from "viem"
import {
  RH_WETH_ADDRESS,
  ZEROX_API_BASE,
  ZEROX_API_KEY,
  AFFILIATE_FEE_BPS,
  SLIPPAGE_BPS,
  ROBINHOOD_CHAIN_ID_0X,
  HOODBUMP_TREASURY_ADDRESS,
  WETH_DECIMALS,
} from "./constants"

/**
 * 0x Swap API integration for HoodBump
 * 
 * Docs: https://0x.org/docs
 * Robinhood Chain support: confirmed (chainId 4663)
 */

export interface ZeroXQuote {
  sellToken: Address
  buyToken: Address
  sellAmount: string
  buyAmount: string
  minBuyAmount: string
  gasPrice: string
  gas: string
  to: Address
  data: Hex
  value: string
  allowanceTarget: Address
  sources: Array<{ name: string; proportion: string }>
  buyTokenAddress: Address
  sellTokenAddress: Address
  estimatedPriceImpact: string
  // Affiliate fee
  fees?: {
    integratorFee?: {
      amount: string
      token: string
    }
  }
}

/**
 * Get a swap quote from 0x
 * 
 * @param params - Swap parameters
 * @returns Quote with transaction data
 */
export async function getZeroXQuote(params: {
  sellToken: Address
  buyToken: Address
  sellAmount: bigint
  takerAddress: Address
}): Promise<ZeroXQuote> {
  if (!ZEROX_API_KEY) {
    throw new Error(
      "ZEROX_API_KEY not set. Get one at https://dashboard.0x.org"
    )
  }

  const queryParams = new URLSearchParams({
    chainId: ROBINHOOD_CHAIN_ID_0X,
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount.toString(),
    takerAddress: params.takerAddress,
    slippageBps: SLIPPAGE_BPS.toString(),

    // HoodBump affiliate fee (1%)
    affiliateAddress: HOODBUMP_TREASURY_ADDRESS,
    affiliateFeeBps: AFFILIATE_FEE_BPS.toString(),
  })

  const url = `${ZEROX_API_BASE}/swap/v1/quote?${queryParams.toString()}`

  const response = await fetch(url, {
    headers: {
      "0x-api-key": ZEROX_API_KEY,
      "0x-version": "v2",
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `0x API error: ${error.message || error.reason || response.statusText}`
    )
  }

  const quote = await response.json()
  return quote as ZeroXQuote
}

/**
 * Calculate USD value for a token amount using 0x price
 * (Approximation using WETH price)
 */
export async function getSwapPriceImpact(
  sellToken: Address,
  buyToken: Address,
  sellAmount: bigint
): Promise<{ priceImpact: string; buyAmountEstimate: bigint }> {
  try {
    // For Robinhood Chain, USDG is the primary stable
    const quote = await getZeroXQuote({
      sellToken,
      buyToken,
      sellAmount,
      takerAddress: "0x0000000000000000000000000000000000000001", // dummy for quote
    })
    return {
      priceImpact: quote.estimatedPriceImpact,
      buyAmountEstimate: BigInt(quote.buyAmount),
    }
  } catch (error) {
    return {
      priceImpact: "0",
      buyAmountEstimate: BigInt(0),
    }
  }
}

/**
 * Build a swap transaction from quote
 * Returns the calldata and target contract for execution
 */
export function buildSwapFromQuote(quote: ZeroXQuote): {
  to: Address
  data: Hex
  value: bigint
  gasLimit: bigint
} {
  return {
    to: quote.to as Address,
    data: quote.data as Hex,
    value: BigInt(quote.value || "0"),
    gasLimit: BigInt(quote.gas),
  }
}

/**
 * Format 0x API error for user display
 */
export function formatZeroXError(error: any): string {
  const message = error?.message || "Unknown error"

  // Common 0x errors
  if (message.includes("INSUFFICIENT_ASSET_LIQUIDITY")) {
    return "Not enough liquidity in the pool. Try a smaller amount or different token."
  }
  if (message.includes("INSUFFICIENT_ETH_FOR_GAS")) {
    return "Bot wallet needs more ETH for gas. Top up your credit."
  }
  if (message.includes("PRICE_IMPACT_TOO_HIGH")) {
    return "Price impact too high. Try a smaller swap amount."
  }
  if (message.includes("TOKEN_NOT_FOUND")) {
    return "Token not found. Check the address is correct."
  }

  return message
}
