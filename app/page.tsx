"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Wallet } from "lucide-react"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useAccount, useChainId } from "wagmi"
import { WalletCard } from "@/components/wallet-card"
import { TokenInput } from "@/components/token-input"
import { ConfigPanel } from "@/components/config-panel"
import { ActionButton } from "@/components/action-button"
import { BotLiveActivity } from "@/components/bot-live-activity"
import { ManageBot } from "@/components/manage-bot"
import { useUserBalances } from "@/hooks/use-token-balance"
import { useBotSession } from "@/hooks/use-bot-session"
import { useEthPrice } from "@/hooks/use-eth-price"
import { toast } from "sonner"
import Image from "next/image"

export default function HoodBumpDashboard() {
  const { ready: privyReady, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { address } = useAccount()
  const chainId = useChainId()

  const [connectedAddress, setConnectedAddress] = useState<string | null>(null)
  const [targetToken, setTargetToken] = useState<string | null>(null)
  const [isTokenVerified, setIsTokenVerified] = useState(false)
  const [buyAmountUsd, setBuyAmountUsd] = useState("0.01")
  const [intervalSeconds, setIntervalSeconds] = useState(60)
  const [isMounted, setIsMounted] = useState(false)
  const [activeTab, setActiveTab] = useState("control")

  const { eth, weth, refetch: refetchBalances } = useUserBalances(connectedAddress)
  const { session, startSession, stopSession, isStarting, isStopping } = useBotSession(connectedAddress)
  const { price: ethPrice } = useEthPrice()

  const isActive = session?.status === "running"

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Sync connected wallet address from any Privy wallet or wagmi
  useEffect(() => {
    // Pick the first wallet we can find
    const privyWallet = wallets.find((w) => w.address)?.address
    const external = address
    const final = privyWallet || external || null
    setConnectedAddress(final)
  }, [wallets, address])

  const handleStart = async () => {
    if (!targetToken) {
      toast.error("Enter a token address first")
      return
    }
    try {
      await startSession({
        tokenAddress: targetToken as `0x${string}`,
        amountUsd: buyAmountUsd,
        intervalSeconds,
      })
      toast.success("Bot started")
    } catch (err: any) {
      toast.error(err.message || "Failed to start bot")
    }
  }

  const handleStop = async () => {
    try {
      await stopSession()
      toast.success("Bot stopped")
    } catch (err: any) {
      toast.error(err.message || "Failed to stop bot")
    }
  }

  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="HoodBump"
              width={48}
              height={48}
              className="rounded-lg"
              priority
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight">HoodBump</h1>
              <p className="text-xs text-muted-foreground">
                Robinhood Chain · v0.1.0
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                authenticated ? "bg-primary animate-pulse" : "bg-muted-foreground"
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {authenticated ? "Connected" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      {!privyReady ? (
        <Card className="bg-card border-border p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading Privy...</p>
        </Card>
      ) : !authenticated ? (
        <Card className="bg-card border-border p-8 text-center">
          <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Connect Your Wallet</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in to start bumping tokens on Robinhood Chain
          </p>
          <Button
            onClick={login}
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
          >
            Connect Wallet
          </Button>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 bg-card border border-border">
            <TabsTrigger
              value="control"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Control
            </TabsTrigger>
            <TabsTrigger
              value="manage"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Manage Bot
            </TabsTrigger>
          </TabsList>

          {/* CONTROL TAB */}
          <TabsContent value="control" className="space-y-4">
            <WalletCard
              smartWalletAddress={connectedAddress}
              ethBalance={eth?.formatted}
              wethBalance={weth?.formatted}
              ethPriceUsd={ethPrice}
              onRefresh={refetchBalances}
              onDisconnect={logout}
            />

            <TokenInput
              value={targetToken}
              onChange={(addr) => {
                setTargetToken(addr)
                setIsTokenVerified(false)
              }}
              onVerified={() => setIsTokenVerified(true)}
            />

            <ConfigPanel
              buyAmountUsd={buyAmountUsd}
              onChangeAmount={setBuyAmountUsd}
              intervalSeconds={intervalSeconds}
              onChangeInterval={setIntervalSeconds}
              ethPriceUsd={ethPrice}
            />

            <ActionButton
              isActive={isActive}
              onToggle={isActive ? handleStop : handleStart}
              isVerified={isTokenVerified}
              loadingState={
                isStarting ? "Starting..." : isStopping ? "Stopping..." : null
              }
              buyAmountUsd={buyAmountUsd}
              balanceWei={eth?.value?.toString()}
            />

            <BotLiveActivity userAddress={connectedAddress} />

            <div className="text-center text-xs text-muted-foreground pt-4">
              <p>HoodBump · 1% affiliate fee · bot wallets pay own gas</p>
              <p className="mt-1">Built for Robinhood Chain (chain ID 4663)</p>
            </div>
          </TabsContent>

          {/* MANAGE BOT TAB */}
          <TabsContent value="manage" className="space-y-4">
            <ManageBot userAddress={connectedAddress} />
          </TabsContent>
        </Tabs>
      )}
    </main>
  )
}