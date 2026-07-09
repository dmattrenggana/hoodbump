#!/usr/bin/env node
/**
 * Debug script — manually test the full swap flow on Robinhood Chain.
 *
 * Usage:
 *   npx tsx scripts/debug-swap.mjs <botWalletIndex>
 *
 * Examples:
 *   npx tsx scripts/debug-swap.mjs 1    # test bot wallet #1 (index 0)
 *   npx tsx scripts/debug-swap.mjs 2    # test bot wallet #2 (index 1)
 *
 * Requires .env.local with:
 *   - NEXT_PUBLIC_HOODBUMP_RPC_URL
 *   - ZEROX_API_KEY
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - MASTER_ENCRYPTION_KEY
 */

import "dotenv/config"
import { createWalletClient, http, encodeFunctionData, parseAbi, formatEther } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { decryptPrivateKey } from "../lib/bot-wallet-encryption.js"
import { createClient } from "@supabase/supabase-js"

const ROBINHOOD_CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL] } },
}

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
const ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734"
const TEST_BUY_TOKEN = process.argv[3] || "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" // USDG
const WALLET_INDEX = parseInt(process.argv[2] || "0")
const USER_ADDRESS = process.env.DEBUG_USER_ADDRESS || "0x51472D91647d06eC1E9bbd676fd638da8Eb9CdaB"
const SELL_AMOUNT_WEI = 100000000000000n // 0.0001 WETH

async function main() {
  console.log("=== HoodBump Debug Swap ===\n")
  console.log("User:", USER_ADDRESS)
  console.log("Wallet index:", WALLET_INDEX)
  console.log("Sell amount:", formatEther(SELL_AMOUNT_WEI), "WETH")
  console.log("Buy token:", TEST_BUY_TOKEN)
  console.log()

  // 1. Get bot wallet from Supabase
  console.log("[1] Loading bot wallet from Supabase...")
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: wallets, error } = await supabase
    .from("bot_wallets")
    .select("*")
    .eq("user_address", USER_ADDRESS.toLowerCase())
    .order("wallet_index", { ascending: true })

  if (error) throw error
  if (!wallets || wallets.length === 0) throw new Error("No bot wallets found")

  const wallet = wallets[WALLET_INDEX]
  if (!wallet) throw new Error(`Wallet index ${WALLET_INDEX} not found`)

  console.log("    Address:", wallet.address)

  // 2. Decrypt private key
  console.log("[2] Decrypting private key...")
  const privateKey = decryptPrivateKey(wallet.encrypted_private_key)
  const account = privateKeyToAccount(privateKey)
  console.log("    Account:", account.address)

  // 3. Setup clients
  const { createPublicClient } = await import("viem")
  const publicClient = createPublicClient({ chain: ROBINHOOD_CHAIN, transport: http() })
  const walletClient = createWalletClient({ account, chain: ROBINHOOD_CHAIN, transport: http() })

  // 4. Check balances
  console.log("[3] Checking balances...")
  const ethBalance = await publicClient.getBalance({ address: account.address })
  const wethBalance = await publicClient.readContract({
    address: WETH,
    abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
    functionName: "balanceOf",
    args: [account.address],
  })
  const allowance = await publicClient.readContract({
    address: WETH,
    abi: parseAbi(["function allowance(address,address) view returns (uint256)"]),
    functionName: "allowance",
    args: [account.address, ALLOWANCE_HOLDER],
  })
  console.log("    ETH:", formatEther(ethBalance))
  console.log("    WETH:", formatEther(wethBalance))
  console.log("    Allowance → AH:", formatEther(allowance))

  if (wethBalance < SELL_AMOUNT_WEI) {
    throw new Error(`Insufficient WETH: ${formatEther(wethBalance)} < ${formatEther(SELL_AMOUNT_WEI)}`)
  }
  if (ethBalance < 100000000000000n) {
    throw new Error(`Insufficient ETH for gas: ${formatEther(ethBalance)}`)
  }

  // 5. Get 0x quote
  console.log("\n[4] Getting 0x v2 quote...")
  const quoteUrl = new URL("https://api.0x.org/swap/allowance-holder/quote")
  quoteUrl.searchParams.set("chainId", "4663")
  quoteUrl.searchParams.set("sellToken", WETH)
  quoteUrl.searchParams.set("buyToken", TEST_BUY_TOKEN)
  quoteUrl.searchParams.set("sellAmount", SELL_AMOUNT_WEI.toString())
  quoteUrl.searchParams.set("taker", account.address)
  quoteUrl.searchParams.set("slippageBps", "100")

  const quoteRes = await fetch(quoteUrl, {
    headers: {
      "0x-api-key": process.env.ZEROX_API_KEY,
      "0x-version": "v2",
    },
  })
  const quote = await quoteRes.json()
  if (!quoteRes.ok) {
    throw new Error(`0x quote failed: ${quote.message || quote.reason || quoteRes.statusText}`)
  }
  console.log("    Buy amount:", quote.buyAmount)
  console.log("    Gas:", quote.gas)
  console.log("    Allowance target:", quote.allowanceTarget)
  console.log("    Liquidity:", quote.liquidityAvailable)
  console.log("    Simulation incomplete:", quote.issues?.simulationIncomplete)
  console.log("    Issues balance:", JSON.stringify(quote.issues?.balance))
  console.log("    Issues allowance:", JSON.stringify(quote.issues?.allowance))

  // 6. Approve if needed
  if (allowance < SELL_AMOUNT_WEI) {
    console.log("\n[5] Approving WETH → AllowanceHolder (MAX_UINT256)...")
    const MAX_UINT256 = (1n << 256n) - 1n
    const approveData = encodeFunctionData({
      abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
      functionName: "approve",
      args: [ALLOWANCE_HOLDER, MAX_UINT256],
    })
    const approveHash = await walletClient.sendTransaction({
      to: WETH,
      data: approveData,
      gas: 60000n,
    })
    console.log("    Tx:", approveHash)
    const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
    console.log("    Status:", approveReceipt.status, "Block:", approveReceipt.blockNumber)
    if (approveReceipt.status !== "success") throw new Error("Approve reverted")
  } else {
    console.log("\n[5] Skipping approve (existing allowance sufficient)")
  }

  // 7. Execute swap
  console.log("\n[6] Executing swap...")
  console.log("    To:", quote.transaction.to)
  console.log("    Data length:", quote.transaction.data.length)
  const swapHash = await walletClient.sendTransaction({
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: BigInt(quote.transaction.value || "0"),
    gas: BigInt(quote.transaction.gas || quote.gas || "300000"),
  })
  console.log("    Tx:", swapHash)
  console.log("\nWaiting for confirmation...")
  const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: swapHash })
  console.log("\n✅ Swap confirmed!")
  console.log("    Status:", swapReceipt.status)
  console.log("    Block:", swapReceipt.blockNumber)
  console.log("    Gas used:", swapReceipt.gasUsed.toString())
  console.log("    Tx:", `https://robinhoodchain.blockscout.com/tx/${swapHash}`)
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message)
  console.error(err)
  process.exit(1)
})