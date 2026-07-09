"use client"

import { Button } from "@/components/ui/button"
import { Play, Square, Lock, Loader2 } from "lucide-react"

interface ActionButtonProps {
  isActive: boolean
  onToggle: () => void
  isVerified?: boolean
  loadingState?: string | null
  isLoadingWallets?: boolean
  buyAmountUsd?: string
  balanceWei?: string | null
}

export function ActionButton({
  isActive,
  onToggle,
  isVerified = false,
  loadingState = null,
  isLoadingWallets = false,
  buyAmountUsd = "0",
  balanceWei = null,
}: ActionButtonProps) {
  const hasCredit = balanceWei ? BigInt(balanceWei) > BigInt(0) : false
  const isLocked = !isActive && !isVerified
  const isLoading = !!loadingState || isLoadingWallets

  const getButtonText = () => {
    if (isActive) return "Stop Bumping"
    if (isLoading) return loadingState || "Processing..."
    if (!isVerified) return "Verify Token First"
    return "Start Bumping"
  }

  const isDisabled = isLocked || isLoading

  return (
    <Button
      size="lg"
      onClick={onToggle}
      disabled={isDisabled}
      className={`w-full h-14 text-base font-semibold transition-all ${
        isDisabled
          ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
          : isActive
            ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg"
            : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
      }`}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {getButtonText()}
        </>
      ) : isLocked ? (
        <>
          <Lock className="mr-2 h-5 w-5" />
          {getButtonText()}
        </>
      ) : isActive ? (
        <>
          <Square className="mr-2 h-5 w-5 fill-current" />
          {getButtonText()}
        </>
      ) : (
        <>
          <Play className="mr-2 h-5 w-5 fill-current" />
          {getButtonText()}
        </>
      )}
    </Button>
  )
}