"use client"

import { useQuery } from "@tanstack/react-query"
import { type Address } from "viem"
import { RH_WETH_ADDRESS } from "@/lib/constants"

export interface SwapQuote {
  sellToken: Address
  buyToken: Address
  sellAmount: string
  buyAmount: string
  minBuyAmount: string
  estimatedPriceImpact: string
  gas: string
  gasPrice: string
  allowanceTarget: Address
  sources: Array<{ name: string; proportion: string }>
  fees?: {
    integratorFee?: {
      amount: string
      token: string
    }
  }
}

export function useSwapQuote(params: {
  buyToken: Address | null
  sellAmount: bigint | null // in wei
  takerAddress: Address | null
  enabled?: boolean
}) {
  const { buyToken, sellAmount, takerAddress, enabled = true } = params

  return useQuery({
    queryKey: ["0x-quote", buyToken, sellAmount?.toString(), takerAddress],
    queryFn: async (): Promise<SwapQuote | null> => {
      if (!buyToken || !sellAmount || !takerAddress) return null

      const query = new URLSearchParams({
        sellToken: RH_WETH_ADDRESS,
        buyToken,
        sellAmount: sellAmount.toString(),
        takerAddress,
      })

      const response = await fetch(`/api/0x-quote?${query.toString()}`)

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || "Failed to fetch quote")
      }

      const data = await response.json()
      return data.quote
    },
    enabled: enabled && !!buyToken && !!sellAmount && sellAmount > 0n && !!takerAddress,
    refetchInterval: 15_000, // Refresh quote every 15s
    staleTime: 10_000, // Consider stale after 10s
    retry: 1,
  })
}
