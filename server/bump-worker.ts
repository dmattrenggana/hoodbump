#!/usr/bin/env node
/**
 * HoodBump Bot Worker
 * 
 * Long-running background process that:
 * 1. Polls Supabase every 30s for active bot sessions
 * 2. For each active session, runs a periodic swap loop
 * 3. Each cycle:
 *    - Anti-detection check (skip 8% of cycles)
 *    - Pick bot wallet via round-robin
 *    - Calculate variable amount (±30% of base)
 *    - Get 0x quote (WETH → target token)
 *    - Approve WETH → AllowanceHolder (if allowance < amount)
 *    - Execute swap
 *    - Log to bot_logs
 *    - Schedule next swap with jitter
 * 
 * Run: tsx server/bump-worker.ts
 * OR:  npx ts-node server/bump-worker.ts
 * 
 * Deployment: Railway / Fly.io (long-running)
 * NOT for Vercel (Vercel has 10-60s serverless timeouts)
 */

import "dotenv/config"
import {
  getActiveSessions,
  updateSessionRotation,
  deactivateSession,
  logBotEvent,
  type BotSession,
} from "../lib/bot-session"
import {
  getBotWallets,
  signAndSendTransaction,
  getPublicClient,
} from "../lib/bot-wallet"
import { getZeroXQuote, buildSwapFromQuote, formatZeroXError, executeEthSwap } from "../lib/swap"
import { getEthPriceUsd, usdToWei } from "../lib/eth-price"
import { RH_WETH_ADDRESS, WALLETS_PER_USER, MIN_INTERVAL_SECONDS } from "../lib/constants"

// ============================================
// Configuration
// ============================================
const POLLING_INTERVAL_MS = 30_000 // 30s (poll DB for new sessions)
const MAX_RETRIES_PER_CYCLE = 3
const RETRY_DELAY_MS = 5_000

// Track active sessions in memory
const activeUsers = new Map<
  string,
  {
    session: BotSession
    timeoutId: NodeJS.Timeout | null
    consecutiveFailures: number
    swapCount: number  // total swaps since session start (for true round-robin)
  }
>()

