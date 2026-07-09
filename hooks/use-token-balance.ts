"use client"

import { useBalance } from "wagmi"
import { type Address } from "viem"
import { useSmartWalletAddress } from "./use-smart-wallet-address"
import { robinhoodChain } from "@/lib/chain-config"

interface TokenBalance {
  formatted: string
  symbol: string
  value: bigint
}

/**
 * Get ETH (native) and token balances for the user's smart wallet.
 * Replaces inline balance formatting like:
 *   `${Number(ethBalance.formatted).toFixed(4)} ETH`
 */
export function useUserBalances(tokenAddress?: Address) {
  const smartWalletAddress = useSmartWalletAddress()

  // Native ETH balance (for gas)
  const ethBalanceQuery = useBalance({
    address: smartWalletAddress ?? undefined,
    chainId: robinhoodChain.id,
  })

  // Token balance (e.g., WETH)
  const tokenBalanceQuery = useBalance({
    address: smartWalletAddress ?? undefined,
    token: tokenAddress,
    chainId: robinhoodChain.id,
  })

  return {
    eth: ethBalanceQuery.data
      ? {
          formatted: ethBalanceQuery.data.formatted,
          symbol: ethBalanceQuery.data.symbol,
          value: ethBalanceQuery.data.value,
        }
      : null,
    token: tokenBalanceQuery.data
      ? {
          formatted: tokenBalanceQuery.data.formatted,
          symbol: tokenBalanceQuery.data.symbol,
          value: tokenBalanceQuery.data.value,
        }
      : null,
    isLoading: ethBalanceQuery.isLoading || tokenBalanceQuery.isLoading,
    refetch: () => {
      ethBalanceQuery.refetch()
      tokenBalanceQuery.refetch()
    },
  }
}
