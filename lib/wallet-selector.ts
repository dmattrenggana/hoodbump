/**
 * Find the next bot wallet to use for swapping.
 *
 * Strategy: Start from `startIndex`, scan forward, find the first wallet
 * with sufficient balance. If none found in the rotation, wrap around.
 *
 * Supports both ETH (native) and ERC-20 (e.g. WETH) balance checks.
 *
 * Returns the wallet index + balance. If no wallet has balance, returns null.
 */
import type { Address } from "viem"
import { createPublicClient, http, erc20Abi } from "viem"
import { robinhoodChain } from "./chain-config"

export interface BotWalletLite {
  index: number
  address: Address
}

export type BalanceToken = "ETH" | Address // Address = ERC-20 (e.g. WETH)

export async function findNextWalletWithBalance(
  wallets: BotWalletLite[],
  startIndex: number,
  minBalanceWei: bigint,
  rpcUrl: string,
  token: BalanceToken = "ETH"
): Promise<{ index: number; balance: bigint } | null> {
  if (wallets.length === 0) return null

  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  })

  // Scan all wallets starting from startIndex
  const order: BotWalletLite[] = []
  for (let i = 0; i < wallets.length; i++) {
    const idx = (startIndex + i) % wallets.length
    order.push(wallets[idx])
  }

  // Read all balances in parallel
  const balances = await Promise.all(
    order.map(async (w) => {
      try {
        const bal = token === "ETH"
          ? await publicClient.getBalance({ address: w.address })
          : (await publicClient.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [w.address],
            })) as bigint
        return { wallet: w, balance: bal }
      } catch {
        return { wallet: w, balance: 0n }
      }
    })
  )

  // Find first with sufficient balance
  for (const { wallet, balance } of balances) {
    if (balance >= minBalanceWei) {
      return { index: wallet.index, balance }
    }
  }

  return null
}