// ============================================
// Core: Execute one swap cycle for a session
// ============================================
async function processUserCycle(state: {
  session: BotSession
  consecutiveFailures: number
}): Promise<{ shouldContinue: boolean }> {
  const { session } = state
  const userAddress = session.user_address

  try {
    // 1. Check session still running
    const activeSessions = await getActiveSessions()
    const currentSession = activeSessions.find((s) => s.id === session.id)
    if (!currentSession || currentSession.status !== "running") {
      console.log(`⏹️ Session stopped for ${userAddress}`)
      return { shouldContinue: false }
    }

    // 2. (skip-cycle removed — anti-detection disabled per user request)

    // 3. Get bot wallets
    const botWallets = await getBotWallets(userAddress)
    if (botWallets.length === 0) {
      console.error(`❌ No bot wallets for ${userAddress}`)
      await deactivateSession(userAddress, "No bot wallets")
      return { shouldContinue: false }
    }

    // 4. Calculate amount (fixed — no anti-detection variance)
    const ethPriceUsd = await getEthPriceUsd()
    const amountWei = usdToWei(parseFloat(session.amount_usd), ethPriceUsd)
    console.log(`   Amount: ${(Number(amountWei) / 1e18).toFixed(6)} ETH ($${session.amount_usd})`)

    // 5. Pick wallet via TRUE round-robin across all funded wallets
    // Use swapCount (incremented each cycle) to cycle through funded wallets evenly,
    // instead of just sticking to the first wallet with balance.
    const { findNthWalletWithBalance } = await import("../lib/wallet-selector")
    const walletResult = await findNthWalletWithBalance(
      botWallets.map((w, i) => ({ index: i, address: w.address as `0x${string}` })),
      state.swapCount,
      amountWei,
      process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL!,
      "ETH"
    )
    if (!walletResult) {
      console.log(`   🛑 All bot wallets depleted (no wallet has ${(Number(amountWei) / 1e18).toFixed(6)} ETH)`)
      await deactivateSession(userAddress, "All bot wallets depleted")
      return { shouldContinue: false }
    }
    const walletIndex = walletResult.index
    const currentWallet = botWallets[walletIndex]
    const ethBalance = walletResult.balance
    console.log(`\n🔄 [${userAddress}] Wallet #${walletIndex + 1}: ${currentWallet.address} (ETH: ${(Number(ethBalance) / 1e18).toFixed(6)})`)

    const publicClient = getPublicClient()

    // 7. Get 0x quote (selling native ETH via 0x v2 Settler)
    let quote
    try {
      const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
      quote = await getZeroXQuote({
        sellToken: ETH_ADDRESS as `0x${string}`,
        buyToken: session.token_address as `0x${string}`,
        sellAmount: amountWei,
        takerAddress: currentWallet.address as `0x${string}`,
      })
      console.log(
        `   📋 Quote: buyAmount=${(Number(quote.buyAmount) / 1e18).toFixed(6)} gas=${quote.gas}`
      )
      if (quote.issues?.simulationIncomplete) {
        console.warn(`   ⚠️ Quote simulation incomplete — swap may revert`)
      }
    } catch (error: any) {
      console.error(`   ❌ Quote failed: ${formatZeroXError(error)}`)
      await logBotEvent({
        user_address: userAddress,
        session_id: session.id,
        bot_wallet_address: currentWallet.address,
        action: "quote_failed",
        status: "error",
        message: formatZeroXError(error),
        error_details: error.message,
        token_address: session.token_address,
      })
      // Rotate to next wallet
      const nextIndex = (walletIndex + 1) % WALLETS_PER_USER
      await updateSessionRotation(session.id, nextIndex)
      return { shouldContinue: true }
    }

    // 8. Execute ETH swap via 0x v2 (uses Settler contract)
    // No WETH wrap, no approve step — just send ETH value with swap calldata.
    console.log(`   📤 Sending ETH swap tx...`)
    const ethSwapResult = await executeEthSwap({
      userAddress,
      walletIndex,
      buyToken: session.token_address as `0x${string}`,
      sellAmount: amountWei,
    })

    if (!ethSwapResult.success) {
      throw new Error(ethSwapResult.error || "ETH swap failed")
    }

    const swapHash = ethSwapResult.swapHash!
    console.log(`   🔗 Swap tx: ${swapHash}`)
    console.log(`   🔗 Explorer: https://robinhoodchain.blockscout.com/tx/${swapHash}`)

    // Look up buy token name for friendly log message (with cache)
    const { getTokenMetadata } = await import("../lib/token-name")
    const buyTokenMeta = await getTokenMetadata(session.token_address as `0x${string}`)
    const buyTokenSymbol = buyTokenMeta.symbol

    await logBotEvent({
      user_address: userAddress,
      session_id: session.id,
      bot_wallet_address: currentWallet.address,
      action: "swap_executed",
      status: "success",
      tx_hash: swapHash,
      amount_wei: amountWei.toString(),
      token_address: session.token_address,
      message: `[Worker] Swapped ${(Number(amountWei) / 1e18).toFixed(6)} ETH → ${buyTokenSymbol} (wallet #${walletIndex + 1}: ${currentWallet.address.slice(0, 6)}...${currentWallet.address.slice(-4)})`,
    })

    // 12. Rotate wallet
    const nextIndex = (walletIndex + 1) % WALLETS_PER_USER
    await updateSessionRotation(session.id, nextIndex)

    // Increment total swap count for round-robin distribution
    state.swapCount++

    // Reset failure count on success
    state.consecutiveFailures = 0

    return { shouldContinue: true }
  } catch (error: any) {
    console.error(`❌ Cycle error for ${userAddress}:`, error.message)
    state.consecutiveFailures++

    await logBotEvent({
      user_address: userAddress,
      session_id: session.id,
      action: "cycle_error",
      status: "error",
      message: error.message,
      error_details: error.stack?.substring(0, 500),
    })

    if (state.consecutiveFailures >= MAX_RETRIES_PER_CYCLE) {
      await deactivateSession(
        userAddress,
        `Too many consecutive failures (${state.consecutiveFailures})`
      )
      return { shouldContinue: false }
    }

    return { shouldContinue: true }
  }
}

