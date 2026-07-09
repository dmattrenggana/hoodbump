"use client"

import { useState, useEffect } from "react"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { useAccount, useBalance, useChainId } from "wagmi"
import { Wallet, LogOut, Zap, Loader2 } from "lucide-react"
import { formatAddress } from "@/lib/format"
import { RH_WETH_ADDRESS } from "@/lib/constants"
import { robinhoodChain } from "@/lib/chain-config"

export default function Home() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Smart Wallet address (Privy AA)
  const smartWalletAddress =
    smartWalletClient?.account?.address ||
    wallets.find((w) => (w as any).type === "smart_wallet")?.address ||
    null

  // WETH balance
  const { data: wethBalance, isLoading: isLoadingWeth } = useBalance({
    address: smartWalletAddress
      ? (smartWalletAddress as `0x${string}`)
      : undefined,
    token: RH_WETH_ADDRESS,
    chainId: robinhoodChain.id,
  })

  // Native ETH balance (for gas)
  const { data: ethBalance, isLoading: isLoadingEth } = useBalance({
    address: smartWalletAddress
      ? (smartWalletAddress as `0x${string}`)
      : undefined,
    chainId: robinhoodChain.id,
  })

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto">
      {/* Header */}
      <header className="border border-border rounded-lg bg-card p-6 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">HoodBump</h1>
              <p className="text-xs text-muted-foreground">
                Trending Bot for Robinhood Chain
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                authenticated
                  ? "bg-primary animate-pulse"
                  : "bg-muted-foreground"
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {authenticated ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </header>

      {/* Network status */}
      <div className="border border-border rounded-lg bg-card p-4 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Network</span>
          <div className="flex items-center gap-2">
            <span className="font-mono">Robinhood Chain</span>
            {chainId === robinhoodChain.id ? (
              <span className="text-xs text-primary">✓</span>
            ) : (
              <span className="text-xs text-yellow-500">⚠</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-muted-foreground">Chain ID</span>
          <span className="font-mono">{chainId || "—"}</span>
        </div>
      </div>

      {/* Main content */}
      {!ready ? (
        <div className="border border-border rounded-lg bg-card p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading Privy...</p>
        </div>
      ) : !authenticated ? (
        <div className="border border-border rounded-lg bg-card p-8 text-center">
          <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Connect Your Wallet</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in to start bumping tokens on Robinhood Chain
          </p>
          <button
            onClick={login}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <>
          {/* Smart Wallet Info */}
          <div className="border border-border rounded-lg bg-card p-6 mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">
              SMART WALLET (AA)
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Address</p>
                <p className="font-mono text-sm break-all">
                  {smartWalletAddress || "—"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    ETH (gas)
                  </p>
                  <p className="font-mono text-sm">
                    {isLoadingEth ? (
                      <Loader2 className="h-3 w-3 animate-spin inline" />
                    ) : ethBalance ? (
                      `${Number(ethBalance.formatted).toFixed(4)} ETH`
                    ) : (
                      "0"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">WETH</p>
                  <p className="font-mono text-sm">
                    {isLoadingWeth ? (
                      <Loader2 className="h-3 w-3 animate-spin inline" />
                    ) : wethBalance ? (
                      `${Number(wethBalance.formatted).toFixed(4)} WETH`
                    ) : (
                      "0"
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bot Wallets Section */}
          <div className="mb-4">
            <ManageBot />
          </div>

          {/* Phase indicator */}
          <div className="border border-border rounded-lg bg-card p-4 mb-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-3">
              ROADMAP
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                <span>Phase 1: Foundation</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                <span>Phase 2: Bot Wallets (current)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>○</span>
                <span>Phase 3: Swap Execution (0x API)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>○</span>
                <span>Phase 4: Bot Automation (worker loop)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>○</span>
                <span>Phase 5: Polish & Branding</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>○</span>
                <span>Phase 6: Deploy & Test</span>
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={logout}
            className="w-full border border-border rounded-lg bg-card p-3 text-sm text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Disconnect
          </button>
        </>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-muted-foreground mt-6">
        HoodBump v0.1.0 · Robinhood Chain · Phase 2
      </footer>
    </main>
  )
}
