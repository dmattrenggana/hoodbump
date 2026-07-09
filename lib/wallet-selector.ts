/**
 * Find the next bot wallet to use for swapping.
 *
 * Strategy: Start from `startIndex`, scan forward, find the first wallet
 * with sufficient WETH balance. If none found in the rotation, wrap around.
 *
 * This prevents the worker from getting "stuck" on a single wallet when
 * only one has funds — instead it finds any wallet with balance and uses it.
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

export async function findNextWalletWithBalance(
  wallets: BotWalletLite[],
  startIndex: number,
  minBalanceWei: bigint,
  rpcUrl: string
): Promise<{ index: number; balance: bigint } | null> {
  if (wallets.length === 0) return null

  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  })

  const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address

  // Scan all wallets starting from startIndex
  // First pass: from startIndex to end
  // Second pass: from 0 to startIndex (wrap around)
  const order: BotWalletLite[] = []
  for (let i = 0; i < wallets.length; i++) {
    const idx = (startIndex + i) % wallets.length
    order.push(wallets[idx])
  }

  // Read all balances in parallel
  const balances = await Promise.all(
    order.map(async (w) => {
      try {
        const bal = (await publicClient.readContract({
          address: WETH,
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