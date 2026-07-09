import { NextRequest, NextResponse } from "next/server"
import { isAddress, createPublicClient, http, formatUnits, encodeFunctionData, decodeFunctionResult, type Address, type Hex } from "viem"
import { createBotWallets, getBotWallets } from "@/lib/bot-wallet"
import { robinhoodChain } from "@/lib/chain-config"
import { RH_WETH_ADDRESS } from "@/lib/constants"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const RPC_URL =
  process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL ||
  process.env.HOODBUMP_RPC_URL ||
  "https://rpc.mainnet.chain.robinhood.com"

const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(RPC_URL),
})

const ERC20_BALANCE_OF_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

/**
 * Fetch live on-chain balances for all bot wallets.
 * Updates DB with fresh values and returns them.
 */
async function fetchAndSyncBalances(
  userAddress: string,
  wallets: Array<{ id: string; wallet_index: number; address: string }>
) {
  const { createSupabaseServiceClient } = await import("@/lib/supabase")
  const supabase = createSupabaseServiceClient()
  const results: Array<{
    id: string
    address: string
    ethBalanceWei: string
    wethBalanceWei: string
  }> = []

  // Batch ETH balance calls
  const ethBalancePromises = wallets.map((w) =>
    publicClient
      .getBalance({ address: w.address as Address })
      .then((bal) => ({ id: w.id, eth: bal }))
      .catch((err) => {
        console.error(`[balance] ETH fetch failed for ${w.address}:`, err)
        return { id: w.id, eth: 0n }
      })
  )

  // Batch WETH balance calls (ERC-20 balanceOf)
  const wethBalancePromises = wallets.map((w) =>
    publicClient
      .readContract({
        address: RH_WETH_ADDRESS as Address,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [w.address as Address],
      })
      .then((bal) => ({ id: w.id, weth: bal as bigint }))
      .catch((err) => {
        console.error(`[balance] WETH fetch failed for ${w.address}:`, err)
        return { id: w.id, weth: 0n }
      })
  )

  const [ethResults, wethResults] = await Promise.all([
    Promise.all(ethBalancePromises),
    Promise.all(wethBalancePromises),
  ])

  // Merge results by id
  const ethMap = new Map(ethResults.map((r) => [r.id, r.eth]))
  const wethMap = new Map(wethResults.map((r) => [r.id, r.weth]))

  for (const w of wallets) {
    const eth = ethMap.get(w.id) ?? 0n
    const weth = wethMap.get(w.id) ?? 0n
    results.push({
      id: w.id,
      address: w.address,
      ethBalanceWei: eth.toString(),
      wethBalanceWei: weth.toString(),
    })
  }

  // Update DB with fresh balances (fire and forget — non-blocking)
  Promise.all(
    results.map((r) =>
      supabase
        .from("bot_wallets")
        .update({
          eth_balance_wei: r.ethBalanceWei,
          weth_balance_wei: r.wethBalanceWei,
        })
        .eq("id", r.id)
        .then(({ error }) => {
          if (error) console.error(`[balance] DB update failed for ${r.id}:`, error)
        })
    )
  ).catch((err) => console.error("[balance] DB sync error:", err))

  return results
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress } = body

    if (!userAddress) {
      return NextResponse.json({ error: "Missing required field: userAddress" }, { status: 400 })
    }
    if (!isAddress(userAddress)) {
      return NextResponse.json({ error: `Invalid Ethereum address: ${userAddress}` }, { status: 400 })
    }

    const wallets = await createBotWallets(userAddress)

    // Fetch live on-chain balances
    const liveBalances = await fetchAndSyncBalances(
      userAddress,
      wallets.map((w) => ({ id: w.id, wallet_index: w.wallet_index, address: w.address }))
    )
    const balanceMap = new Map(liveBalances.map((b) => [b.id, b]))

    return NextResponse.json({
      success: true,
      wallets: wallets.map((w) => {
        const live = balanceMap.get(w.id)
        return {
          id: w.id,
          walletIndex: w.wallet_index,
          address: w.address,
          ethBalanceWei: live?.ethBalanceWei ?? w.eth_balance_wei,
          wethBalanceWei: live?.wethBalanceWei ?? w.weth_balance_wei,
          totalGasSpentWei: w.total_gas_spent_wei,
          lastSwapAt: w.last_swap_at,
          createdAt: w.created_at,
        }
      }),
      count: wallets.length,
    })
  } catch (error: any) {
    console.error("❌ Error in get-or-create-wallets:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get("userAddress")

    if (!userAddress) {
      return NextResponse.json({ error: "Missing required parameter: userAddress" }, { status: 400 })
    }
    if (!isAddress(userAddress)) {
      return NextResponse.json({ error: `Invalid Ethereum address: ${userAddress}` }, { status: 400 })
    }

    const wallets = await getBotWallets(userAddress)

    // Fetch live on-chain balances
    const liveBalances = await fetchAndSyncBalances(
      userAddress,
      wallets.map((w) => ({ id: w.id, wallet_index: w.wallet_index, address: w.address }))
    )
    const balanceMap = new Map(liveBalances.map((b) => [b.id, b]))

    return NextResponse.json({
      success: true,
      wallets: wallets.map((w) => {
        const live = balanceMap.get(w.id)
        return {
          id: w.id,
          walletIndex: w.wallet_index,
          address: w.address,
          ethBalanceWei: live?.ethBalanceWei ?? w.eth_balance_wei,
          wethBalanceWei: live?.wethBalanceWei ?? w.weth_balance_wei,
          totalGasSpentWei: w.total_gas_spent_wei,
          lastSwapAt: w.last_swap_at,
          createdAt: w.created_at,
        }
      }),
      count: wallets.length,
    })
  } catch (error: any) {
    console.error("❌ Error fetching wallets:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
