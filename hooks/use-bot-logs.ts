"use client"

import { useQuery } from "@tanstack/react-query"

export interface BotLog {
  id: string
  user_address: string
  bot_wallet_address: string | null
  session_id: string | null
  action: string
  status: "success" | "error" | "info" | "pending"
  message: string | null
  tx_hash: string | null
  amount_wei: string | null
  token_address: string | null
  error_details: string | null
  created_at: string
}

export function useBotLogs(userAddress: string | null, limit = 20) {
  return useQuery({
    queryKey: ["bot-logs", userAddress, limit],
    queryFn: async (): Promise<BotLog[]> => {
      if (!userAddress) return []
      // We'll need to create this API endpoint
      // For now return empty array
      return []
    },
    enabled: !!userAddress,
    refetchInterval: 5_000, // Refresh every 5s for live activity
  })
}
