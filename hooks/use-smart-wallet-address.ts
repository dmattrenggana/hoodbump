"use client"

import { useWallets } from "@privy-io/react-auth"
import { useAccount } from "wagmi"
import { useMemo } from "react"

/**
 * Get the user's main wallet address from Privy or wagmi.
 * Falls back to the first available wallet address.
 *
 * Note: We intentionally DON'T use @privy-io/react-auth/smart-wallets
 * because that module loads Coinbase Smart Wallet SDK which crashes
 * on Robinhood Chain (no chain support).
 */
export function useSmartWalletAddress(): string | null {
  const { wallets } = useWallets()
  const { address } = useAccount()

  return useMemo(() => {
    // Priority 1: external wallet from wagmi (MetaMask, WalletConnect, etc.)
    if (address) return address

    // Priority 2: Privy embedded wallet
    const privyWallet = wallets.find((w) => w.address && w.walletClientType !== "smart_wallet")
    if (privyWallet?.address) return privyWallet.address

    // Priority 3: any wallet (even smart_wallet - just for display)
    const any = wallets.find((w) => w.address)
    return any?.address || null
  }, [wallets, address])
}