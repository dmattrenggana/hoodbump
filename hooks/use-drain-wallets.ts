"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"

interface TokenDrain {
  symbol: string
  address: string
  txHash?: string
  amount: string
  status: "success" | "error" | "skipped"
}

interface WalletDrain {
  walletIndex: number
  walletAddress: string
  eth: { txHash?: string; amount: string; status: "success" | "error" | "skipped" }
  tokens: TokenDrain[]
  status: "success" | "partial" | "error"
}

interface DrainResponse {
  success: boolean
  recipient: string
  summary: { total: number; success: number; partial: number; error: number }
  results: WalletDrain[]
  durationMs: number
  error?: string
}

export function useDrainWallets() {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<DrainResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const drain = useCallback(async (userAddress: string) => {
    setIsRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/bot/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      })
      const data = (await res.json()) as DrainResponse
      if (!data.success && data.error) {
        throw new Error(data.error)
      }
      setResult(data)
      if (data.success) {
        toast.success("Drain complete", {
          description: `${data.summary.success}/${data.summary.total} wallets drained in ${(data.durationMs / 1000).toFixed(1)}s`,
        })
      } else {
        toast.warning("Drain partial", {
          description: `${data.summary.success} success, ${data.summary.partial} partial, ${data.summary.error} failed`,
        })
      }
      return data
    } catch (err: any) {
      const msg = err.message || "Drain failed"
      setError(msg)
      toast.error("Drain failed", { description: msg })
      throw err
    } finally {
      setIsRunning(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { drain, reset, isRunning, result, error }
}