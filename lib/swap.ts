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
 * High-level NATIVE ETH swap execution.
 *
 * No WETH wrap needed — 0x v2 supports native ETH via the Settler contract.
 * No approve step. Just send ETH value + call data to Settler.
 *
 * Use this when bot wallet has ETH directly (not WETH).
 */
export async function executeEthSwap(params: {
  userAddress: string
  walletIndex: number
  buyToken: Address
  sellAmount: bigint // in wei
}): Promise<{
  success: boolean
  swapHash?: import("viem").Hex
  buyAmount?: bigint
  error?: string
  steps: Array<{ step: string; status: "ok" | "fail" | "info"; detail?: string }>
}> {
  const { userAddress, walletIndex, buyToken, sellAmount } = params
  const steps: Array<{ step: string; status: "ok" | "fail" | "info"; detail?: string }> = []

  try {
    const { signAndSendTransaction, getBotWalletByIndex, getPublicClient } = await import("./bot-wallet")

    steps.push({ step: "load_wallet", status: "info", detail: `Fetching wallet ${walletIndex}` })
    const wallet = await getBotWalletByIndex(userAddress, walletIndex)
    if (!wallet) {
      return { success: false, error: `Bot wallet ${walletIndex} not found`, steps }
    }
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `Wallet ${wallet.address}`

    const publicClient = getPublicClient()

    // Check ETH balance
    steps.push({ step: "check_balance", status: "info", detail: `Reading ETH balance` })
    const ethBalance = await publicClient.getBalance({ address: wallet.address as `0x${string}` })
    if (ethBalance < sellAmount) {
      steps[steps.length - 1].status = "fail"
      steps[steps.length - 1].detail = `Insufficient ETH: ${(Number(ethBalance) / 1e18).toFixed(6)} < ${(Number(sellAmount) / 1e18).toFixed(6)}`
      return {
        success: false,
        error: `Insufficient ETH in wallet ${walletIndex}: ${(Number(ethBalance) / 1e18).toFixed(6)} < ${(Number(sellAmount) / 1e18).toFixed(6)}`,
        steps,
      }
    }
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `ETH: ${(Number(ethBalance) / 1e18).toFixed(6)}`

    // Get quote (0x v2 handles native ETH when sellToken=ETH)
    steps.push({ step: "get_quote", status: "info", detail: `Calling 0x v2 quote (native ETH → buy token)` })
    const quote = await getZeroXQuote({
      sellToken: "ETH" as any, // 0x v2 accepts "ETH" string for native
      buyToken,
      sellAmount,
      takerAddress: wallet.address as `0x${string}`,
    })
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `buyAmount=${(Number(quote.buyAmount) / 1e18).toFixed(6)} gas=${quote.gas}`
    if (quote.issues?.simulationIncomplete) {
      steps.push({ step: "simulation_warning", status: "info", detail: `0x simulation incomplete` })
    }

    // Execute swap (no approve needed for ETH)
    const txParams = buildSwapFromQuote(quote)
    const swapGas = (txParams.gasLimit * 120n) / 100n
    steps.push({ step: "swap", status: "info", detail: `Sending ETH swap tx (gas=${swapGas}, value=${txParams.value})` })
    const swapHash = await signAndSendTransaction(userAddress, walletIndex, {
      to: txParams.to,
      data: txParams.data,
      value: txParams.value, // ETH value
      gas: swapGas,
    })
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `Tx: ${swapHash}`

    // Wait for confirmation
    steps.push({ step: "confirm", status: "info", detail: `Waiting for confirmation` })
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: swapHash,
      confirmations: 1,
    })
    if (receipt.status !== "success") {
      steps[steps.length - 1].status = "fail"
      steps[steps.length - 1].detail = `Swap reverted at block ${receipt.blockNumber}`
      return {
        success: false,
        swapHash,
        error: `Swap reverted at block ${receipt.blockNumber} (gas used: ${receipt.gasUsed})`,
        steps,
      }
    }
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `Block ${receipt.blockNumber}, gas used ${receipt.gasUsed}`

    return {
      success: true,
      swapHash,
      buyAmount: BigInt(quote.buyAmount),
      steps,
    }
  } catch (error: any) {
    const lastStep = steps[steps.length - 1]
    if (lastStep && lastStep.status === "info") {
      lastStep.status = "fail"
      lastStep.detail = error.message?.slice(0, 200) || "Unknown error"
    } else {
      steps.push({ step: "unknown_error", status: "fail", detail: error.message?.slice(0, 200) })
    }
    return { success: false, error: error.message || "Unknown error", steps }
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

/**
 * High-level swap execution for a bot wallet.
 *
 * Handles the full flow:
 *   1. Check WETH balance
 *   2. Get 0x v2 quote (AllowanceHolder)
 *   3. Approve WETH → AllowanceHolder if needed (MAX_UINT256, one-time per wallet)
 *   4. Send swap tx with 20% gas buffer
 *   5. Wait for confirmation
 *
 * Returns structured result for API endpoints + workers.
 */
 *
 * Handles the full flow:
 *   1. Check WETH balance
 *   2. Get 0x v2 quote (AllowanceHolder)
 *   3. Approve WETH → AllowanceHolder if needed (MAX_UINT256, one-time per wallet)
 *   4. Send swap tx with 20% gas buffer
 *   5. Wait for confirmation
 *
 * Returns structured result for API endpoints + workers.
 */
export async function executeBotSwap(params: {
  userAddress: string
  walletIndex: number
  sellToken: Address
  buyToken: Address
  sellAmount: bigint
}): Promise<{
  success: boolean
  approveHash?: import("viem").Hex
  swapHash?: import("viem").Hex
  buyAmount?: bigint
  error?: string
  steps: Array<{ step: string; status: "ok" | "fail" | "info"; detail?: string }>
}> {
  const { userAddress, walletIndex, sellToken, buyToken, sellAmount } = params
  const steps: Array<{ step: string; status: "ok" | "fail" | "info"; detail?: string }> = []

  try {
    const { signAndSendTransaction, getBotWalletByIndex, getPublicClient } = await import("./bot-wallet")
    const { encodeFunctionData } = await import("viem")
    const { RH_WETH_ADDRESS } = await import("./constants")

    steps.push({ step: "load_wallet", status: "info", detail: `Fetching wallet ${walletIndex}` })
    const wallet = await getBotWalletByIndex(userAddress, walletIndex)
    if (!wallet) {
      return { success: false, error: `Bot wallet ${walletIndex} not found`, steps }
    }
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `Wallet ${wallet.address}`

    const publicClient = getPublicClient()

    // Check WETH balance
    steps.push({ step: "check_balance", status: "info", detail: `Reading WETH balance` })
    const wethBalance = (await publicClient.readContract({
      address: RH_WETH_ADDRESS,
      abi: [
        {
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [wallet.address as `0x${string}`],
    })) as bigint

    if (wethBalance < sellAmount) {
      steps[steps.length - 1].status = "fail"
      steps[steps.length - 1].detail = `Insufficient WETH: ${(Number(wethBalance) / 1e18).toFixed(6)} < ${(Number(sellAmount) / 1e18).toFixed(6)}`
      return {
        success: false,
        error: `Insufficient WETH in wallet ${walletIndex}: ${(Number(wethBalance) / 1e18).toFixed(6)} < ${(Number(sellAmount) / 1e18).toFixed(6)}`,
        steps,
      }
    }
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `WETH: ${(Number(wethBalance) / 1e18).toFixed(6)}`

    // Get quote
    steps.push({ step: "get_quote", status: "info", detail: `Calling 0x v2 quote API` })
    const quote = await getZeroXQuote({
      sellToken,
      buyToken,
      sellAmount,
      takerAddress: wallet.address as `0x${string}`,
    })
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `buyAmount=${(Number(quote.buyAmount) / 1e18).toFixed(6)} gas=${quote.gas}`
    if (quote.issues?.simulationIncomplete) {
      steps.push({ step: "simulation_warning", status: "info", detail: `0x simulation incomplete — swap may revert` })
    }

    // Approve if needed
    const txParams = buildSwapFromQuote(quote)
    const allowanceTarget = txParams.allowanceTarget
    steps.push({ step: "check_allowance", status: "info", detail: `Reading allowance → ${allowanceTarget.slice(0, 10)}...` })
    const currentAllowance = (await publicClient.readContract({
      address: RH_WETH_ADDRESS,
      abi: [
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
      ],
      functionName: "allowance",
      args: [wallet.address as `0x${string}`, allowanceTarget],
    })) as bigint

    if (currentAllowance < sellAmount) {
      steps[steps.length - 1].status = "ok"
      steps[steps.length - 1].detail = `Current: ${(Number(currentAllowance) / 1e18).toFixed(6)}, need ${(Number(sellAmount) / 1e18).toFixed(6)} — approving`

      steps.push({ step: "approve", status: "info", detail: `Sending approve tx (MAX_UINT256)` })
      const MAX_UINT256 = (1n << 256n) - 1n
      const approveHash = await signAndSendTransaction(userAddress, walletIndex, {
        to: RH_WETH_ADDRESS,
        data: encodeFunctionData({
          abi: [
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
          ],
          functionName: "approve",
          args: [allowanceTarget, MAX_UINT256],
        }),
        value: 0n,
        gas: 60000n,
      })
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveHash,
        confirmations: 1,
      })
      if (approveReceipt.status !== "success") {
        steps[steps.length - 1].status = "fail"
        steps[steps.length - 1].detail = `Approve reverted (block ${approveReceipt.blockNumber})`
        return { success: false, approveHash, error: "Approve reverted", steps }
      }
      steps[steps.length - 1].status = "ok"
      steps[steps.length - 1].detail = `Block ${approveReceipt.blockNumber}`
    } else {
      steps[steps.length - 1].status = "ok"
      steps[steps.length - 1].detail = `Existing allowance sufficient: ${(Number(currentAllowance) / 1e18).toFixed(6)}`
    }

    // Execute swap
    const swapGas = (txParams.gasLimit * 120n) / 100n
    steps.push({ step: "swap", status: "info", detail: `Sending swap tx (gas=${swapGas})` })
    const swapHash = await signAndSendTransaction(userAddress, walletIndex, {
      to: txParams.to,
      data: txParams.data,
      value: txParams.value,
      gas: swapGas,
    })
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `Tx: ${swapHash}`

    // Wait for confirmation
    steps.push({ step: "confirm", status: "info", detail: `Waiting for confirmation` })
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: swapHash,
      confirmations: 1,
    })
    if (receipt.status !== "success") {
      steps[steps.length - 1].status = "fail"
      steps[steps.length - 1].detail = `Swap reverted at block ${receipt.blockNumber}`
      return {
        success: false,
        approveHash: undefined,
        swapHash,
        error: `Swap reverted at block ${receipt.blockNumber} (gas used: ${receipt.gasUsed})`,
        steps,
      }
    }
    steps[steps.length - 1].status = "ok"
    steps[steps.length - 1].detail = `Block ${receipt.blockNumber}, gas used ${receipt.gasUsed}`

    return {
      success: true,
      swapHash,
      buyAmount: BigInt(quote.buyAmount),
      steps,
    }
  } catch (error: any) {
    const lastStep = steps[steps.length - 1]
    if (lastStep && lastStep.status === "info") {
      lastStep.status = "fail"
      lastStep.detail = error.message?.slice(0, 200) || "Unknown error"
    } else {
      steps.push({ step: "unknown_error", status: "fail", detail: error.message?.slice(0, 200) })
    }
    return { success: false, error: error.message || "Unknown error", steps }
  }
}
