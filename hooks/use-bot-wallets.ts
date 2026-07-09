"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { type Address } from "viem"

export interface BotWalletInfo {
  id: string
  walletIndex: number
  address: Address
  ethBalanceWei: string
  wethBalanceWei: string
  totalGasSpentWei: string
  lastSwapAt: string | null
  createdAt: string
}

export function useBotWallets(userAddress: string | null) {
  return useQuery({
    queryKey: ["bot-wallets", userAddress],
    queryFn: async (): Promise<BotWalletInfo[]> => {
      if (!userAddress) return []

      const response = await fetch(
        `/api/bot/get-or-create-wallets?userAddress=${userAddress}`
      )

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || "Failed to fetch bot wallets")
      }

      const data = await response.json()
      return data.wallets || []
    },
    enabled: !!userAddress,
    refetchInterval: 30_000, // Refresh every 30s for balance updates
  })
}

export function useCreateBotWallets(userAddress: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!userAddress) throw new Error("userAddress required")

      const response = await fetch("/api/bot/get-or-create-wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || "Failed to create bot wallets")
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-wallets", userAddress] })
    },
  })
}
