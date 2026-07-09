"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Loader2, RefreshCw, Wallet, Send, X, ExternalLink, CheckCircle2, AlertCircle, Zap } from "lucide-react"
import { toast } from "sonner"
import { formatAddress, formatEth } from "@/lib/format"
import { WALLETS_PER_USER } from "@/lib/constants"
import { useFundBotWallets } from "@/hooks/use-fund-bot-wallets"

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
    <div className="space-y-4">
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

      {hasWallets && (
        <FundingPanel
          smartWalletAddress={userAddress}
          botWallets={wallets.map((w) => ({
            id: w.id,
            address: w.address as `0x${string}`,
            walletIndex: w.walletIndex,
          }))}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["bot-wallets", userAddress] })
          }}
        />
      )}
    </div>
  )
}

function FundingPanel({
  smartWalletAddress,
  botWallets,
  onComplete,
}: {
  smartWalletAddress: string
  botWallets: { id: string; address: `0x${string}`; walletIndex: number }[]
  onComplete: () => void
}) {
  const [walletCount, setWalletCount] = useState(1)
  const [ethAmount, setEthAmount] = useState("0.0001")
  const [wethAmount, setWethAmount] = useState("0.0003")
  const [showProgress, setShowProgress] = useState(false)

  const { fund, reset, isRunning, txHash, error, callCount } =
    useFundBotWallets(smartWalletAddress, botWallets, {
      walletCount,
      ethAmount,
      wethAmount,
    })

  const handleFund = async () => {
    const ethNum = parseFloat(ethAmount) || 0
    const wethNum = parseFloat(wethAmount) || 0
    if (ethNum <= 0 && wethNum <= 0) {
      toast.error("Set ETH or WETH amount > 0")
      return
    }
    setShowProgress(true)
    reset()
    await fund()
  }

  const handleClose = () => {
    setShowProgress(false)
    setTimeout(() => {
      reset()
      onComplete()
    }, 500)
  }

  return (
    <>
      <Card className="bg-card border-border">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">BATCH FUND</span>
            <span className="text-xs text-muted-foreground ml-auto">1 signature</span>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Send ETH + WETH to multiple bot wallets in a single signed transaction
            via smart wallet batch execution. Atomic — all succeed or all fail.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <Label htmlFor="wallet-count" className="text-xs">
                Wallets
              </Label>
              <Input
                id="wallet-count"
                type="number"
                min={1}
                max={WALLETS_PER_USER}
                value={walletCount}
                onChange={(e) => setWalletCount(Math.max(1, Math.min(WALLETS_PER_USER, parseInt(e.target.value) || 1)))}
                className="h-9 font-mono text-sm"
                disabled={isRunning}
              />
            </div>
            <div>
              <Label htmlFor="eth-amount" className="text-xs">
                ETH each
              </Label>
              <Input
                id="eth-amount"
                type="text"
                inputMode="decimal"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                className="h-9 font-mono text-sm"
                disabled={isRunning}
              />
            </div>
            <div>
              <Label htmlFor="weth-amount" className="text-xs">
                WETH each
              </Label>
              <Input
                id="weth-amount"
                type="text"
                inputMode="decimal"
                value={wethAmount}
                onChange={(e) => setWethAmount(e.target.value)}
                className="h-9 font-mono text-sm"
                disabled={isRunning}
              />
            </div>
          </div>

          {parseFloat(wethAmount) <= 0 && (
            <div className="text-xs text-amber-500 mb-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded">
              ⚠️ Bot wallets need WETH to swap. Set WETH amount &gt; 0 and ensure your
              smart wallet has WETH (wrap ETH on Uniswap V4 first).
            </div>
          )}

          <div className="text-xs text-muted-foreground mb-3 p-2 bg-background border border-border rounded">
            <p>
              Send: <span className="text-foreground font-mono">
                {(walletCount * parseFloat(ethAmount || "0")).toFixed(6)} ETH
              </span>{" "}
              + <span className="text-foreground font-mono">
                {(walletCount * parseFloat(wethAmount || "0")).toFixed(6)} WETH
              </span>
            </p>
            <p className="mt-1">
              To: {walletCount} wallet{walletCount > 1 ? "s" : ""} ·{" "}
              <span className="text-primary">{callCount} calls in 1 signature</span>
            </p>
          </div>

          <Button
            onClick={handleFund}
            disabled={isRunning}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Confirm in wallet...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Fund {walletCount} Wallet{walletCount > 1 ? "s" : ""} (1 signature)
              </>
            )}
          </Button>
        </div>
      </Card>

      {showProgress && (
        <FundStatusModal
          isRunning={isRunning}
          txHash={txHash}
          error={error}
          walletCount={walletCount}
          ethAmount={ethAmount}
          wethAmount={wethAmount}
          onClose={handleClose}
        />
      )}
    </>
  )
}

function FundStatusModal({
  isRunning,
  txHash,
  error,
  walletCount,
  ethAmount,
  wethAmount,
  onClose,
}: {
  isRunning: boolean
  txHash: `0x${string}` | null
  error: string | null
  walletCount: number
  ethAmount: string
  wethAmount: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="bg-card border-border w-full max-w-md">
        <div className="p-6">
          {isRunning && (
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
              <h3 className="text-sm font-semibold mb-1">Confirm in Phantom</h3>
              <p className="text-xs text-muted-foreground">
                Signing 1 batched transaction...
              </p>
            </div>
          )}

          {error && (
            <div className="text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-3" />
              <h3 className="text-sm font-semibold mb-2">Funding failed</h3>
              <p className="text-xs text-destructive font-mono mb-4 break-all">{error}</p>
              <Button onClick={onClose} className="w-full">
                Close
              </Button>
            </div>
          )}

          {txHash && !isRunning && !error && (
            <div className="text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-primary mb-3" />
              <h3 className="text-sm font-semibold mb-1">Funding complete</h3>
              <p className="text-xs text-muted-foreground mb-1">
                {walletCount} wallet{walletCount > 1 ? "s" : ""} funded atomically
              </p>
              <p className="text-xs text-muted-foreground mb-4 font-mono break-all">
                {formatAddress(txHash, 6)}
              </p>
              <div className="flex gap-2">
                <a
                  href={`https://robinhoodchain.blockscout.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button variant="outline" className="w-full">
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    View tx
                  </Button>
                </a>
                <Button onClick={onClose} className="flex-1">
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
