"use client"

import { useState, useCallback, useEffect } from "react"
import { useSendTransaction } from "@privy-io/react-auth"
import { type Address, parseUnits, createPublicClient, http, formatUnits } from "viem"
import { robinhoodChain } from "@/lib/chain-config"

export interface BotWalletToFund {
  id: string
  address: Address
  walletIndex: number
}

export interface FundConfig {
  walletCount: number
  ethAmount: string
}

export interface WalletFundResult {
  walletIndex: number
  walletAddress: Address
  eth: { status: "pending" | "success" | "error"; hash?: `0x${string}`; error?: string }
  status: "pending" | "complete" | "error"
}

export interface SourceBalances {
  eth: bigint
}

const RPC_URL =
  process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL ||
  process.env.NEXT_PUBLIC_HOODBUMP_ALCHEMY_URL ||
  "https://rpc.mainnet.chain.robinhood.com"

const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(RPC_URL),
})

/**
 * Hook to fund bot wallets from user's smart wallet.
 * Sequential 1-by-1, with balance check.
 *
 * ETH-ONLY MODE: Worker uses native ETH for swaps (via 0x v2 Settler).
 * No WETH funding needed.
 */
export function useFundBotWallets(
  smartWalletAddress: string | null,
  botWallets: BotWalletToFund[],
  config: FundConfig
) {
  const { sendTransaction } = useSendTransaction()
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<WalletFundResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sourceBalances, setSourceBalances] = useState<SourceBalances | null>(null)
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)

  const fetchSourceBalances = useCallback(async () => {
    if (!smartWalletAddress) return
    setIsLoadingBalances(true)
    try {
      const eth = await publicClient.getBalance({ address: smartWalletAddress as Address })
      setSourceBalances({ eth })
    } catch (err) {
      console.error("[useFundBotWallets] balance fetch failed:", err)
      setSourceBalances(null)
    } finally {
      setIsLoadingBalances(false)
    }
  }, [smartWalletAddress])

  useEffect(() => {
    fetchSourceBalances()
  }, [fetchSourceBalances])

  const requiredEth = parseUnits(config.ethAmount, 18) * BigInt(config.walletCount)

  const hasEnoughEth = sourceBalances ? sourceBalances.eth >= requiredEth : null

  const fund = useCallback(async () => {
    if (!smartWalletAddress) {
      setError("Smart wallet not connected")
      return
    }
    if (botWallets.length === 0) {
      setError("No bot wallets to fund. Generate wallets first.")
      return
    }

    // Re-check balance right before fund
    let liveEth: bigint
    try {
      liveEth = await publicClient.getBalance({ address: smartWalletAddress as Address })
    } catch (err: any) {
      setError(`Failed to fetch source balance: ${err.message}`)
      return
    }

    const targets = botWallets.slice(0, config.walletCount)
    const ethWei = parseUnits(config.ethAmount, 18)
    const totalEth = ethWei * BigInt(targets.length)

    if (totalEth > liveEth) {
      setError(
        `Insufficient ETH: need ${formatUnits(totalEth, 18)} but smart wallet has ${formatUnits(liveEth, 18)}`
      )
      return
    }

    setIsRunning(true)
    setError(null)
    setResults(
      targets.map((w) => ({
        walletIndex: w.walletIndex,
        walletAddress: w.address,
        eth: { status: "pending" },
        status: "pending",
      }))
    )

    try {
      for (let i = 0; i < targets.length; i++) {
        const wallet = targets[i]

        // ETH transfer (covers gas + swap input)
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
              status: "complete",
            }
            return next
          })
        } catch (err: any) {
          setResults((prev) => {
            const next = [...prev]
            next[i] = {
              ...next[i],
              eth: { status: "error", error: err.message || "ETH send failed" },
              status: "error",
            }
            return next
          })
        }
      }
      fetchSourceBalances()
    } catch (err: any) {
      setError(err.message || "Funding failed")
    } finally {
      setIsRunning(false)
    }
  }, [smartWalletAddress, botWallets, config, sendTransaction, fetchSourceBalances])

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
    sourceBalances,
    isLoadingBalances,
    hasEnoughEth,
    requiredEth,
    refreshBalances: fetchSourceBalances,
  }
}