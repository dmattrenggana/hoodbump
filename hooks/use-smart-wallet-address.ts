"use client"

import { useWallets } from "@privy-io/react-auth"
import { useAccount } from "wagmi"
import { useMemo } from "react"

/**
 * Get the user's main wallet address from Privy or wagmi.
 *
 * Privy wallet types observed:
 * - "privy"          → Privy embedded/smart wallet (USER'S MAIN ACCOUNT WALLET)
 * - "smart_wallet"   → AA smart wallet (Kernel, Coinbase, etc.)
 * - "embedded"       → Regular EOA from Privy
 * - "okx_wallet"     → OKX browser extension
 * - "metamask"       → MetaMask browser extension
 * - "phantom"        → Phantom (Solana main, but shows here)
 * - "walletconnect"  → WalletConnect connector
 *
 * The user's PRIMARY wallet for HoodBump is the Privy-generated one.
 * Browser extension wallets are just connected but not the user's identity.
 *
 * Priority order:
 * 1. Privy wallet (the user's account wallet)  ← HIGHEST
 * 2. External wagmi (MetaMask/OKX/etc.)
 * 3. Any wallet with address (fallback)
 */
export function useSmartWalletAddress(): string | null {
  const { wallets } = useWallets()
  const { address } = useAccount()

  return useMemo(() => {
    // Priority 1: Privy wallet (highest - this is the user's identity wallet)
    // Match all Privy-generated wallet types: "privy", "smart_wallet", "embedded"
    const privyWallet = wallets.find(
      (w) =>
        w.address &&
        (w.walletClientType === "privy" ||
          w.walletClientType === "smart_wallet" ||
          w.walletClientType === "embedded")
    )
    if (privyWallet?.address) return privyWallet.address

    // Priority 2: External wagmi (MetaMask/WalletConnect/OKX)
    if (address) return address

    // Priority 3: Any wallet with an address (last resort fallback)
    const any = wallets.find((w) => w.address)
    return any?.address || null
  }, [wallets, address])
}
