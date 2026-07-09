"use client"

import { AlertCircle, CheckCircle2, Coins, ExternalLink } from "lucide-react"
import { useHoodbumpHold } from "@/hooks/use-hoodbump-hold"

interface HoldGateBannerProps {
  userAddress: string
}

export function HoldGateBanner({ userAddress }: HoldGateBannerProps) {
  const { data, isLoading, error } = useHoodbumpHold(userAddress)

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Coins className="h-3 w-3 animate-pulse" />
        Checking $HOODBUMP holdings...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-xs text-destructive flex items-center gap-2">
        <AlertCircle className="h-3 w-3" />
        Could not verify holdings: {error.message}
      </div>
    )
  }

  if (!data) return null

  // Bypassed (token not deployed yet)
  if (data.bypassed) {
    return (
      <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-2 flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-500 font-medium">Beta mode — hold gate bypassed</p>
          <p className="text-muted-foreground mt-0.5">
            $HOODBUMP token not deployed yet. Once live, you'll need to hold{" "}
            {data.required} $HOODBUMP to use HoodBump.
          </p>
        </div>
      </div>
    )
  }

  if (data.eligible) {
    return (
      <div className="text-xs bg-primary/10 border border-primary/30 rounded p-2 flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        <span className="text-foreground">
          ✓ Holding <span className="font-mono font-semibold">{data.balance}</span> ${data.symbol}
        </span>
        <span className="text-muted-foreground ml-auto">
          Required: {data.required}
        </span>
      </div>
    )
  }

  // Not eligible — show clear instructions
  return (
    <div className="text-xs bg-destructive/10 border border-destructive/30 rounded p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-destructive font-semibold">
            Hold {data.required} ${data.symbol} to use HoodBump
          </p>
          <p className="text-muted-foreground mt-0.5">
            You currently hold{" "}
            <span className="font-mono text-foreground">{data.balance}</span> ${data.symbol}.
            Need{" "}
            <span className="font-mono text-foreground">{data.shortfall}</span> more.
          </p>
        </div>
      </div>
      <a
        href="https://app.uniswap.org/swap?chain=robinhood"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline flex items-center gap-1"
      >
        Buy $HOODBUMP on Uniswap
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  )
}