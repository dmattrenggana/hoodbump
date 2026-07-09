"use client"

import { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Send, DollarSign, ExternalLink, Wallet } from "lucide-react"
import { toast } from "sonner"
import { formatAddress } from "@/lib/format"

interface Token {
  symbol: string
  address: string
  balance: string
  balanceFormatted: string
  decimals: number
}

interface WalletTokens {
  walletIndex: number
  address: string
  ethBalance: string
  ethBalanceFormatted: string
  tokens: Token[]
}

interface WalletTokensPanelProps {
  userAddress: string
}

export function WalletTokensPanel({ userAddress }: WalletTokensPanelProps) {
  const [wallets, setWallets] = useState<WalletTokens[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null) // "wallet-idx-addr-action"

  const fetchTokens = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bot/wallet-tokens?userAddress=${userAddress}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setWallets(data.wallets || [])
    } catch (err: any) {
      toast.error("Failed to fetch tokens", { description: err.message })
    } finally {
      setLoading(false)
    }
  }, [userAddress])

  useEffect(() => {
    if (userAddress) fetchTokens()
  }, [userAddress, fetchTokens])

  const handleAction = async (
    walletIndex: number,
    tokenAddress: string,
    action: "transfer" | "sell"
  ) => {
    const key = `${walletIndex}-${tokenAddress}-${action}`
    setActionLoading(key)
    try {
      const res = await fetch("/api/bot/wallet-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress,
          walletIndex,
          tokenAddress,
          amount: "all", // sell/transfer full balance
          action,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "Action failed")
      const verb = action === "sell" ? "Sold" : "Transferred"
      toast.success(`${verb} ${data.amountTransferred || data.amountSold} tokens`, {
        description: `Tx: ${data.hash.slice(0, 20)}...`,
        action: {
          label: "View",
          onClick: () => window.open(`https://robinhoodchain.blockscout.com/tx/${data.hash}`, "_blank"),
        },
      })
      fetchTokens()
    } catch (err: any) {
      toast.error(`Action failed`, { description: err.message })
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <Card className="bg-card border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">BOT WALLET TOKENS</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTokens}
            disabled={loading}
            className="h-7 text-xs"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
          </Button>
        </div>

        {loading && wallets.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
            Scanning 10 wallets for tokens...
          </div>
        ) : wallets.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No bot wallets found.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {wallets
              .filter((w) => parseFloat(w.ethBalanceFormatted) > 0 || w.tokens.length > 0)
              .map((w) => (
                <div
                  key={w.walletIndex}
                  className="border border-border rounded p-2.5 bg-background/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-mono text-foreground">
                        Wallet #{w.walletIndex + 1}: {formatAddress(w.address, 4)}
                      </p>
                      <a
                        href={`https://robinhoodchain.blockscout.com/address/${w.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                      >
                        View on explorer
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                    <p className="text-xs font-mono font-semibold">
                      {w.ethBalanceFormatted} ETH
                    </p>
                  </div>

                  {w.tokens.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No tokens</p>
                  ) : (
                    <div className="space-y-1">
                      {w.tokens.map((token) => (
                        <div
                          key={token.address}
                          className="flex items-center justify-between text-xs bg-background p-1.5 rounded border border-border/50"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-mono font-semibold truncate">
                              {token.balanceFormatted} {token.symbol}
                            </p>
                            <p className="text-muted-foreground text-[10px] truncate">
                              {formatAddress(token.address, 4)}
                            </p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction(w.walletIndex, token.address, "transfer")}
                              disabled={actionLoading !== null}
                              className="h-6 px-2 text-[10px]"
                              title="Transfer all to your smart wallet"
                            >
                              {actionLoading === `${w.walletIndex}-${token.address}-transfer` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Send className="h-3 w-3" />
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction(w.walletIndex, token.address, "sell")}
                              disabled={actionLoading !== null}
                              className="h-6 px-2 text-[10px]"
                              title="Sell all back to ETH"
                            >
                              {actionLoading === `${w.walletIndex}-${token.address}-sell` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <DollarSign className="h-3 w-3" />
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </Card>
  )
}