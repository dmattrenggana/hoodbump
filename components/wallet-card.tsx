"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, RefreshCw, ExternalLink, LogOut, Send } from "lucide-react"
import { toast } from "sonner"
import { formatAddress } from "@/lib/format"

interface WalletCardProps {
  smartWalletAddress: string | null
  ethBalance: string | null
  wethBalance: string | null
  ethPriceUsd: number
  isRefreshing?: boolean
  onRefresh?: () => void
  onDisconnect?: () => void
  onSend?: () => void
}

export function WalletCard({
  smartWalletAddress,
  ethBalance,
  wethBalance,
  ethPriceUsd,
  isRefreshing = false,
  onRefresh,
  onDisconnect,
  onSend,
}: WalletCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success("Address copied")
    setTimeout(() => setCopied(false), 2000)
  }

  const ethUsdValue =
    ethBalance && ethPriceUsd > 0
      ? (parseFloat(ethBalance) * ethPriceUsd).toFixed(2)
      : "0.00"

  return (
    <Card className="bg-card border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">SMART WALLET</span>
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-7 w-7 p-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            )}
            {onDisconnect && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDisconnect}
                className="h-7 w-7 p-0"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            )}
            {onSend && smartWalletAddress && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSend}
                className="h-7 w-7 p-0"
                title="Send ETH or tokens"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Address */}
        <div className="mb-4">
          <div className="flex items-center gap-2 p-2.5 bg-background border border-border rounded-md">
            <span className="font-mono text-xs truncate flex-1">
              {smartWalletAddress
                ? formatAddress(smartWalletAddress, 4)
                : "Not connected"}
            </span>
            {smartWalletAddress && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(smartWalletAddress)}
                  className="h-6 w-6 p-0 flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-primary" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <a
                  href={`https://robinhoodchain.blockscout.com/address/${smartWalletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Balances */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-background border border-border rounded-md">
            <p className="text-xs text-muted-foreground mb-1">ETH (gas)</p>
            <p className="font-mono text-sm font-semibold">
              {ethBalance ? parseFloat(ethBalance).toFixed(4) : "0.0000"}
            </p>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">
              ≈ ${ethUsdValue}
            </p>
          </div>
          <div className="p-3 bg-background border border-border rounded-md">
            <p className="text-xs text-muted-foreground mb-1">WETH</p>
            <p className="font-mono text-sm font-semibold">
              {wethBalance ? parseFloat(wethBalance).toFixed(4) : "0.0000"}
            </p>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">
              for swaps
            </p>
          </div>
        </div>

        {/* HoodBump token balance */}
        <div className="mt-3 p-3 bg-background border border-border rounded-md">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">$HOODBUMP (placeholder)</p>
            <p className="font-mono text-xs">0.00</p>
          </div>
        </div>
      </div>
    </Card>
  )
}