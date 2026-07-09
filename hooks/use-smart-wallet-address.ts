"use client"

import { useWallets } from "@privy-io/react-auth"
import { useAccount } from "wagmi"
import { useMemo } from "react"

/**
 * Get the user's main wallet address from Privy or wagmi.
 *
 * IMPORTANT: We previously filtered out `smart_wallet` type because the
 * Coinbase SDK crashed on Robinhood Chain. But the user IS using a
 * Privy Kernel smart wallet (which works fine), so we MUST include it.
 *
 * Priority order:
 * 1. External wallet from wagmi (MetaMask, WalletConnect, etc.)
 * 2. Privy smart wallet (Kernel)
 * 3. Privy embedded EOA wallet
 * 4. Any wallet with an address (last resort)
 */
export function useSmartWalletAddress(): string | null {
  const { wallets } = useWallets()
  const { address } = useAccount()

  return useMemo(() => {
    // Priority 1: external wallet from wagmi (MetaMask, WalletConnect, etc.)
    if (address) return address

    // Priority 2: Privy SMART wallet (Kernel on Robinhood)
    // CRITICAL: include this — it's the user's main wallet
    const smartWallet = wallets.find(
      (w) => w.address && w.walletClientType === "smart_wallet"
    )
    if (smartWallet?.address) return smartWallet.address

    // Priority 3: Privy embedded EOA wallet
    const embeddedWallet = wallets.find(
      (w) => w.address && w.walletClientType === "embedded"
    )
    if (embeddedWallet?.address) return embeddedWallet.address

    // Priority 4: Any wallet with an address (fallback)
    const any = wallets.find((w) => w.address)
    return any?.address || null
  }, [wallets, address])
}
