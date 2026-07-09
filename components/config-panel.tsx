"use client"

import { useState, useEffect } from "react"
import { useSmartWalletAddress } from "@/hooks/use-smart-wallet-address"
import { useStartSession, useStopSession, useBotSession } from "@/hooks/use-bot-session"
import { isAddress, type Address } from "viem"
import { Settings, Power, AlertCircle, Loader2, Check } from "lucide-react"
import {
  MIN_SWAP_USD,
  MIN_INTERVAL_SECONDS,
  MAX_INTERVAL_SECONDS,
  DEFAULT_INTERVAL_SECONDS,
} from "@/lib/constants"

export function ConfigPanel() {
  const userAddress = useSmartWalletAddress()
  const { data: session, isLoading: isLoadingSession } = useBotSession(userAddress)
  const startMutation = useStartSession(userAddress)
  const stopMutation = useStopSession(userAddress)

  const [tokenAddress, setTokenAddress] = useState("")
  const [amountUsd, setAmountUsd] = useState("0.10")
  const [intervalSeconds, setIntervalSeconds] = useState(DEFAULT_INTERVAL_SECONDS)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)

  const isRunning = session?.status === "running"

  // Validate token address
  useEffect(() => {
    if (!tokenAddress) {
      setTokenValid(null)
      return
    }
    setTokenValid(isAddress(tokenAddress))
  }, [tokenAddress])

  // When session is running, populate fields from it
  useEffect(() => {
    if (session && session.status === "running") {
      setTokenAddress(session.token_address)
      setAmountUsd(session.amount_usd)
      setIntervalSeconds(session.interval_seconds)
    }
  }, [session])

  async function handleStart() {
    if (!tokenValid) return
    if (parseFloat(amountUsd) < MIN_SWAP_USD) return
    if (intervalSeconds < MIN_INTERVAL_SECONDS) return

    startMutation.mutate({
      tokenAddress: tokenAddress as Address,
      amountUsd,
      intervalSeconds,
    })
  }

  async function handleStop() {
    stopMutation.mutate()
  }

  if (isLoadingSession) {
    return (
      <div className="border border-border rounded-lg bg-card p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Loading session...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Session status banner */}
      {isRunning && (
        <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-semibold">Bot Running</span>
          <span className="text-xs text-muted-foreground ml-auto">
            Started {session?.started_at ? new Date(session.started_at).toLocaleTimeString() : ""}
          </span>
        </div>
      )}

      {/* Token address */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1 block">
          TARGET TOKEN ADDRESS
        </label>
        <div className="relative">
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            disabled={isRunning}
            placeholder="0x... (ERC-20 token on Robinhood Chain)"
            className="w-full bg-secondary/30 border border-border rounded-lg p-3 pr-10 text-sm font-mono disabled:opacity-50"
          />
          {tokenValid === true && (
            <Check className="h-4 w-4 text-primary absolute right-3 top-3.5" />
          )}
          {tokenValid === false && (
            <AlertCircle className="h-4 w-4 text-red-500 absolute right-3 top-3.5" />
          )}
        </div>
        {tokenValid === false && (
          <p className="text-xs text-red-500 mt-1">Invalid Ethereum address</p>
        )}
      </div>

      {/* Amount */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1 block">
          AMOUNT PER SWAP (USD)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-3 text-muted-foreground">$</span>
          <input
            type="number"
            min={MIN_SWAP_USD}
            step="0.01"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            disabled={isRunning}
            className="w-full bg-secondary/30 border border-border rounded-lg p-3 pl-7 text-sm font-mono disabled:opacity-50"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Min: ${MIN_SWAP_USD.toFixed(2)} · With anti-detection ±30% variance per swap
        </p>
      </div>

      {/* Interval slider */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-semibold text-muted-foreground">
            INTERVAL
          </label>
          <span className="text-sm font-mono">
            {intervalSeconds}s{" "}
            <span className="text-xs text-muted-foreground">
              ({Math.floor(86400 / intervalSeconds)} swaps/day)
            </span>
          </span>
        </div>
        <input
          type="range"
          min={MIN_INTERVAL_SECONDS}
          max={MAX_INTERVAL_SECONDS}
          step={1}
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(parseInt(e.target.value))}
          disabled={isRunning}
          className="w-full accent-primary disabled:opacity-50"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{MIN_INTERVAL_SECONDS}s (aggressive)</span>
          <span>{Math.floor(MAX_INTERVAL_SECONDS / 60)}m (conservative)</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          With anti-detection jitter:{" "}
          {Math.floor(intervalSeconds * 0.7)}-{Math.floor(intervalSeconds * 1.3)}s actual
        </p>
      </div>

      {/* Start/Stop button */}
      <div className="pt-2">
        {isRunning ? (
          <button
            onClick={handleStop}
            disabled={stopMutation.isPending}
            className="w-full bg-red-500 text-white font-semibold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {stopMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <Power className="h-4 w-4" />
                Stop Bumping
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!tokenValid || startMutation.isPending}
            className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {startMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Settings className="h-4 w-4" />
                Start Bumping
              </>
            )}
          </button>
        )}

        {(startMutation.error || stopMutation.error) && (
          <p className="text-xs text-red-500 mt-2 text-center">
            {(startMutation.error || stopMutation.error)?.message}
          </p>
        )}
      </div>
    </div>
  )
}
