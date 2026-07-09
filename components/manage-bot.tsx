"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Loader2, RefreshCw, Wallet, Send, X, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { formatAddress, formatEth } from "@/lib/format"
import { WALLETS_PER_USER } from "@/lib/constants"
import { useFundBotWallets, type FundProgress, type FundStepResult } from "@/hooks/use-fund-bot-wallets"

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

  const { fund, cancel, reset, isRunning, progress, results, error } =
    useFundBotWallets(smartWalletAddress, botWallets, {
      walletCount,
      ethAmount,
      wethAmount,
    })

  const handleFund = async () => {
    if (parseFloat(ethAmount) <= 0 && parseFloat(wethAmount) <= 0) {
      toast.error("Set ETH or WETH amount > 0")
      return
    }
    setShowProgress(true)
    reset()
    await fund()
  }

  const handleClose = () => {
    if (isRunning) cancel()
    setShowProgress(false)
    setTimeout(() => {
      reset()
      onComplete()
    }, 500)
  }

  const successCount = results.filter((r) => r.status === "success").length
  const errorCount = results.filter((r) => r.status === "error").length

  return (
    <>
      <Card className="bg-card border-border">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Send className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">FUND BOT WALLETS</span>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Send ETH (gas) + WETH (swap value) from your smart wallet to bot wallets.
            Each transfer = 1 popup signature.
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

          <div className="text-xs text-muted-foreground mb-3 p-2 bg-background border border-border rounded">
            <p>
              <span className="text-foreground font-mono">
                {(walletCount * parseFloat(ethAmount || "0")).toFixed(6)} ETH
              </span>{" "}
              +{" "}
              <span className="text-foreground font-mono">
                {(walletCount * parseFloat(wethAmount || "0")).toFixed(6)} WETH
              </span>{" "}
              total
            </p>
            <p className="mt-1">
              ≈ {walletCount * 2} signatures needed ({walletCount} ETH + {walletCount} WETH)
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
                Funding...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Fund {walletCount} {walletCount === 1 ? "Wallet" : "Wallets"}
              </>
            )}
          </Button>
        </div>
      </Card>

      {showProgress && (
        <FundProgressModal
          progress={progress}
          results={results}
          error={error}
          isRunning={isRunning}
          successCount={successCount}
          errorCount={errorCount}
          totalSteps={walletCount * 2}
          onCancel={cancel}
          onClose={handleClose}
        />
      )}
    </>
  )
}

function FundProgressModal({
  progress,
  results,
  error,
  isRunning,
  successCount,
  errorCount,
  totalSteps,
  onCancel,
  onClose,
}: {
  progress: FundProgress | null
  results: FundStepResult[]
  error: string | null
  isRunning: boolean
  successCount: number
  errorCount: number
  totalSteps: number
  onCancel: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="bg-card border-border w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : error ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
            <h3 className="text-sm font-semibold">
              {isRunning
                ? "Funding in progress"
                : error
                ? "Funding error"
                : errorCount > 0
                ? "Funding complete (with errors)"
                : "Funding complete"}
            </h3>
          </div>
          {!isRunning && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {progress && isRunning && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted-foreground">{progress.message}</span>
                <span className="font-mono">
                  {progress.current + 1}/{totalSteps}
                </span>
              </div>
              <div className="h-1.5 bg-background rounded-full overflow-hidden border border-border">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${((progress.current + 1) / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
              <p className="text-xs text-destructive font-mono">{error}</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">
                {successCount} succeeded · {errorCount} failed
              </p>
              {results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 bg-background border border-border rounded text-xs"
                >
                  {r.status === "success" ? (
                    <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono truncate">
                      Wallet #{r.walletIndex + 1} · {r.type}
                    </p>
                    {r.error && (
                      <p className="text-destructive text-xs truncate">{r.error}</p>
                    )}
                  </div>
                  {r.status === "success" && r.hash !== "0x" && (
                    <a
                      href={`https://robinhoodchain.blockscout.com/tx/${r.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground flex-shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isRunning && results.length === 0 && !error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Ready to start.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-border">
          {isRunning ? (
            <Button
              variant="outline"
              onClick={onCancel}
              className="w-full"
            >
              <X className="h-3.5 w-3.5 mr-2" />
              Cancel
            </Button>
          ) : (
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
