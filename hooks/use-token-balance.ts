"use client"

import { useBalance } from "wagmi"
import { type Address } from "viem"
import { robinhoodChain } from "@/lib/chain-config"

interface TokenBalance {
  formatted: string
  symbol: string
  value: bigint
}

/**
 * Get ETH (native) and token balances for the given wallet address.
 *
 * IMPORTANT: The wallet address MUST be passed explicitly from page.tsx
 * (which derives it from Privy wallets). Earlier versions called
 * useSmartWalletAddress internally, which had timing issues — the
 * address was often null on first render even after login.
 *
 * Usage:
 *   const { eth, weth, refetch } = useUserBalances(walletAddress)
 */
export function useUserBalances(walletAddress: string | null) {
  // Only query when address is set
  const enabled = !!walletAddress

  // Native ETH balance (for gas)
  const ethBalanceQuery = useBalance({
    address: walletAddress ?? undefined,
    chainId: robinhoodChain.id,
    query: { enabled, refetchInterval: 15_000 },
  })

  // Token balance (e.g., WETH) — only if explicitly requested
  // (Note: caller should use useWethBalance separately for clarity)

  return {
    eth: ethBalanceQuery.data
      ? {
          formatted: ethBalanceQuery.data.formatted,
          symbol: ethBalanceQuery.data.symbol,
          value: ethBalanceQuery.data.value,
        }
      : null,
    isLoading: ethBalanceQuery.isLoading,
    refetch: () => ethBalanceQuery.refetch(),
  }
}

/**
 * Get WETH (ERC-20 token) balance for the given wallet address.
 * Separate hook so we don't conflate with ETH native balance.
 */
export function useWethBalance(walletAddress: string | null, wethAddress: Address) {
  const enabled = !!walletAddress
  const tokenQuery = useBalance({
    address: walletAddress ?? undefined,
    token: wethAddress,
    chainId: robinhoodChain.id,
    query: { enabled, refetchInterval: 15_000 },
  })

  return {
    weth: tokenQuery.data
      ? {
          formatted: tokenQuery.data.formatted,
          symbol: tokenQuery.data.symbol,
          value: tokenQuery.data.value,
        }
      : null,
    isLoading: tokenQuery.isLoading,
    refetch: () => tokenQuery.refetch(),
  }
}
