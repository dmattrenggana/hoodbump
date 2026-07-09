"use client"

import { useState, useCallback, useEffect } from "react"
import { useSendTransaction } from "@privy-io/react-auth"
import { encodeFunctionData, type Address, parseUnits, createPublicClient, http, formatUnits } from "viem"
import { RH_WETH_ADDRESS } from "@/lib/constants"
import { robinhoodChain } from "@/lib/chain-config"

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
  eth: { status: "pending" | "success" | "error"; hash?: `0x${string}`; error?: string }
  weth: { status: "pending" | "skipped" | "success" | "error"; hash?: `0x${string}`; error?: string }
  status: "pending" | "partial" | "complete" | "error"
}

export interface SourceBalances {
  eth: bigint
  weth: bigint
}

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
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
      const [eth, weth] = await Promise.all([
        publicClient.getBalance({ address: smartWalletAddress as Address }),
        publicClient.readContract({
          address: RH_WETH_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [smartWalletAddress as Address],
        }),
      ])
      setSourceBalances({ eth, weth: weth as bigint })
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
  const requiredWeth = parseUnits(config.wethAmount, 18) * BigInt(config.walletCount)

  const hasEnoughEth = sourceBalances ? sourceBalances.eth >= requiredEth : null
  const hasEnoughWeth = sourceBalances ? sourceBalances.weth >= requiredWeth : null

  const fund = useCallback(async () => {
    if (!smartWalletAddress) {
      setError("Smart wallet not connected")
      return
    }
    if (botWallets.length === 0) {
      setError("No bot wallets to fund. Generate wallets first.")
      return
    }

    // Re-check balances right before fund to avoid stale state
    let liveEth: bigint, liveWeth: bigint
    try {
      const [e, w] = await Promise.all([
        publicClient.getBalance({ address: smartWalletAddress as Address }),
        publicClient.readContract({
          address: RH_WETH_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [smartWalletAddress as Address],
        }),
      ])
      liveEth = e
      liveWeth = w as bigint
    } catch (err: any) {
      setError(`Failed to fetch source balances: ${err.message}`)
      return
    }

    const targets = botWallets.slice(0, config.walletCount)
    const ethWei = parseUnits(config.ethAmount, 18)
    const wethWei = parseUnits(config.wethAmount, 18)
    const totalEth = ethWei * BigInt(targets.length)
    const totalWeth = wethWei * BigInt(targets.length)

    const ethShort = totalEth > liveEth
    const wethShort = totalWeth > liveWeth

    if (ethShort || wethShort) {
      const parts: string[] = []
      if (ethShort) {
        parts.push(
          `ETH: need ${formatUnits(totalEth, 18)} but smart wallet has ${formatUnits(liveEth, 18)}`
        )
      }
      if (wethShort) {
        parts.push(
          `WETH: need ${formatUnits(totalWeth, 18)} but smart wallet has ${formatUnits(liveWeth, 18)}`
        )
      }
      setError(`Insufficient balance. ${parts.join(" · ")}`)
      return
    }

    setIsRunning(true)
    setError(null)
    setResults(
      targets.map((w) => ({
        walletIndex: w.walletIndex,
        walletAddress: w.address,
        eth: { status: "pending" },
        weth: { status: wethWei > 0n ? "pending" : "skipped" },
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
              next[i] = { ...next[i], eth: { status: "success", hash } }
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
      // Refresh source balances after funding
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
    hasEnoughWeth,
    requiredEth,
    requiredWeth,
    refreshBalances: fetchSourceBalances,
  }
}
