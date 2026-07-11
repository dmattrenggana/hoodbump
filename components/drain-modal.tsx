"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Download, AlertTriangle, CheckCircle2, X } from "lucide-react"
import { useDrainWallets } from "@/hooks/use-drain-wallets"
import { formatAddress } from "@/lib/format"

interface DrainModalProps {
  smartWalletAddress: string
  botWalletCount: number
  onClose: () => void
}

export function DrainModal({ smartWalletAddress, botWalletCount, onClose }: DrainModalProps) {
  const { drain, reset, isRunning, result, error } = useDrainWallets()
  const [confirmText, setConfirmText] = useState("")

  const handleDrain = async () => {
    try {
      await drain(smartWalletAddress)
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="bg-card border-border w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Drain All Bot Wallets</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!result && !isRunning && (
            <div className="space-y-4">
              <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-500 font-semibold">This will drain all funds to your smart wallet</p>
                  <ul className="text-muted-foreground mt-1.5 list-disc list-inside space-y-0.5">
                    <li>All native ETH from {botWalletCount} bot wallets</li>
                    <li>All known tokens (WETH, HOODIE, CLANKHOOD, USDG, HOODBUMP)</li>
                    <li>~{botWalletCount * 5}–{botWalletCount * 15} transactions total</li>
                    <li>Takes ~30–90 seconds</li>
                  </ul>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Type <span className="font-mono text-foreground">DRAIN</span> to confirm:
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="DRAIN"
                  className="w-full h-9 px-3 bg-background border border-border rounded text-sm font-mono"
                />
              </div>

              {error && (
                <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
                  {error}
                </div>
              )}
            </div>
          )}

          {isRunning && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
              <p className="text-sm font-medium">Draining {botWalletCount} bot wallets...</p>
              <p className="text-xs text-muted-foreground mt-1">
                This may take up to 2 minutes. Don't close this window.
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="text-center py-3">
                {result.success ? (
                  <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-2" />
                ) : (
                  <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
                )}
                <p className="text-sm font-semibold">
                  {result.success ? "Drain complete!" : "Drain finished with issues"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {result.summary.success}/{result.summary.total} successful ·{" "}
                  {(result.durationMs / 1000).toFixed(1)}s
                </p>
              </div>

              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {result.results.map((w) => (
                  <div
                    key={w.walletIndex}
                    className="border border-border rounded p-2.5 bg-background text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-foreground">
                        #{w.walletIndex + 1} {formatAddress(w.walletAddress, 4)}
                      </span>
                      <span
                        className={
                          w.status === "success"
                            ? "text-primary"
                            : w.status === "partial"
                            ? "text-amber-500"
                            : "text-destructive"
                        }
                      >
                        {w.status === "success" ? "✓" : w.status === "partial" ? "⚠" : "✗"}
                      </span>
                    </div>
                    {w.eth.status === "success" && (
                      <div className="text-muted-foreground">
                        ETH: {w.eth.txHash?.slice(0, 14)}...
                      </div>
                    )}
                    {w.tokens
                      .filter((t) => t.status === "success")
                      .map((t) => (
                        <div key={t.address} className="text-muted-foreground">
                          {t.symbol}: {t.txHash?.slice(0, 14)}...
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          {!result && (
            <>
              <Button variant="outline" onClick={onClose} className="flex-1" disabled={isRunning}>
                Cancel
              </Button>
              <Button
                onClick={handleDrain}
                disabled={isRunning || confirmText !== "DRAIN"}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Draining...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Drain All
                  </>
                )}
              </Button>
            </>
          )}
          {result && (
            <Button
              onClick={() => {
                reset()
                onClose()
              }}
              className="w-full"
            >
              Done
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}