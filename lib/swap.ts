/**
 * 0x Swap API v2 integration for HoodBump
 *
 * Doc: https://docs.0x.org/evm/0x-swap-api/guides/swap-tokens-with-0x-swap-api
 *
 * Quickstart (5 steps):
 *   1. Get 0x API key (https://dashboard.0x.org)
 *   2. GET /swap/allowance-holder/price (indicative, optional)
 *   3. Approve AllowanceHolder contract to spend sellToken
 *   4. GET /swap/allowance-holder/quote (firm quote, includes transaction)
 *   5. Submit transaction.to + transaction.data via wallet
 *
 * Key v2 contract: 0x v2 separates allowance (AllowanceHolder) from
 * execution (Settler). Approve `allowanceTarget` only — never Settler.
 *
 * Required headers:
 *   0x-api-key: <key>
 *   0x-version: v2
 *
 * Required query params:
 *   chainId, sellToken, buyToken, sellAmount, taker
 *
 * Optional: slippageBps, swapFeeRecipient, swapFeeBps, swapFeeToken
 */

import { type Address, type Hex } from "viem"
import {
  ZEROX_API_BASE,
  ZEROX_API_KEY,
  AFFILIATE_FEE_BPS,
  SLIPPAGE_BPS,
  ROBINHOOD_CHAIN_ID_0X,
  HOODBUMP_TREASURY_ADDRESS,
} from "./constants"

const ZEROX_VERSION = "v2"

export interface ZeroXQuote {
  sellToken: Address
  buyToken: Address
  sellAmount: string
  buyAmount: string
  minBuyAmount: string
  gas: string
  gasPrice: string
  allowanceTarget: Address
  liquidityAvailable: boolean
  issues?: {
    allowance?: { spender: Address; actual: string } | null
    balance?: { token: Address; actual: string; expected: string } | null
    simulationIncomplete?: boolean
  }
  transaction: {
    to: Address
    data: Hex
    gas: string
    gasPrice: string
    value: string
  }
  fees?: {
    integratorFee?: { amount: string; token: string; type: string } | null
    zeroExFee?: { amount: string; token: string; type: string } | null
  }
}

/**
 * Get a firm quote from 0x Swap API v2.
 *
 * For Robinhood Chain, the v2 API may not have liquidity for all pairs
 * (0x RFQ focuses on stock tokens). If `liquidityAvailable: false`,
 * throw an error so the bot can rotate to next wallet.
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
    taker: params.takerAddress, // v2 uses 'taker' not 'takerAddress'
    slippageBps: SLIPPAGE_BPS.toString(),

    // HoodBump 1% integrator fee (v2 fee fields)
    swapFeeRecipient: HOODBUMP_TREASURY_ADDRESS,
    swapFeeBps: AFFILIATE_FEE_BPS.toString(),
    swapFeeToken: params.sellToken,
  })

  const url = `${ZEROX_API_BASE}/swap/allowance-holder/quote?${queryParams.toString()}`

  const response = await fetch(url, {
    headers: {
      "0x-api-key": ZEROX_API_KEY,
      "0x-version": ZEROX_VERSION,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const reason = error.message || error.reason || response.statusText
    throw new Error(`0x API error: ${reason}`)
  }

  const quote = (await response.json()) as ZeroXQuote

  if (quote.liquidityAvailable === false) {
    throw new Error("0x API: no liquidity for this pair")
  }

  if (!quote.transaction?.to || !quote.transaction?.data) {
    throw new Error("0x API: response missing transaction field")
  }

  return quote
}

/**
 * Calculate estimated buy amount for a sell (no execution).
 * Uses dummy taker address — does not produce executable transaction.
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
      priceImpact: quote.issues?.simulationIncomplete ? "unknown" : "0",
      buyAmountEstimate: BigInt(quote.buyAmount),
    }
  } catch {
    return { priceImpact: "0", buyAmountEstimate: BigInt(0) }
  }
}

/**
 * Build the swap transaction from a 0x quote.
 * Returns the calldata, target (Settler), value, and gas.
 *
 * Bot wallet must have:
 *   1. Approved `quote.allowanceTarget` (AllowanceHolder) to spend WETH
 *   2. Enough WETH to cover sellAmount
 *   3. Enough ETH for gas
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
 * Format 0x API error for user display.
 */
export function formatZeroXError(error: any): string {
  const message = error?.message || "Unknown error"

  if (message.includes("INSUFFICIENT_ASSET_LIQUIDITY") || message.includes("no liquidity")) {
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
    return "No route found for this swap on Robinhood Chain. Try a different token."
  }

  return message
}
