"use client"

import { useState, useCallback } from "react"
import { useSendTransaction } from "@privy-io/react-auth"
import { encodeFunctionData, type Address, parseUnits } from "viem"
import { RH_WETH_ADDRESS } from "@/lib/constants"

export interface BotWalletToFund {
  id: string
  address: Address
  walletIndex: number
}

export interface FundConfig {
  walletCount: number
  ethAmount: string
  wethAmount: string
}

export type FundStep = "eth" | "weth" | "done"

export interface WalletFundResult {
  walletIndex: number
  walletAddress: Address
  eth: { status: "success" | "error"; hash?: `0x${string}`; error?: string }
  weth: { status: "pending" | "success" | "error"; hash?: `0x${string}`; error?: string }
  status: "pending" | "partial" | "complete" | "error"
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
] as const

export function useFundBotWallets(
  smartWalletAddress: string | null,
  botWallets: BotWalletToFund[],
  config: FundConfig
) {
  const { sendTransaction } = useSendTransaction()
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<WalletFundResult[]>([])
  const [error, setError] = useState<string | null>(null)

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
    const ethWei = parseUnits(config.ethAmount, 18)
    const wethWei = parseUnits(config.wethAmount, 18)

    setIsRunning(true)
    setError(null)
    // Initialize result for each target
    setResults(
      targets.map((w) => ({
        walletIndex: w.walletIndex,
        walletAddress: w.address,
        eth: { status: "pending" },
        weth: { status: wethWei > 0n ? "pending" : "success" },
        status: "pending",
      }))
    )

    try {
      for (let i = 0; i < targets.length; i++) {
        const wallet = targets[i]

        // Step 1: ETH transfer
        if (ethWei > 0n) {
          try {
            const { hash } = await sendTransaction(
              {
                to: wallet.address,
                value: ethWei,
                chainId: 4663,
              },
              { address: smartWalletAddress }
            )
            setResults((prev) => {
              const next = [...prev]
              next[i] = {
                ...next[i],
                eth: { status: "success", hash },
              }
              return next
            })
          } catch (err: any) {
            setResults((prev) => {
              const next = [...prev]
              next[i] = {
                ...next[i],
                eth: { status: "error", error: err.message || "ETH send failed" },
              }
              return next
            })
            // Skip WETH for this wallet if ETH failed
            continue
          }
        } else {
          setResults((prev) => {
            const next = [...prev]
            next[i] = { ...next[i], eth: { status: "success" } }
            return next
          })
        }

        // Step 2: WETH transfer
        if (wethWei > 0n) {
          try {
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
            setResults((prev) => {
              const next = [...prev]
              const ethOk = next[i].eth.status === "success"
              next[i] = {
                ...next[i],
                weth: { status: "success", hash },
                status: ethOk ? "complete" : "partial",
              }
              return next
            })
          } catch (err: any) {
            setResults((prev) => {
              const next = [...prev]
              const ethOk = next[i].eth.status === "success"
              next[i] = {
                ...next[i],
                weth: { status: "error", error: err.message || "WETH send failed" },
                status: ethOk ? "partial" : "error",
              }
              return next
            })
          }
        } else {
          setResults((prev) => {
            const next = [...prev]
            const ethOk = next[i].eth.status === "success"
            next[i] = {
              ...next[i],
              status: ethOk ? "complete" : "error",
            }
            return next
          })
        }
      }
    } catch (err: any) {
      setError(err.message || "Funding failed")
    } finally {
      setIsRunning(false)
    }
  }, [smartWalletAddress, botWallets, config, sendTransaction])

  const reset = useCallback(() => {
    setResults([])
    setError(null)
  }, [])

  return {
    fund,
    reset,
    isRunning,
    results,
    error,
  }
}
