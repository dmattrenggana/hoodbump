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
 *    - Check + approve allowance (if needed)
 *    - Execute swap
 *    - Update wallet balances
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
  updateWalletBalances,
} from "../lib/bot-wallet"
import { getZeroXQuote, buildSwapFromQuote, formatZeroXError } from "../lib/swap"
import {
  getNextInterval,
  shouldSkipCycle,
  getVariableAmount,
} from "../lib/anti-detection"
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

    // 2. Anti-detection: skip cycle
    if (shouldSkipCycle()) {
      console.log(`⏭️ [Skip] ${userAddress} (anti-detection)`)
      await logBotEvent({
        user_address: userAddress,
        session_id: session.id,
        action: "cycle_skipped",
        status: "info",
        message: "[Anti-detection] Cycle skipped to simulate human behavior",
      })
      return { shouldContinue: true }
    }

    // 3. Get bot wallets
    const botWallets = await getBotWallets(userAddress)
    if (botWallets.length === 0) {
      console.error(`❌ No bot wallets for ${userAddress}`)
      await deactivateSession(userAddress, "No bot wallets")
      return { shouldContinue: false }
    }

    // 4. Pick wallet via round-robin
    const walletIndex = session.wallet_rotation_index % WALLETS_PER_USER
    const currentWallet = botWallets[walletIndex]
    console.log(`\n🔄 [${userAddress}] Wallet #${walletIndex + 1}: ${currentWallet.address}`)

    // 5. Calculate amount with anti-detection variance
    const ethPriceUsd = await getEthPriceUsd()
    const baseAmountWei = usdToWei(parseFloat(session.amount_usd), ethPriceUsd)
    const amountWei = getVariableAmount(baseAmountWei)
    console.log(`   Amount: ${(Number(amountWei) / 1e18).toFixed(6)} ETH ($${session.amount_usd})`)

    // 6. Check wallet has enough WETH
    const publicClient = getPublicClient()
    const wethBalance = (await publicClient.readContract({
      address: RH_WETH_ADDRESS,
      abi: [
        {
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [currentWallet.address as `0x${string}`],
    })) as bigint

    if (wethBalance < amountWei) {
      console.log(`   ⚠️ Insufficient WETH (${(Number(wethBalance) / 1e18).toFixed(4)} < ${(Number(amountWei) / 1e18).toFixed(4)})`)
      
      // Check if ALL wallets are out
      const allEmpty = botWallets.every(
        (w) => BigInt(w.weth_balance_wei) < baseAmountWei
      )
      if (allEmpty) {
        console.log(`   🛑 All bot wallets depleted`)
        await deactivateSession(userAddress, "All bot wallets depleted")
        return { shouldContinue: false }
      }
      // Rotate to next wallet
      const nextIndex = (walletIndex + 1) % WALLETS_PER_USER
      await updateSessionRotation(session.id, nextIndex)
      return { shouldContinue: true }
    }

    // 7. Get 0x quote
    let quote
    try {
      quote = await getZeroXQuote({
        sellToken: RH_WETH_ADDRESS,
        buyToken: session.token_address as `0x${string}`,
        sellAmount: amountWei,
        takerAddress: currentWallet.address as `0x${string}`,
      })
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

    // 8. Check + approve allowance if needed
    const allowanceTarget = quote.allowanceTarget as `0x${string}`
    const currentAllowance = (await publicClient.readContract({
      address: RH_WETH_ADDRESS,
      abi: [
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "allowance",
      args: [currentWallet.address as `0x${string}`, allowanceTarget],
    })) as bigint

    if (currentAllowance < amountWei) {
      console.log(`   📝 Approving WETH...`)
      const approvalData = `0x095ea7b3${allowanceTarget
        .slice(2)
        .toLowerCase()}ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff` as `0x${string}`

      try {
        const approvalHash = await signAndSendTransaction(
          userAddress,
          walletIndex,
          {
            to: RH_WETH_ADDRESS,
            data: approvalData,
            value: BigInt(0),
          }
        )
        console.log(`   ✅ Approval: ${approvalHash}`)
        await logBotEvent({
          user_address: userAddress,
          session_id: session.id,
          bot_wallet_address: currentWallet.address,
          action: "approval_granted",
          status: "success",
          tx_hash: approvalHash,
          token_address: RH_WETH_ADDRESS,
        })
      } catch (error: any) {
        console.error(`   ❌ Approval failed: ${error.message}`)
        await logBotEvent({
          user_address: userAddress,
          session_id: session.id,
          bot_wallet_address: currentWallet.address,
          action: "approval_failed",
          status: "error",
          message: error.message,
        })
        const nextIndex = (walletIndex + 1) % WALLETS_PER_USER
        await updateSessionRotation(session.id, nextIndex)
        return { shouldContinue: true }
      }
    }

    // 9. Execute swap
    const txParams = buildSwapFromQuote(quote)
    console.log(`   📤 Sending swap tx...`)
    const swapHash = await signAndSendTransaction(
      userAddress,
      walletIndex,
      {
        to: txParams.to,
        data: txParams.data,
        value: txParams.value,
        gas: txParams.gasLimit,
      }
    )

    // 10. Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: swapHash as `0x${string}`,
      confirmations: 1,
    })
    console.log(`   ✅ Swap confirmed in block ${receipt.blockNumber}`)

    // 11. Update balances
    const newEthBalance = await publicClient.getBalance({
      address: currentWallet.address as `0x${string}`,
    })
    const newWethBalance = (await publicClient.readContract({
      address: RH_WETH_ADDRESS,
      abi: [
        {
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [currentWallet.address as `0x${string}`],
    })) as bigint
    const gasSpent = BigInt(currentWallet.total_gas_spent_wei) + BigInt(receipt.gasUsed * receipt.effectiveGasPrice)

    await updateWalletBalances(
      userAddress,
      walletIndex,
      newEthBalance,
      newWethBalance,
      gasSpent
    )

    await logBotEvent({
      user_address: userAddress,
      session_id: session.id,
      bot_wallet_address: currentWallet.address,
      action: "swap_executed",
      status: "success",
      tx_hash: swapHash,
      amount_wei: amountWei.toString(),
      token_address: session.token_address,
      message: `[Worker] Swapped ${(Number(amountWei) / 1e18).toFixed(6)} WETH for ${session.token_address.slice(0, 10)}...`,
    })

    // 12. Rotate wallet
    const nextIndex = (walletIndex + 1) % WALLETS_PER_USER
    await updateSessionRotation(session.id, nextIndex)
    
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
  const actualInterval = getNextInterval(baseIntervalMs)
  console.log(`⏰ [${userAddress}] Next swap in ${(actualInterval / 1000).toFixed(0)}s`)

  state.timeoutId = setTimeout(async () => {
    const result = await processUserCycle(state)
    if (result.shouldContinue) {
      scheduleNextSwap(userAddress)
    } else {
      // Cleanup
      activeUsers.delete(userAddress)
    }
  }, actualInterval)
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
  console.log(`🎭 Anti-detection: ${MIN_INTERVAL_SECONDS}s min, ±30% jitter, 8% skip`)
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
