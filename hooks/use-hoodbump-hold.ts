"use client"

import { useQuery } from "@tanstack/react-query"
import { type Address } from "viem"

interface HoldCheck {
  eligible: boolean
  balance: string
  required: string
  shortfall: string
  symbol: string
  bypassed?: boolean
  error?: string
}

export function useHoodbumpHold(userAddress: string | null) {
  return useQuery({
    queryKey: ["hoodbump-hold", userAddress],
    queryFn: async (): Promise<HoldCheck> => {
      if (!userAddress) throw new Error("userAddress required")
      const res = await fetch(`/api/bot/hold-check?userAddress=${userAddress}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Hold check failed")
      }
      return res.json()
    },
    enabled: !!userAddress,
    refetchInterval: 30_000, // refresh every 30s
  })
}