// ============================================
// Schedule next swap for a user
// ============================================
function scheduleNextSwap(userAddress: string) {
  const state = activeUsers.get(userAddress)
  if (!state) return

  if (state.timeoutId) clearTimeout(state.timeoutId)

  const baseIntervalMs = state.session.interval_seconds * 1000
  console.log(`⏰ [${userAddress}] Next swap in ${(baseIntervalMs / 1000).toFixed(0)}s (fixed)`)

  state.timeoutId = setTimeout(async () => {
    const result = await processUserCycle(state)
    if (result.shouldContinue) {
      scheduleNextSwap(userAddress)
    } else {
      // Cleanup
      activeUsers.delete(userAddress)
    }
  }, baseIntervalMs)
}

// ============================================
// Poll for active sessions (every 30s)
// ============================================
async function pollActiveSessions() {
  try {
    const sessions = await getActiveSessions()
    console.log(`📊 Polled ${sessions.length} active session(s)`)

    for (const session of sessions) {
      if (!activeUsers.has(session.user_address)) {
        console.log(`🆕 New session for ${session.user_address}`)
        const state = {
          session,
          timeoutId: null as NodeJS.Timeout | null,
          consecutiveFailures: 0,
          swapCount: 0,
        }
        activeUsers.set(session.user_address, state)
        // Start immediately
        const result = await processUserCycle(state)
        if (result.shouldContinue) {
          scheduleNextSwap(session.user_address)
        }
      }
    }

    // Cleanup inactive users
    for (const [userAddress, state] of activeUsers.entries()) {
      const stillActive = sessions.some((s) => s.user_address === userAddress)
      if (!stillActive) {
        console.log(`🧹 Cleanup inactive user: ${userAddress}`)
        if (state.timeoutId) clearTimeout(state.timeoutId)
        activeUsers.delete(userAddress)
      }
    }
  } catch (error: any) {
    console.error(`❌ Poll error: ${error.message}`)
  }
}

// ============================================
// Graceful shutdown
// ============================================
function gracefulShutdown() {
  console.log("\n🛑 Shutdown signal received")
  for (const [userAddress, state] of activeUsers.entries()) {
    if (state.timeoutId) clearTimeout(state.timeoutId)
    console.log(`🧹 Cleared timeout for ${userAddress}`)
  }
  console.log("✅ Cleanup complete")
  process.exit(0)
}

process.on("SIGTERM", gracefulShutdown)
process.on("SIGINT", gracefulShutdown)

// ============================================
// Boot
// ============================================
async function startWorker() {
  console.log("\n=================================================")
  console.log("🚀 HoodBump Bump Worker Started")
  console.log("=================================================")
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`⏱️  Polling interval: ${POLLING_INTERVAL_MS / 1000}s`)
  console.log(`🔗 Chain: Robinhood (${process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL?.slice(0, 40)}...)`)
  console.log(`💰 Swap provider: 0x (1% affiliate fee)`)
  console.log(`📦 Build: ${process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "local"} @ ${new Date().toISOString()}`)
  console.log("=================================================\n")

  // Initial poll
  await pollActiveSessions()

  // Set up polling
  setInterval(pollActiveSessions, POLLING_INTERVAL_MS)
  console.log(`✅ Worker initialized\n`)
}

startWorker().catch((error) => {
  console.error("❌ Fatal error starting worker:", error)
  process.exit(1)
})
