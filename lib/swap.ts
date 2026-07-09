/**
 * 0x Swap API v2 — headless swap with AllowanceHolder.
 *
 * Based on official 0x example:
 *   https://github.com/0xProject/0x-examples/blob/main/swap-v2-allowance-holder-headless-example/index.ts
 *
 * Flow:
 *   1. GET /swap/allowance-holder/price  → check `issues.allowance.spender`
 *   2. Approve spender to spend sellToken (maxUint256) if needed
 *   3. GET /swap/allowance-holder/quote  → get firm quote + transaction
 *   4. sendTransaction({ to, data, value })  → submit
 *
 * Required headers on every call:
 *   0x-api-key: <key>
 *   0x-version: v2
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

function makeHeaders(): HeadersInit {
  if (!ZEROX_API_KEY) {
    throw new Error("ZEROX_API_KEY not set. Get one at https://dashboard.0x.org")
  }
  return {
    "Content-Type": "application/json",
    "0x-api-key": ZEROX_API_KEY,
    "0x-version": ZEROX_VERSION,
  }
}

export interface ZeroXPrice {
  sellToken: Address
  buyToken: Address
  sellAmount: string
  buyAmount: string
  minBuyAmount: string
  gas: string
  gasPrice: string
  allowanceTarget: Address
  liquidityAvailable: boolean
  issues: {
    allowance: { spender: Address; actual: string } | null
    balance: { token: Address; actual: string; expected: string } | null
    simulationIncomplete: boolean
    invalidSourcesPassed: string[]
  }
  fees?: {
    integratorFee?: { amount: string; token: string; type: string } | null
    zeroExFee?: { amount: string; token: string; type: string } | null
  }
}

export interface ZeroXQuote extends ZeroXPrice {
  transaction: {
    to: Address
    data: Hex
    gas: string
    gasPrice: string
    value: string
  }
}

/**
 * Step 1: Get indicative price + check allowance.
 *
 * Returns the price response which includes:
 *   - allowanceTarget: AllowanceHolder contract
 *   - issues.allowance.spender: who to approve (if allowance needed)
 *   - liquidityAvailable: whether pair has a route
 */
export async function getZeroXPrice(params: {
  sellToken: Address
  buyToken: Address
  sellAmount: bigint
}): Promise<ZeroXPrice> {
  const queryParams = new URLSearchParams({
    chainId: ROBINHOOD_CHAIN_ID_0X,
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount.toString(),
  })

  const url = `${ZEROX_API_BASE}/swap/allowance-holder/price?${queryParams.toString()}`
  const response = await fetch(url, { headers: makeHeaders() })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `0x price error: ${error.message || error.reason || response.statusText}`
    )
  }

  const price = (await response.json()) as ZeroXPrice
  if (!price.liquidityAvailable) {
    throw new Error("0x: no liquidity for this pair")
  }
  return price
}

/**
 * Step 3: Get firm quote (after approval). Returns executable transaction.
 *
 * The transaction field IS supposed to be present in the response per
 * official docs. If missing on Robinhood, we'll need a fallback path.
 */
export async function getZeroXQuote(params: {
  sellToken: Address
  buyToken: Address
  sellAmount: bigint
  takerAddress: Address
}): Promise<ZeroXQuote> {
  const queryParams = new URLSearchParams({
    chainId: ROBINHOOD_CHAIN_ID_0X,
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount.toString(),
    taker: params.takerAddress, // v2 uses 'taker' (not 'takerAddress')
    slippageBps: SLIPPAGE_BPS.toString(),

    // HoodBump 1% integrator fee
    swapFeeRecipient: HOODBUMP_TREASURY_ADDRESS,
    swapFeeBps: AFFILIATE_FEE_BPS.toString(),
    swapFeeToken: params.sellToken,
  })

  const url = `${ZEROX_API_BASE}/swap/allowance-holder/quote?${queryParams.toString()}`
  const response = await fetch(url, { headers: makeHeaders() })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `0x quote error: ${error.message || error.reason || response.statusText}`
    )
  }

  const quote = (await response.json()) as ZeroXQuote
  if (!quote.liquidityAvailable) {
    throw new Error("0x: no liquidity for this pair")
  }

  // Validate transaction field — required for execution
  if (!quote.transaction?.to || !quote.transaction?.data) {
    throw new Error(
      "0x v2 response missing transaction field — Robinhood may not support v2 execution yet"
    )
  }

  return quote
}

/**
 * Build calldata for execution.
 * Per official example:
 *   sendTransaction({ to: quote.transaction.to, data: quote.transaction.data, value: ... })
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
    return "Not enough liquidity. Try a smaller amount or different token."
  }
  if (message.includes("INSUFFICIENT_ETH_FOR_GAS")) {
    return "Bot wallet needs more ETH for gas."
  }
  if (message.includes("PRICE_IMPACT_TOO_HIGH")) {
    return "Price impact too high. Try a smaller swap amount."
  }
  if (message.includes("TOKEN_NOT_FOUND")) {
    return "Token not found. Check the address."
  }
  if (message.includes("no Route")) {
    return "No route found for this swap on Robinhood Chain."
  }
  return message
}
