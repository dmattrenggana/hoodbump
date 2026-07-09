"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { type Address } from "viem"

export interface BotSession {
  id: string
  user_address: string
  token_address: string
  amount_usd: string
  interval_seconds: number
  wallet_rotation_index: number
  status: "pending" | "running" | "stopped" | "completed" | "failed"
  started_at: string | null
  stopped_at: string | null
  created_at: string
  updated_at: string
}

export function useBotSession(userAddress: string | null) {
  const queryClient = useQueryClient()

  const sessionQuery = useQuery({
    queryKey: ["bot-session", userAddress],
    queryFn: async (): Promise<BotSession | null> => {
      if (!userAddress) return null
      const res = await fetch(`/api/bot/session?userAddress=${userAddress}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error("Failed to fetch session")
      const data = await res.json()
      return data.session
    },
    enabled: !!userAddress,
    refetchInterval: 10_000,
  })

  const startMutation = useMutation({
    mutationFn: async (params: {
      tokenAddress: Address
      amountUsd: string
      intervalSeconds: number
    }) => {
      if (!userAddress) throw new Error("userAddress required")
      const res = await fetch("/api/bot/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress, ...params }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // Prefer the more descriptive `message` field from hold-gate responses
        const msg = err.message || err.error || "Failed to start session"
        throw new Error(msg)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-session", userAddress] })
    },
  })

  const stopMutation = useMutation({
    mutationFn: async () => {
      if (!userAddress) throw new Error("userAddress required")
      const res = await fetch(
        `/api/bot/session?userAddress=${userAddress}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to stop session")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-session", userAddress] })
    },
  })

  return {
    session: sessionQuery.data,
    isLoading: sessionQuery.isLoading,
    startSession: startMutation.mutateAsync,
    stopSession: stopMutation.mutateAsync,
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
  }
}