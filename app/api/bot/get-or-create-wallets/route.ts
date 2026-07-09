import { NextRequest, NextResponse } from "next/server"
import { isAddress } from "viem"
import { createBotWallets, getBotWallets } from "@/lib/bot-wallet"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/bot/get-or-create-wallets
 * 
 * Get or create 10 bot wallets for a user.
 * - If user has no wallets: create 10
 * - If user has 10 wallets: return existing
 * - If user has partial: error (manual cleanup needed)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddress } = body

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing required field: userAddress" },
        { status: 400 }
      )
    }

    if (!isAddress(userAddress)) {
      return NextResponse.json(
        { error: `Invalid Ethereum address: ${userAddress}` },
        { status: 400 }
      )
    }

    const wallets = await createBotWallets(userAddress)

    return NextResponse.json({
      success: true,
      wallets: wallets.map((w) => ({
        id: w.id,
        walletIndex: w.wallet_index,
        address: w.address,
        ethBalanceWei: w.eth_balance_wei,
        wethBalanceWei: w.weth_balance_wei,
        totalGasSpentWei: w.total_gas_spent_wei,
        lastSwapAt: w.last_swap_at,
        createdAt: w.created_at,
      })),
      count: wallets.length,
    })
  } catch (error: any) {
    console.error("❌ Error in get-or-create-wallets:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/bot/get-or-create-wallets?userAddress=0x...
 * Get existing bot wallets (no creation)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get("userAddress")

    if (!userAddress) {
      return NextResponse.json(
        { error: "Missing required parameter: userAddress" },
        { status: 400 }
      )
    }

    if (!isAddress(userAddress)) {
      return NextResponse.json(
        { error: `Invalid Ethereum address: ${userAddress}` },
        { status: 400 }
      )
    }

    const wallets = await getBotWallets(userAddress)

    return NextResponse.json({
      success: true,
      wallets: wallets.map((w) => ({
        id: w.id,
        walletIndex: w.wallet_index,
        address: w.address,
        ethBalanceWei: w.eth_balance_wei,
        wethBalanceWei: w.weth_balance_wei,
        totalGasSpentWei: w.total_gas_spent_wei,
        lastSwapAt: w.last_swap_at,
        createdAt: w.created_at,
      })),
      count: wallets.length,
    })
  } catch (error: any) {
    console.error("❌ Error fetching wallets:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
