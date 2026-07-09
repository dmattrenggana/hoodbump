import { NextRequest, NextResponse } from "next/server"
import { isAddress } from "viem"
import { getZeroXQuote, formatZeroXError } from "@/lib/swap"
import { RH_WETH_ADDRESS } from "@/lib/constants"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/0x-quote?sellToken=0x...&buyToken=0x...&sellAmount=...&takerAddress=0x...
 *
 * Get a swap quote from 0x Swap API v2
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const sellToken = searchParams.get("sellToken") || RH_WETH_ADDRESS
    const buyToken = searchParams.get("buyToken")
    const sellAmount = searchParams.get("sellAmount")
    const takerAddress = searchParams.get("takerAddress")

    if (!buyToken) {
      return NextResponse.json({ error: "Missing required parameter: buyToken" }, { status: 400 })
    }
    if (!sellAmount) {
      return NextResponse.json({ error: "Missing required parameter: sellAmount" }, { status: 400 })
    }
    if (!takerAddress) {
      return NextResponse.json({ error: "Missing required parameter: takerAddress" }, { status: 400 })
    }
    if (!isAddress(sellToken) || !isAddress(buyToken) || !isAddress(takerAddress)) {
      return NextResponse.json({ error: "Invalid address format" }, { status: 400 })
    }

    const quote = await getZeroXQuote({
      sellToken: sellToken as `0x${string}`,
      buyToken: buyToken as `0x${string}`,
      sellAmount: BigInt(sellAmount),
      takerAddress: takerAddress as `0x${string}`,
    })

    // Pass through the entire 0x response (including transaction field)
    return NextResponse.json({ success: true, quote })
  } catch (error: any) {
    console.error("❌ 0x quote error:", error)
    return NextResponse.json(
      { error: formatZeroXError(error), details: error.message },
      { status: 500 }
    )
  }
}
