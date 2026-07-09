/**
 * Manual swap endpoint — for testing/debugging the full swap flow from browser.
 *
 * POST /api/bot/manual-swap
 * Body: {
 *   userAddress: string,
 *   walletIndex: number (0-9),
 *   buyToken: string (token address),
 *   sellAmountWei: string (e.g. "100000000000000" for 0.0001 WETH)
 *   useNativeEth: boolean (default false) — set true to swap native ETH (no WETH wrap)
 * }
 *
 * Returns: { success, swapHash, buyAmount, buyTokenSymbol, sellTokenSymbol, steps: [...], error? }
 */
import { NextRequest, NextResponse } from "next/server"
import { isAddress, getAddress } from "viem"
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
import { executeBotSwap, executeEthSwap } from "@/lib/swap"
import { getTokenMetadata } from "@/lib/token-name"
import { RH_WETH_ADDRESS } from "@/lib/constants"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const body = await request.json()
    const { userAddress, walletIndex, buyToken, sellAmountWei, useNativeEth = false } = body

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ error: "Invalid userAddress" }, { status: 400 })
    }
    if (typeof walletIndex !== "number" || walletIndex < 0 || walletIndex > 9) {
      return NextResponse.json({ error: "walletIndex must be 0-9" }, { status: 400 })
    }
    // Accept address in any case — normalize via getAddress() (works on all-lowercase or all-uppercase too)
    let normalizedBuyToken: `0x${string}`
    try {
      normalizedBuyToken = getAddress(buyToken) as `0x${string}`
    } catch {
      return NextResponse.json({ error: `Invalid buyToken: ${buyToken}` }, { status: 400 })
    }
    if (!sellAmountWei) {
      return NextResponse.json({ error: "Missing sellAmountWei" }, { status: 400 })
    }

    const sellAmount = BigInt(sellAmountWei)
    const sellToken = useNativeEth ? ETH_ADDRESS : RH_WETH_ADDRESS

    console.log(`\n[ManualSwap] user=${userAddress} wallet=${walletIndex} useNativeEth=${useNativeEth}`)
    console.log(`[ManualSwap] sellToken=${sellToken} buyToken=${normalizedBuyToken} sellAmount=${sellAmount.toString()}`)

    const result = useNativeEth
      ? await executeEthSwap({
          userAddress,
          walletIndex,
          buyToken: normalizedBuyToken,
          sellAmount,
        })
      : await executeBotSwap({
          userAddress,
          walletIndex,
          sellToken: RH_WETH_ADDRESS,
          buyToken: normalizedBuyToken,
          sellAmount,
        })

    // Look up token symbols for response
    const [sellTokenMeta, buyTokenMeta] = await Promise.all([
      useNativeEth
        ? Promise.resolve({ symbol: "ETH", decimals: 18 })
        : getTokenMetadata(RH_WETH_ADDRESS),
      getTokenMetadata(normalizedBuyToken),
    ])

    console.log(`[ManualSwap] ${result.success ? "✅ SUCCESS" : "❌ FAILED"} in ${Date.now() - startTime}ms`)
    if (result.swapHash) {
      console.log(`[ManualSwap] https://robinhoodchain.blockscout.com/tx/${result.swapHash}`)
    }

    // Convert BigInt fields to strings for JSON serialization
    // (NextResponse.json uses JSON.stringify which can't handle BigInt)
    const serializedResult = JSON.parse(
      JSON.stringify(result, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    )

    return NextResponse.json({
      ...serializedResult,
      sellTokenSymbol: sellTokenMeta.symbol,
      buyTokenSymbol: buyTokenMeta.symbol,
      buyTokenDecimals: buyTokenMeta.decimals,
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