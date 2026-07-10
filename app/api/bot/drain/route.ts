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

// Tokens to drain (extend as needed)
const KNOWN_TOKENS = [
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", // WETH
  "0xa379a3955e496cde8635586293117e7272d14157", // CLANKHOOD
  "0xc72c01aAB5f5678dc1d6f5c6d2b417d91d402ba3", // HOODIE
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
        console.log(`[Drain] Wallet ${i} (${wallet.address}): balance=${formatEther(ethBalance)} ETH`)
        // Leave tiny dust for future gas (1 wei is fine, but use 1000 to be safe)
        const transferAmount = ethBalance - 1000n
        if (transferAmount > 0n) {
          console.log(`[Drain] Wallet ${i}: sending ${formatEther(transferAmount)} ETH → ${recipient}`)
          const hash = await signAndSendTransaction(userAddress, wallet.wallet_index, {
            to: recipient,
            value: transferAmount,
            // 30k gas handles EOA → smart contract recipients (receive
            // function may consume extra gas). 21k is minimum for EOA → EOA.
            gas: 30000n,
          })
          console.log(`[Drain] Wallet ${i}: tx=${hash}`)
          await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
          result.eth = {
            txHash: hash,
            amount: transferAmount.toString(),
            status: "success",
          }
        } else {
          result.eth = { amount: "0", status: "skipped" }
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