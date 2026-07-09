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
import { getZeroXQuote, buildSwapFromQuote, formatZeroXError } from "../lib/swap"
import { encodeFunctionData } from "viem"
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

    // 4. Calculate amount with anti-detection variance
    const ethPriceUsd = await getEthPriceUsd()
    const baseAmountWei = usdToWei(parseFloat(session.amount_usd), ethPriceUsd)
    const amountWei = getVariableAmount(baseAmountWei)
    console.log(`   Amount: ${(Number(amountWei) / 1e18).toFixed(6)} ETH ($${session.amount_usd})`)

    // 5. Find next wallet with sufficient balance (skip empty wallets)
    // This prevents the worker from getting stuck on one wallet when only
    // one has funds — picks the first wallet with WETH >= amountWei.
    const { findNextWalletWithBalance } = await import("../lib/wallet-selector")
    const walletResult = await findNextWalletWithBalance(
      botWallets.map((w, i) => ({ index: i, address: w.address as `0x${string}` })),
      session.wallet_rotation_index % WALLETS_PER_USER,
      amountWei,
      process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL!
    )
    if (!walletResult) {
      console.log(`   🛑 All bot wallets depleted (no wallet has ${(Number(amountWei) / 1e18).toFixed(6)} WETH)`)
      await deactivateSession(userAddress, "All bot wallets depleted")
      return { shouldContinue: false }
    }
    const walletIndex = walletResult.index
    const currentWallet = botWallets[walletIndex]
    const wethBalance = walletResult.balance
    console.log(`\n🔄 [${userAddress}] Wallet #${walletIndex + 1}: ${currentWallet.address} (WETH: ${(Number(wethBalance) / 1e18).toFixed(6)})`)

    const publicClient = getPublicClient()

    // 7. Get 0x quote
    let quote
    try {
      quote = await getZeroXQuote({
        sellToken: RH_WETH_ADDRESS,
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

    // 8. Approve WETH to AllowanceHolder (REQUIRED on Robinhood's standard AllowanceHolder)
    // The Robinhood AllowanceHolder is the standard 0x v2 AllowanceHolder contract which
    // does regular ERC20 `transferFrom(owner, recipient, amount)` internally — it needs
    // an actual ERC20 allowance (NOT Permit2). Without approve, exec() reverts silently.
    //
    // Note: quote.allowanceTarget is the spender (AllowanceHolder address).
    const txParams = buildSwapFromQuote(quote)
    const allowanceTarget = txParams.allowanceTarget
    console.log(`   🔍 AllowanceHolder: ${allowanceTarget}`)

    const currentAllowance = (await publicClient.readContract({
      address: RH_WETH_ADDRESS,
      abi: [
        {
          name: "allowance",
          type: "function",
          stateMutability: "view",
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          outputs: [{ name: "", type: "uint256" }],
        },
      ],
      functionName: "allowance",
      args: [
        currentWallet.address as `0x${string}`,
        allowanceTarget,
      ],
    })) as bigint

    if (currentAllowance < amountWei) {
      console.log(
        `   🔓 Approving WETH → ${allowanceTarget.slice(0, 10)}... (current ${(Number(currentAllowance) / 1e18).toFixed(6)}, need ${(Number(amountWei) / 1e18).toFixed(6)})`
      )
      // MAX_UINT256 = (2n ** 256n) - 1n
      const MAX_UINT256 = (1n << 256n) - 1n
      const approveHash = await signAndSendTransaction(
        userAddress,
        walletIndex,
        {
          to: RH_WETH_ADDRESS,
          data: encodeFunctionData({
            abi: [
              {
                name: "approve",
                type: "function",
                stateMutability: "nonpayable",
                inputs: [
                  { name: "spender", type: "address" },
                  { name: "amount", type: "uint256" },
                ],
                outputs: [{ name: "", type: "bool" }],
              },
            ],
            functionName: "approve",
            args: [allowanceTarget, MAX_UINT256],
          }),
          value: 0n,
          gas: 60000n, // explicit gas for ERC20 approve (avoid estimateGas edge cases)
        }
      )
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveHash,
        confirmations: 1,
      })
      if (approveReceipt.status !== "success") {
        throw new Error(`Approve reverted`)
      }
      console.log(`   ✅ Approved (block ${approveReceipt.blockNumber})`)
    } else {
      console.log(`   ✅ Existing allowance sufficient`)
    }

    // 9. Execute swap (with 20% gas buffer for safety)
    const swapGas = (txParams.gasLimit * 120n) / 100n
    console.log(`   📤 Sending swap tx (gas=${swapGas})...`)
    const swapHash = await signAndSendTransaction(
      userAddress,
      walletIndex,
      {
        to: txParams.to,
        data: txParams.data,
        value: txParams.value,
        gas: swapGas,
      }
    )
    console.log(`   🔗 Swap tx: ${swapHash}`)
    console.log(`   🔗 Explorer: https://robinhoodchain.blockscout.com/tx/${swapHash}`)

    // 10. Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: swapHash as `0x${string}`,
      confirmations: 1,
    })
    console.log(`   ✅ Swap confirmed in block ${receipt.blockNumber}`)

    // 11. On-chain is source of truth — skip DB balance update.
    // Bot log records the tx hash + amount; balances read live from chain.

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
      message: `[Worker] Swapped ${(Number(amountWei) / 1e18).toFixed(6)} WETH → ${buyTokenSymbol} (wallet #${walletIndex + 1}: ${currentWallet.address.slice(0, 6)}...${currentWallet.address.slice(-4)})`,
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
