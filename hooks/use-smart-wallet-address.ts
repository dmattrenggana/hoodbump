"use client"

import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { useMemo } from "react"
import { type Address } from "viem"

/**
 * Get the user's Privy Smart Wallet (AA) address.
 * 
 * Duplicated logic was in app/page.tsx and components/manage-bot.tsx.
 * Now extracted to a single hook for reuse.
 */
export function useSmartWalletAddress(): Address | null {
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()

  return useMemo(() => {
    if (!smartWalletClient && wallets.length === 0) return null

    // Priority 1: smart wallet client (Privy AA)
    if (smartWalletClient?.account?.address) {
      return smartWalletClient.account.address as Address
    }

    // Priority 2: find smart wallet type in wallets array
    const smartWallet = wallets.find(
      (w) => (w as any).type === "smart_wallet"
    )
    return (smartWallet?.address as Address) || null
  }, [wallets, smartWalletClient])
}
