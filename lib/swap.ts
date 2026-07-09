import {
  type Address,
  type Hex,
} from "viem"
import {
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
 * Docs: https://0x.org/docs/evm/0x-swap-api/introduction
 *
 * Uses the new allowance-holder/quote endpoint (v2):
 *   GET https://api.0x.org/swap/allowance-holder/quote?chainId=...
 *
 * Required headers:
 *   0x-api-key: <key>
 *   0x-version: v2
 *
 * Fee structure (integrator fee):
 *   swapFeeRecipient + swapFeeBps + swapFeeToken
 *
 * Response shape (v2):
 *   { transaction: { to, data, value, gas }, buyAmount, minBuyAmount, ... }
 */

export interface ZeroXQuote {
  sellToken: Address
  buyToken: Address
  sellAmount: string
  buyAmount: string
  minBuyAmount: string
  gasPrice: string
  gas: string
  estimatedPriceImpact: string
  sources: Array<{ name: string; proportion: string }>
  allowanceTarget: Address
  transaction: {
    to: Address
    data: Hex
    value: string
    gas: string
  }
  fees?: {
    integratorFee?: {
      amount: string
      token: string
    }
  }
}

/**
 * Get a swap quote from 0x Swap API v2 (allowance-holder).
 *
 * The bot wallet must:
 *   1. Hold WETH (sellToken) — at least sellAmount
 *   2. Hold ETH — for gas
 *   3. Approve the 0x allowanceTarget to spend its WETH before executing
 */
export async function getZeroXQuote(params: {
  sellToken: Address
  buyToken: Address
  sellAmount: bigint
  takerAddress: Address
}): Promise<ZeroXQuote> {
  if (!ZEROX_API_KEY) {
    throw new Error("ZEROX_API_KEY not set. Get one at https://dashboard.0x.org")
  }

  const queryParams = new URLSearchParams({
    chainId: ROBINHOOD_CHAIN_ID_0X,
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount.toString(),
    takerAddress: params.takerAddress,
    slippageBps: SLIPPAGE_BPS.toString(),

    // HoodBump 1% integrator fee — paid in WETH
    swapFeeRecipient: HOODBUMP_TREASURY_ADDRESS,
    swapFeeBps: AFFILIATE_FEE_BPS.toString(),
    swapFeeToken: params.sellToken,
  })

  const url = `${ZEROX_API_BASE}/swap/allowance-holder/quote?${queryParams.toString()}`

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

  const quote = (await response.json()) as ZeroXQuote

  // v2 wraps tx data under .transaction
  if (!quote.transaction) {
    throw new Error("0x API response missing transaction field")
  }

  return quote
}

/**
 * Calculate USD value for a token amount using 0x price
 */
export async function getSwapPriceImpact(
  sellToken: Address,
  buyToken: Address,
  sellAmount: bigint
): Promise<{ priceImpact: string; buyAmountEstimate: bigint }> {
  try {
    const quote = await getZeroXQuote({
      sellToken,
      buyToken,
      sellAmount,
      takerAddress: "0x0000000000000000000000000000000000000001",
    })
    return {
      priceImpact: quote.estimatedPriceImpact,
      buyAmountEstimate: BigInt(quote.buyAmount),
    }
  } catch {
    return { priceImpact: "0", buyAmountEstimate: BigInt(0) }
  }
}

/**
 * Build a swap transaction from quote.
 * Returns the calldata, target, value, and gas limit for execution.
 */
export function buildSwapFromQuote(quote: ZeroXQuote): {
  to: Address
  data: Hex
  value: bigint
  gasLimit: bigint
  allowanceTarget: Address
} {
  return {
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: BigInt(quote.transaction.value || "0"),
    gasLimit: BigInt(quote.transaction.gas || quote.gas || "300000"),
    allowanceTarget: quote.allowanceTarget,
  }
}

/**
 * Format 0x API error for user display
 */
export function formatZeroXError(error: any): string {
  const message = error?.message || "Unknown error"

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
  if (message.includes("no Route")) {
    return "No route found for this swap. Token may have no liquidity."
  }

  return message
}
