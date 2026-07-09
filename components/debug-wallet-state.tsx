"use client"

import { useWallets, usePrivy } from "@privy-io/react-auth"
import { useAccount } from "wagmi"
import { useEffect, useState } from "react"
import { useSmartWalletAddress } from "@/hooks/use-smart-wallet-address"

/**
 * Debug widget to see exact wallet state.
 * Visible in the UI for now to debug re-login issue.
 */
export function DebugWalletState() {
  const { wallets } = useWallets()
  const { ready, authenticated, user } = usePrivy()
  const { address: wagmiAddress } = useAccount()
  const smartAddr = useSmartWalletAddress()
  const [renderTime, setRenderTime] = useState("")

  useEffect(() => {
    setRenderTime(new Date().toISOString().slice(11, 19))
  }, [])

  return (
    <div className="border border-yellow-500/50 rounded-lg bg-yellow-500/5 p-3 text-xs font-mono space-y-1">
      <div className="font-bold text-yellow-500">🔍 DEBUG: Wallet State</div>
      <div>renderTime: {renderTime}</div>
      <div>privyReady: <span className="text-primary">{String(ready)}</span></div>
      <div>authenticated: <span className="text-primary">{String(authenticated)}</span></div>
      <div>user?.id: <span className="text-primary">{user?.id?.slice(0,12) || "null"}</span></div>
      <div>wallets count: <span className="text-primary">{wallets?.length || 0}</span></div>
      <div>wagmi address: <span className="text-primary">{wagmiAddress || "null"}</span></div>
      <div>smartAddr: <span className="text-primary">{smartAddr || "null"}</span></div>
      <div className="pt-1 border-t border-yellow-500/30">
        {wallets?.length === 0 ? (
          <div className="text-muted-foreground italic">(no wallets)</div>
        ) : (
          wallets?.map((w, i) => (
            <div key={i} className="text-[10px] truncate">
              #{i}: type=`{w.walletClientType}` addr={w.address?.slice(0, 14)}...
            </div>
          ))
        )}
      </div>
    </div>
  )
}
