/**
 * Access gate — verify user holds minimum $HOODBUMP tokens.
 *
 * Used to gate bot usage: only $HOODBUMP holders can run the bump bot.
 * Aligns incentives (bot activity = $HOODBUMP demand) + anti-bot (sybil
 * resistance — 10M token cost to attack).
 */
import { type Address, createPublicClient, http, erc20Abi } from "viem"
import { robinhoodChain } from "./chain-config"
import { HOODBUMP_TOKEN_ADDRESS, MIN_HOODBUMP_HOLD } from "./constants"

export interface HoldCheckResult {
  eligible: boolean
  balance: bigint
  required: bigint
  shortfall: bigint
  symbol?: string
  formatted?: { balance: string; required: string; shortfall: string }
  error?: string
}

export async function checkHoodbumpHold(
  userAddress: Address
): Promise<HoldCheckResult> {
  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport: http(process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL!),
  })

  // Check if HOODBUMP token is deployed (has contract code)
  const code = await publicClient.getCode({ address: HOODBUMP_TOKEN_ADDRESS })
  if (!code || code === "0x") {
    // Token not deployed yet — bypass gate (beta mode)
    return {
      eligible: true,
      balance: 0n,
      required: MIN_HOODBUMP_HOLD,
      shortfall: 0n,
      symbol: "HOODBUMP",
      formatted: {
        balance: "0",
        required: "10,000,000",
        shortfall: "0",
      },
      error: "HOODBUMP token not deployed yet — gate bypassed (beta mode)",
    }
  }

  // Read balance + symbol
  const [balance, decimals, symbol] = await Promise.all([
    publicClient.readContract({
      address: HOODBUMP_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [userAddress],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: HOODBUMP_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: "decimals",
    }) as Promise<number>,
    publicClient.readContract({
      address: HOODBUMP_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: "symbol",
    }) as Promise<string>,
  ])

  const divisor = 10n ** BigInt(decimals)
  const requiredFormatted = Number(MIN_HOODBUMP_HOLD / divisor).toLocaleString()
  const balanceFormatted = Number(balance / divisor).toLocaleString()
  const shortfall = balance < MIN_HOODBUMP_HOLD ? MIN_HOODBUMP_HOLD - balance : 0n
  const shortfallFormatted = Number(shortfall / divisor).toLocaleString()

  return {
    eligible: balance >= MIN_HOODBUMP_HOLD,
    balance,
    required: MIN_HOODBUMP_HOLD,
    shortfall,
    symbol,
    formatted: {
      balance: balanceFormatted,
      required: requiredFormatted,
      shortfall: shortfallFormatted,
    },
  }
}