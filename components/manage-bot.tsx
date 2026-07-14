"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Loader2, RefreshCw, Wallet, Send, X, ExternalLink, CheckCircle2, AlertCircle, Zap, Download } from "lucide-react"
import { toast } from "sonner"
import { formatAddress, formatEth } from "@/lib/format"
import { WALLETS_PER_USER } from "@/lib/constants"
import { useFundBotWallets } from "@/hooks/use-fund-bot-wallets"
import { DrainModal } from "@/components/drain-modal"

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
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    refetch()
                  }}
                  className="h-7 text-xs cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    console.log("[Drain] Opening modal")
                    setShowDrainModal(true)
                  }}
                  className="h-7 text-xs bg-destructive hover:bg-destructive/90 text-white font-semibold cursor-pointer"
                  title="Drain all ETH + tokens to your smart wallet"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Drain
                </Button>
              </div>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Prominent Drain button below wallet list */}
          {hasWallets && (
            <Button
              type="button"
              variant="default"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log("[Drain] Opening modal (prominent)")
                setShowDrainModal(true)
              }}
              className="w-full mt-4 h-12 bg-destructive hover:bg-destructive/90 text-white font-bold text-sm cursor-pointer"
            >
              <Download className="h-4 w-4 mr-2" />
              Drain All Wallets → Smart Wallet
            </Button>
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
  const [ethAmount, setEthAmount] = useState("0.001")
  const [showProgress, setShowProgress] = useState(false)
  const [showDrainModal, setShowDrainModal] = useState(false)

  const { fund, reset, isRunning, results, error } =
    useFundBotWallets(smartWalletAddress, botWallets, {
      walletCount,
      ethAmount,
    })

  const handleFund = async () => {
    const ethNum = parseFloat(ethAmount) || 0
    if (ethNum <= 0) {
      toast.error("Set ETH amount > 0")
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
            Send native ETH to multiple bot wallets (sequential 1-by-1). 
            ETH covers both gas + swap input — no WETH wrap needed.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
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
                ETH each (covers gas + swap)
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
          </div>

          {parseFloat(ethAmount) <= 0 && (
            <div className="text-xs text-amber-500 mb-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded">
              ⚠️ Set ETH amount &gt; 0. Each bot wallet needs native ETH for gas + swap input.
            </div>
          )}

          <div className="text-xs text-muted-foreground mb-3 p-2 bg-background border border-border rounded">
            <p>
              Send: <span className="text-foreground font-mono">
                {(walletCount * parseFloat(ethAmount || "0")).toFixed(6)} ETH
              </span>
            </p>
            <p className="mt-1">
              To: {walletCount} wallet{walletCount > 1 ? "s" : ""} ({ethAmount} ETH each)
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
                Confirm in wallet
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Fund {walletCount} Wallet{walletCount > 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      </Card>

      {showProgress && (
        <FundStatusModal
          isRunning={isRunning}
          results={results}
          error={error}
          walletCount={walletCount}
          onClose={handleClose}
        />
      )}

      {showDrainModal && (
        <DrainModal
          smartWalletAddress={userAddress}
          botWalletCount={wallets?.length || 0}
          onClose={() => setShowDrainModal(false)}
        />
      )}
    </>
  )
}

function FundStatusModal({
  isRunning,
  results,
  error,
  walletCount,
  onClose,
}: {
  isRunning: boolean
  results: import("@/hooks/use-fund-bot-wallets").WalletFundResult[]
  error: string | null
  walletCount: number
  onClose: () => void
}) {
  const successCount = results.filter((r) => r.status === "complete").length
  const partialCount = results.filter((r) => r.status === "partial").length
  const errorCount = results.filter((r) => r.status === "error").length

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="bg-card border-border w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : errorCount > 0 || partialCount > 0 ? (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
            <h3 className="text-sm font-semibold">
              {isRunning
                ? "Funding in progress"
                : errorCount > 0 || partialCount > 0
                ? "Funding complete with issues"
                : "Funding complete"}
            </h3>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {isRunning && (
            <div className="text-center py-4">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
              <p className="text-xs text-muted-foreground">
                Confirm in your wallet...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {results.filter((r) => r.status !== "pending").length} / {walletCount} done
              </p>
            </div>
          )}

          {error && (
            <div className="mb-3 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
              <p className="text-xs text-destructive font-mono break-all">{error}</p>
            </div>
          )}

          {!isRunning && results.length > 0 && (
            <div className="mb-3 text-xs">
              <span className="text-primary font-mono">{successCount}</span> complete ·{" "}
              {partialCount > 0 && (
                <span className="text-amber-500 font-mono">{partialCount} partial · </span>
              )}
              {errorCount > 0 && (
                <span className="text-destructive font-mono">{errorCount} failed</span>
              )}
            </div>
          )}

          <div className="space-y-2">
            {results.map((r) => (
              <div
                key={r.walletIndex}
                className="p-2.5 bg-background border border-border rounded-md"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-primary">
                    Wallet #{r.walletIndex + 1}
                  </span>
                  {r.status === "pending" && isRunning ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : r.status === "complete" ? (
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                  ) : r.status === "partial" ? (
                    <AlertCircle className="h-3 w-3 text-amber-500" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <p className="text-xs font-mono text-muted-foreground mb-1">
                  {formatAddress(r.walletAddress, 4)}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">ETH:</span>
                  {r.eth.status === "success" ? (
                    <span className="text-primary">✓</span>
                  ) : r.eth.status === "error" ? (
                    <span className="text-destructive">✗</span>
                  ) : (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  )}
                  {r.eth.hash && (
                    <a
                      href={`https://robinhoodchain.blockscout.com/tx/${r.eth.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                  {r.eth.error && (
                    <span className="text-destructive text-xs truncate" title={r.eth.error}>
                      {r.eth.error.slice(0, 30)}...
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-border">
          <Button onClick={onClose} className="w-full" disabled={isRunning}>
            {isRunning ? "Funding..." : "Done"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
