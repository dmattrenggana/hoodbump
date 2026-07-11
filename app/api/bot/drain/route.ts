/**
 * Drain bot wallets — transfer ALL ETH and ALL ERC-20 tokens from all
 * 10 bot wallets back to the user's smart wallet.
 *
 * POST /api/bot/drain
 * Body: { userAddress: "0x..." }
 *
 * Use case: when user wants to stop the bot and reclaim all funds.
 *
 * Implementation:
 *   1. List all 10 bot wallets
 *   2. For each wallet: read ETH + every known token balance
 *   3. Sequentially sign+send transfer txs from each bot wallet to the
 *      user's smart wallet. Sequential (not parallel) to keep nonce
 *      management simple per bot wallet.
 *
 * Gas reserves: leave MIN_RESERVE_WEI (default 0.0001 ETH) in each bot
 * wallet for the next gas payment. (Currently set to 0 — transfer everything
 * since these wallets are no longer needed once drained.)
 */
import { NextRequest, NextResponse } from "next/server"
import { isAddress, getAddress, createPublicClient, http, erc20Abi, formatEther, type Address } from "viem"
import { getBotWallets, signAndSendTransaction, getPublicClient } from "@/lib/bot-wallet"
import { robinhoodChain } from "@/lib/chain-config"

export const dynamic = "force-dynamic"
export const maxDuration = 120 // 2 min for draining 10 wallets

// Tokens to drain (extend as needed) — use checksummed addresses
const KNOWN_TOKENS = [
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", // WETH
  "0xa379a3955e496cde8635586293117e7272d14157", // CLANKHOOD
  "0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3", // HOODIE
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG
  "0x43d9a5cb3c0299e3de882e10036ee9de0497f234", // HOODBUMP (placeholder)
]

interface DrainResult {
  walletIndex: number
  walletAddress: string
  eth: { txHash?: string; amount: string; status: "success" | "error" | "skipped" }
  tokens: Array<{
    symbol: string
    address: string
    txHash?: string
    amount: string
    status: "success" | "error" | "skipped"
    error?: string
  }>
  status: "success" | "partial" | "error"
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const body = await request.json()
    const { userAddress } = body

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ error: "Invalid userAddress" }, { status: 400 })
    }
    const recipient = getAddress(userAddress) as Address
    console.log(`[Drain] Starting drain for ${userAddress} → ${recipient}`)

    const wallets = await getBotWallets(userAddress)
    if (wallets.length === 0) {
      return NextResponse.json({ error: "No bot wallets found" }, { status: 404 })
    }

    const publicClient = getPublicClient()
    const results: DrainResult[] = []

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i]
      const result: DrainResult = {
        walletIndex: wallet.wallet_index,
        walletAddress: wallet.address,
        eth: { amount: "0", status: "skipped" },
        tokens: [],
        status: "success",
      }

      // 1. Drain ETH (native)
      try {
        const ethBalance = await publicClient.getBalance({
          address: wallet.address as `0x${string}`,
        })
        const gasPrice = await publicClient.getGasPrice()
        // Reserve gas for the transfer itself (30k gas × gas price + buffer)
        const GAS_LIMIT = 30000n
        const gasCost = gasPrice * GAS_LIMIT
        // Leave 2x gas cost as dust to be safe (covers gas price fluctuations)
        const dust = gasCost * 2n
        const transferAmount = ethBalance - dust

        console.log(`[Drain] Wallet ${i} (${wallet.address}): balance=${formatEther(ethBalance)} ETH, gasPrice=${gasPrice}, dust=${formatEther(dust)}`)

        if (transferAmount <= 0n) {
          console.log(`[Drain] Wallet ${i}: skipped (insufficient balance to cover gas)`)
          result.eth = {
            amount: ethBalance.toString(),
            status: "skipped",
            error: `Balance ${formatEther(ethBalance)} ETH < gas reserve ${formatEther(dust)} ETH`,
          } as any
        } else {
          console.log(`[Drain] Wallet ${i}: sending ${formatEther(transferAmount)} ETH → ${recipient}`)
          const hash = await signAndSendTransaction(userAddress, wallet.wallet_index, {
            to: recipient,
            value: transferAmount,
            gas: GAS_LIMIT,
          })
          console.log(`[Drain] Wallet ${i}: tx=${hash}`)
          await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
          result.eth = {
            txHash: hash,
            amount: transferAmount.toString(),
            status: "success",
          }
        }
      } catch (err: any) {
        const errMsg = err?.shortMessage || err?.message || JSON.stringify(err).slice(0, 200)
        console.error(`[Drain] Wallet ${i} ETH failed:`, errMsg)
        result.eth = {
          amount: "0",
          status: "error",
          error: errMsg,
        } as any
        result.status = "partial"
      }

      // 2. Drain each known token
      for (const tokenAddr of KNOWN_TOKENS) {
        try {
          // First check if contract exists at this address
          const code = await publicClient.getBytecode({
            address: tokenAddr as `0x${string}`,
          })
          if (!code || code === "0x") {
            // No contract deployed — silently skip
            continue
          }

          const balance = (await publicClient.readContract({
            address: tokenAddr as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.address as `0x${string}`],
          })) as bigint

          if (balance === 0n) {
            result.tokens.push({
              symbol: "?",
              address: tokenAddr,
              amount: "0",
              status: "skipped",
            })
            continue
          }

          // Get symbol for friendly display
          let symbol = "?"
          try {
            symbol = (await publicClient.readContract({
              address: tokenAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: "symbol",
            })) as string
          } catch {}

          // Transfer full balance
          const { encodeFunctionData } = await import("viem")
          const data = encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [recipient, balance],
          })
          const hash = await signAndSendTransaction(userAddress, wallet.wallet_index, {
            to: tokenAddr as `0x${string}`,
            data,
            value: 0n,
            gas: 80000n,
          })
          await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })

          result.tokens.push({
            symbol,
            address: tokenAddr,
            txHash: hash,
            amount: balance.toString(),
            status: "success",
          })
        } catch (err: any) {
          console.error(`[Drain] Wallet ${i} ${tokenAddr} failed:`, err.message)
          result.tokens.push({
            symbol: "?",
            address: tokenAddr,
            amount: "0",
            status: "error",
            error: err.message?.slice(0, 200),
          } as any)
          if (result.status === "success") result.status = "partial"
        }
      }

      results.push(result)
    }

    const summary = {
      total: results.length,
      success: results.filter((r) => r.status === "success").length,
      partial: results.filter((r) => r.status === "partial").length,
      error: results.filter((r) => r.status === "error").length,
    }

    console.log(`[Drain] Done: ${JSON.stringify(summary)} in ${Date.now() - startTime}ms`)

    return NextResponse.json({
      success: summary.error === 0,
      recipient,
      summary,
      results,
      durationMs: Date.now() - startTime,
    })
  } catch (error: any) {
    console.error("[/api/bot/drain]", error)
    return NextResponse.json(
      { success: false, error: error.message, durationMs: Date.now() - Date.now() },
      { status: 500 }
    )
  }
}