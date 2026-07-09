"use client"

import { useEffect, useState, useCallback } from "react"
import { type Address, formatUnits } from "viem"
import { createPublicClient, http } from "viem"
import { robinhoodChain } from "@/lib/chain-config"

const RPC_URL =
  process.env.NEXT_PUBLIC_HOODBUMP_ALCHEMY_URL ||
  process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL ||
  "https://rpc.mainnet.chain.robinhood.com"

const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(RPC_URL),
})

interface Balance {
  formatted: string
  symbol: string
  value: bigint
}

/**
 * Direct RPC balance fetcher — bypasses wagmi/Privy state.
 * Simpler, no hydration races.
 */
export function useUserBalances(walletAddress: string | null) {
  const [eth, setEth] = useState<Balance | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchEth = useCallback(async () => {
    if (!walletAddress) {
      setEth(null)
      return
    }
    setIsLoading(true)
    try {
      const bal = await publicClient.getBalance({
        address: walletAddress as Address,
      })
      setEth({
        value: bal,
        formatted: formatUnits(bal, 18),
        symbol: bal.symbol ?? "ETH",
      })
    } catch (err) {
      console.error("[useUserBalances] ETH fetch failed:", err)
      setEth(null)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress])

  useEffect(() => {
    fetchEth()
    if (!walletAddress) return
    const interval = setInterval(fetchEth, 15_000)
    return () => clearInterval(interval)
  }, [walletAddress, fetchEth])

  return { eth, isLoading, refetch: fetchEth }
}

export function useWethBalance(walletAddress: string | null, wethAddress: Address) {
  const [weth, setWeth] = useState<Balance | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchWeth = useCallback(async () => {
    if (!walletAddress) {
      setWeth(null)
      return
    }
    setIsLoading(true)
    try {
      const bal = await publicClient.readContract({
        address: wethAddress,
        abi: [
          {
            name: "balanceOf",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "owner", type: "address" }],
            outputs: [{ name: "", type: "uint256" }],
          },
          {
            name: "symbol",
            type: "function",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "", type: "string" }],
          },
        ] as const,
        functionName: "balanceOf",
        args: [walletAddress as Address],
      })
      setWeth({
        value: bal as bigint,
        formatted: formatUnits(bal as bigint, 18),
        symbol: "WETH",
      })
    } catch (err) {
      console.error("[useWethBalance] WETH fetch failed:", err)
      setWeth(null)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress, wethAddress])

  useEffect(() => {
    fetchWeth()
    if (!walletAddress) return
    const interval = setInterval(fetchWeth, 15_000)
    return () => clearInterval(interval)
  }, [walletAddress, wethAddress, fetchWeth])

  return { weth, isLoading, refetch: fetchWeth }
}
