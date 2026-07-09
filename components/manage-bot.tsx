"use client"

import { useState, useEffect } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useSmartWalletAddress } from "@/hooks/use-smart-wallet-address"
import { useBotWallets, useCreateBotWallets } from "@/hooks/use-bot-wallets"
import { Wallet, Plus, Loader2, AlertCircle } from "lucide-react"
import { formatAddress } from "@/lib/format"
import { formatEther } from "viem"

export function ManageBot() {
  const { ready, authenticated } = usePrivy()
  const userAddress = useSmartWalletAddress()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const {
    data: botWallets,
    isLoading,
    error,
    refetch,
  } = useBotWallets(mounted && authenticated ? userAddress : null)

  const createMutation = useCreateBotWallets(userAddress)

  if (!mounted) return null

  if (!ready) {
    return (
      <div className="border border-border rounded-lg bg-card p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Loading...</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="border border-border rounded-lg bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Connect your wallet to view bot wallets
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg bg-card p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-2">
          Loading bot wallets...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="border border-red-500/30 rounded-lg bg-card p-6">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-500">
              Failed to load wallets
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {error.message}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const hasWallets = botWallets && botWallets.length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border border-border rounded-lg bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Bot Wallets</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {hasWallets
                ? `${botWallets.length} wallets ready for swap execution`
                : "No bot wallets yet"}
            </p>
          </div>
          {hasWallets && (
            <button
              onClick={() => refetch()}
              className="text-xs text-primary hover:underline"
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Create wallets CTA */}
      {!hasWallets && (
        <div className="border border-border rounded-lg bg-card p-6 text-center">
          <Wallet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-2">Create Bot Wallets</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Generate 10 encrypted wallets for automated swap execution
          </p>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 inline mr-2" />
                Create 10 Wallets
              </>
            )}
          </button>
          {createMutation.error && (
            <p className="text-xs text-red-500 mt-3">
              {createMutation.error.message}
            </p>
          )}
        </div>
      )}

      {/* Wallet list */}
      {hasWallets && (
        <div className="space-y-2">
          {botWallets.map((wallet) => (
            <div
              key={wallet.id}
              className="border border-border rounded-lg bg-card p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-primary">
                      Wallet #{wallet.walletIndex + 1}
                    </span>
                    {wallet.lastSwapAt && (
                      <span className="text-xs text-muted-foreground">
                        · last swap {new Date(wallet.lastSwapAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-muted-foreground break-all">
                    {formatAddress(wallet.address, 4)}
                  </p>
                </div>
                <div className="text-right ml-3">
                  <p className="text-xs font-mono">
                    {formatEther(BigInt(wallet.ethBalanceWei), 4)} ETH
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {formatEther(BigInt(wallet.wethBalanceWei), 4)} WETH
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
