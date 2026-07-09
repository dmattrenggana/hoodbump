/**
 * Manual swap endpoint — for testing/debugging the full swap flow from browser.
 *
 * POST /api/bot/manual-swap
 * Body: {
 *   userAddress: string,
 *   walletIndex: number (0-9),
 *   buyToken: string (token address),
 *   sellAmountWei: string (e.g. "100000000000000" for 0.0001 WETH)
 * }
 *
 * Returns: { success, swapHash, buyAmount, steps: [...], error? }
 */
import { NextRequest, NextResponse } from "next/server"
import { isAddress } from "viem"
import { executeBotSwap } from "@/lib/swap"
import { RH_WETH_ADDRESS } from "@/lib/constants"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // Allow up to 60s for swap to complete

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const body = await request.json()
    const { userAddress, walletIndex, buyToken, sellAmountWei } = body

    // Validate
    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ error: "Invalid userAddress" }, { status: 400 })
    }
    if (typeof walletIndex !== "number" || walletIndex < 0 || walletIndex > 9) {
      return NextResponse.json({ error: "walletIndex must be 0-9" }, { status: 400 })
    }
    if (!buyToken || !isAddress(buyToken)) {
      return NextResponse.json({ error: "Invalid buyToken" }, { status: 400 })
    }
    if (!sellAmountWei) {
      return NextResponse.json({ error: "Missing sellAmountWei" }, { status: 400 })
    }

    const sellAmount = BigInt(sellAmountWei)
    console.log(`\n[ManualSwap] user=${userAddress} wallet=${walletIndex} buyToken=${buyToken} sellAmount=${sellAmount.toString()}`)

    const result = await executeBotSwap({
      userAddress,
      walletIndex,
      sellToken: RH_WETH_ADDRESS,
      buyToken: buyToken as `0x${string}`,
      sellAmount,
    })

    console.log(`[ManualSwap] ${result.success ? "✅ SUCCESS" : "❌ FAILED"} in ${Date.now() - startTime}ms`)
    if (result.swapHash) {
      console.log(`[ManualSwap] https://robinhoodchain.blockscout.com/tx/${result.swapHash}`)
    }

    return NextResponse.json({
      ...result,
      durationMs: Date.now() - startTime,
    })
  } catch (error: any) {
    console.error("[ManualSwap] Fatal error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal error",
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}