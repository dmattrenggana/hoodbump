"use client"

import { useState, useCallback, useRef } from "react"
import { useSendTransaction } from "@privy-io/react-auth"
import { encodeFunctionData, type Address, parseUnits } from "viem"
import { RH_WETH_ADDRESS } from "@/lib/constants"
import { useUserBalances } from "./use-token-balance"

export interface BotWalletToFund {
  id: string
  address: Address
  walletIndex: number
}

export interface FundConfig {
  /** Number of wallets to fund (1-10) */
  walletCount: number
  /** ETH per wallet (e.g., "0.0001") */
  ethAmount: string
  /** WETH per wallet (e.g., "0.0003") */
  wethAmount: string
  /** Skip wallets that already have ≥ this much ETH (default: ethAmount) */
  skipIfFunded?: boolean
}

export interface FundStepResult {
  walletIndex: number
  walletAddress: Address
  type: "eth" | "weth-approve" | "weth-transfer"
  hash: `0x${string}`
  status: "success" | "error"
  error?: string
}

export interface FundProgress {
  current: number
  total: number
  step: "eth" | "weth-approve" | "weth-transfer" | "done"
  walletIndex: number
  message: string
}

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
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
] as const

/**
 * Fund bot wallets from the user's connected smart wallet.
 *
 * Flow per wallet:
 *   1. Send ETH transfer (smart wallet → bot wallet)
 *   2. Send WETH transfer (smart wallet → bot wallet)
 *
 * Each step = 1 userOp = 1 Privy popup signature.
 * 10 wallets = 20 userOps (sequential).
 *
 * For WETH transfer, smart wallet must already hold WETH.
 * (User wraps ETH → WETH on Uniswap V4 once, then this hook funds bots.)
 */
export function useFundBotWallets(
  smartWalletAddress: string | null,
  botWallets: BotWalletToFund[],
  config: FundConfig
) {
  const { sendTransaction } = useSendTransaction()
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<FundProgress | null>(null)
  const [results, setResults] = useState<FundStepResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  const fund = useCallback(async () => {
    if (!smartWalletAddress) {
      setError("Smart wallet not connected")
      return
    }
    if (botWallets.length === 0) {
      setError("No bot wallets to fund. Generate wallets first.")
      return
    }

    const targets = botWallets.slice(0, config.walletCount)
    const totalSteps = targets.length * 2 // ETH + WETH per wallet
    const ethWei = parseUnits(config.ethAmount, 18)
    const wethWei = parseUnits(config.wethAmount, 18)

    cancelRef.current = false
    setIsRunning(true)
    setError(null)
    setResults([])

    let stepIndex = 0

    try {
      for (const wallet of targets) {
        if (cancelRef.current) {
          setProgress({
            current: stepIndex,
            total: totalSteps,
            step: "done",
            walletIndex: wallet.walletIndex,
            message: "Cancelled",
          })
          break
        }

        // Step 1: ETH transfer
        try {
          setProgress({
            current: stepIndex,
            total: totalSteps,
            step: "eth",
            walletIndex: wallet.walletIndex,
            message: `Sending ${config.ethAmount} ETH to wallet #${wallet.walletIndex + 1}`,
          })

          const { hash } = await sendTransaction(
            {
              to: wallet.address,
              value: ethWei,
              chainId: 4663,
            },
            { address: smartWalletAddress }
          )

          setResults((prev) => [
            ...prev,
            {
              walletIndex: wallet.walletIndex,
              walletAddress: wallet.address,
              type: "eth",
              hash,
              status: "success",
            },
          ])
        } catch (err: any) {
          setResults((prev) => [
            ...prev,
            {
              walletIndex: wallet.walletIndex,
              walletAddress: wallet.address,
              type: "eth",
              hash: "0x",
              status: "error",
              error: err.message,
            },
          ])
          // Continue to next wallet — don't abort whole batch on single failure
        }
        stepIndex++

        if (cancelRef.current) break

        // Step 2: WETH transfer
        try {
          setProgress({
            current: stepIndex,
            total: totalSteps,
            step: "weth-transfer",
            walletIndex: wallet.walletIndex,
            message: `Sending ${config.wethAmount} WETH to wallet #${wallet.walletIndex + 1}`,
          })

          const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [wallet.address, wethWei],
          })

          const { hash } = await sendTransaction(
            {
              to: RH_WETH_ADDRESS,
              data,
              value: BigInt(0),
              chainId: 4663,
            },
            { address: smartWalletAddress }
          )

          setResults((prev) => [
            ...prev,
            {
              walletIndex: wallet.walletIndex,
              walletAddress: wallet.address,
              type: "weth-transfer",
              hash,
              status: "success",
            },
          ])
        } catch (err: any) {
          setResults((prev) => [
            ...prev,
            {
              walletIndex: wallet.walletIndex,
              walletAddress: wallet.address,
              type: "weth-transfer",
              hash: "0x",
              status: "error",
              error: err.message,
            },
          ])
        }
        stepIndex++
      }

      setProgress({
        current: stepIndex,
        total: totalSteps,
        step: "done",
        walletIndex: -1,
        message: "Done",
      })
    } catch (err: any) {
      setError(err.message || "Funding failed")
    } finally {
      setIsRunning(false)
    }
  }, [smartWalletAddress, botWallets, config, sendTransaction])

  const cancel = useCallback(() => {
    cancelRef.current = true
  }, [])

  const reset = useCallback(() => {
    setResults([])
    setError(null)
    setProgress(null)
  }, [])

  return {
    fund,
    cancel,
    reset,
    isRunning,
    progress,
    results,
    error,
  }
}
