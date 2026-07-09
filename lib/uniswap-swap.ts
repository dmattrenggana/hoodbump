/**
 * Uniswap V3 swap execution for HoodBump
 *
 * Why not 0x Swap API? On Robinhood Chain (chainId 4663), 0x's RFQ
 * only routes stock-token pairs via Tokka Labs. WETH pairs return
 * "no Route matched" for every quote.
 *
 * Uniswap V3 is the primary AMM on Robinhood Chain (live since launch).
 * We use V3 SwapRouter02 + QuoterV2 directly:
 *   - Quote via static call to QuoterV2.quoteExactInputSingle
 *   - Approve SwapRouter02 to spend WETH (one-time per wallet)
 *   - Execute via SwapRouter02.exactInputSingle
 *
 * Addresses (per Uniswap's Robinhood Chain deployment):
 *   - SwapRouter02:  0xcaf681a66d020601342297493863e78c959e5cb2
 *   - QuoterV2:      0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7
 *   - V3 Factory:    0x1f7d7550b1b028f7571e69a784071f0205fd2efa
 *
 * Doc: https://docs.uniswap.org/contracts/v3/reference/periphery/SwapRouter
 */

import {
  type Address,
  type Hex,
  encodeFunctionData,
  parseEventLogs,
  getAddress,
} from "viem"
import { publicClient } from "./rpc-client"
import {
  RH_WETH_ADDRESS,
  UNISWAP_V3_SWAP_ROUTER_02,
  UNISWAP_V3_QUOTER_V2,
  UNISWAP_V3_FACTORY,
  SLIPPAGE_BPS,
} from "./constants"

const V3_FEE_TIERS = [100, 500, 3000, 10000] as const

const SWAP_ROUTER_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const

const QUOTER_V2_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

const FACTORY_ABI = [
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const

export interface SwapParams {
  sellToken: Address
  buyToken: Address
  amountIn: bigint
  recipient: Address
  /** Slippage in basis points (default 100 = 1%) */
  slippageBps?: number
}

export interface SwapQuote {
  fee: number
  amountOut: bigint
  amountOutMin: bigint
  pool: Address
}

export interface SwapCall {
  /** Approve tx if needed (allowance < amountIn) */
  approve?: { to: Address; data: Hex; value: bigint }
  /** Swap tx */
  swap: { to: Address; data: Hex; value: bigint }
}

/**
 * Find a Uniswap V3 pool for the given token pair, trying each fee tier.
 * Returns the first non-zero pool address.
 */
export async function findPool(
  tokenA: Address,
  tokenB: Address
): Promise<{ fee: number; pool: Address } | null> {
  for (const fee of V3_FEE_TIERS) {
    try {
      const pool = (await publicClient.readContract({
        address: UNISWAP_V3_FACTORY as Address,
        abi: FACTORY_ABI,
        functionName: "getPool",
        args: [tokenA, tokenB, fee],
      })) as Address

      if (pool && pool !== "0x0000000000000000000000000000000000000000") {
        return { fee, pool }
      }
    } catch (err) {
      console.warn(`[findPool] fee ${fee} check failed:`, err)
    }
  }
  return null
}

/**
 * Get a swap quote from Uniswap V3 QuoterV2.
 * QuoterV2 reverts with the result, so we use static call.
 */
export async function getUniswapQuote(
  sellToken: Address,
  buyToken: Address,
  amountIn: bigint
): Promise<SwapQuote> {
  const poolInfo = await findPool(sellToken, buyToken)
  if (!poolInfo) {
    throw new Error(
      `No Uniswap V3 pool found for ${sellToken} -> ${buyToken}`
    )
  }

  // QuoterV2 reverts with result, use try/catch on static call
  let amountOut: bigint
  try {
    amountOut = (await publicClient.readContract({
      address: UNISWAP_V3_QUOTER_V2 as Address,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [sellToken, buyToken, amountIn, poolInfo.fee, 0n],
    })) as bigint
  } catch (err: any) {
    throw new Error(
      `QuoterV2 call failed: ${err.shortMessage || err.message}`
    )
  }

  if (amountOut === 0n) {
    throw new Error("QuoterV2 returned 0 amountOut (no liquidity)")
  }

  const slippage = BigInt(SLIPPAGE_BPS)
  const amountOutMin = amountOut - (amountOut * slippage) / 10_000n

  return {
    fee: poolInfo.fee,
    amountOut,
    amountOutMin,
    pool: poolInfo.pool,
  }
}

/**
 * Build the calldata for a Uniswap V3 swap.
 * Returns approve tx (if needed) + swap tx.
 */
export async function buildSwapTxs(params: SwapParams): Promise<{
  quote: SwapQuote
  calls: SwapCall
}> {
  const slippageBps = params.slippageBps ?? SLIPPAGE_BPS
  const quote = await getUniswapQuote(
    params.sellToken,
    params.buyToken,
    params.amountIn
  )

  // Recompute with custom slippage if different
  const amountOutMin =
    quote.amountOut -
    (quote.amountOut * BigInt(slippageBps)) / 10_000n

  // Check current allowance
  const currentAllowance = (await publicClient.readContract({
    address: params.sellToken,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [params.recipient, UNISWAP_V3_SWAP_ROUTER_02 as Address],
  })) as bigint

  const calls: SwapCall = {
    swap: { to: "0x" as Address, data: "0x" as Hex, value: 0n },
  }

  if (currentAllowance < params.amountIn) {
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [UNISWAP_V3_SWAP_ROUTER_02 as Address, params.amountIn],
    })
    calls.approve = {
      to: params.sellToken,
      data: approveData,
      value: 0n,
    }
  }

  const swapData = encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: params.sellToken,
        tokenOut: params.buyToken,
        fee: quote.fee,
        recipient: params.recipient,
        amountIn: params.amountIn,
        amountOutMin,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })

  calls.swap = {
    to: UNISWAP_V3_SWAP_ROUTER_02 as Address,
    data: swapData,
    value: 0n,
  }

  return { quote, calls }
}
