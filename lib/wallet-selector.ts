/**
 * Find the next bot wallet to use for swapping.
 *
 * Two strategies:
 *
 * 1. findNextWalletWithBalance():
 *    Scans from startIndex, returns FIRST wallet with sufficient balance.
 *    Good for "stick to first available wallet until depleted".
 *
 * 2. findNthWalletWithBalance():
 *    Picks the N-th wallet with balance (n = cycle number since session start).
 *    Distributes swaps evenly across all wallets with balance.
 *
 * Both support ETH (native) and ERC-20 balance checks.
 */
import type { Address } from "viem"
import { createPublicClient, http, erc20Abi } from "viem"
import { robinhoodChain } from "./chain-config"

export interface BotWalletLite {
  index: number
  address: Address
}

export type BalanceToken = "ETH" | Address // Address = ERC-20 (e.g. WETH)

/**
 * Read all wallet balances in parallel.
 * Returns array of { index, balance } sorted by index.
 */
async function readAllBalances(
  wallets: BotWalletLite[],
  rpcUrl: string,
  token: BalanceToken
): Promise<Array<{ index: number; balance: bigint }>> {
  if (wallets.length === 0) return []

  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  })

  const results = await Promise.all(
    wallets.map(async (w) => {
      try {
        const bal = token === "ETH"
          ? await publicClient.getBalance({ address: w.address })
          : (await publicClient.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [w.address],
            })) as bigint
        return { index: w.index, balance: bal }
      } catch {
        return { index: w.index, balance: 0n }
      }
    })
  )

  return results
}

/**
 * Pick the first wallet (scanning from startIndex) with sufficient balance.
 * Returns null if none have enough.
 */
export async function findNextWalletWithBalance(
  wallets: BotWalletLite[],
  startIndex: number,
  minBalanceWei: bigint,
  rpcUrl: string,
  token: BalanceToken = "ETH"
): Promise<{ index: number; balance: bigint } | null> {
  const balances = await readAllBalances(wallets, rpcUrl, token)

  // Find wallets with sufficient balance
  const funded = balances.filter((b) => b.balance >= minBalanceWei)
  if (funded.length === 0) return null

  // Pick the one closest to startIndex (round-robin from current position)
  const sortedByDistance = funded.sort((a, b) => {
    const distA = (a.index - startIndex + wallets.length) % wallets.length
    const distB = (b.index - startIndex + wallets.length) % wallets.length
    return distA - distB
  })

  return sortedByDistance[0]
}

/**
 * Pick the N-th wallet (since session start) with sufficient balance.
 * Cycles through all funded wallets evenly.
 *
 * Use cycleIndex = (total swaps since session start) % fundedWalletCount.
 */
export async function findNthWalletWithBalance(
  wallets: BotWalletLite[],
  cycleIndex: number,
  minBalanceWei: bigint,
  rpcUrl: string,
  token: BalanceToken = "ETH"
): Promise<{ index: number; balance: bigint } | null> {
  const balances = await readAllBalances(wallets, rpcUrl, token)

  // Find wallets with sufficient balance, sort by index for deterministic order
  const funded = balances
    .filter((b) => b.balance >= minBalanceWei)
    .sort((a, b) => a.index - b.index)

  if (funded.length === 0) return null

  // Pick cycleIndex % funded.length
  const pickIndex = cycleIndex % funded.length
  return funded[pickIndex]
}