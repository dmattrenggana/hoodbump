"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Loader2, RefreshCw, Wallet } from "lucide-react"
import { toast } from "sonner"
import { formatAddress, formatEth } from "@/lib/format"
import { WALLETS_PER_USER } from "@/lib/constants"

interface BotWallet {
  id: string
  address: string
  walletIndex: number
  ethBalanceWei: string
  wethBalanceWei: string
  lastSwapAt: string | null
}

interface ManageBotProps {
  userAddress: string | null
}

export function ManageBot({ userAddress }: ManageBotProps) {
  const queryClient = useQueryClient()

  const { data: wallets, isLoading, refetch } = useQuery({
    queryKey: ["bot-wallets", userAddress],
    queryFn: async (): Promise<BotWallet[]> => {
      if (!userAddress) return []
      const res = await fetch(`/api/bot/get-or-create-wallets?userAddress=${userAddress}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      return data.wallets || []
    },
    enabled: !!userAddress,
    refetchInterval: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bot/get-or-create-wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-wallets", userAddress] })
      toast.success(`${WALLETS_PER_USER} bot wallets created`)
    },
    onError: (err: any) => toast.error(err.message),
  })

  if (!userAddress) return null

  if (isLoading) {
    return (
      <Card className="bg-card border-border p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-xs text-muted-foreground mt-2">Loading...</p>
      </Card>
    )
  }

  const hasWallets = wallets && wallets.length > 0

  return (
    <Card className="bg-card border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">BOT WALLETS</span>
          </div>
          {hasWallets && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="h-7 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          )}
        </div>

        {!hasWallets ? (
          <div className="text-center py-6">
            <Wallet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold mb-1">No bot wallets</p>
            <p className="text-xs text-muted-foreground mb-4">
              Create {WALLETS_PER_USER} encrypted wallets for swap execution
            </p>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create {WALLETS_PER_USER} Wallets
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {wallets.map((w) => (
              <div
                key={w.id}
                className="p-2.5 bg-background border border-border rounded-md"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-primary">
                        Wallet #{w.walletIndex + 1}
                      </span>
                      {w.lastSwapAt && (
                        <span className="text-xs text-muted-foreground">
                          · last {new Date(w.lastSwapAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground">
                      {formatAddress(w.address, 4)}
                    </p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-xs font-mono">
                      {formatEth(BigInt(w.ethBalanceWei || "0"))} ETH
                    </p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {formatEth(BigInt(w.wethBalanceWei || "0"))} WETH
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}