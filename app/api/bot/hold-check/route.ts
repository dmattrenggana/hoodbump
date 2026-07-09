/**
 * Hold check endpoint — verify user holds minimum $HOODBUMP tokens.
 *
 * GET /api/bot/hold-check?userAddress=0x...
 * Returns: { eligible, balance, required, shortfall, symbol, ... }
 *
 * Used by the dashboard to show a hold-status banner before user tries
 * to start a session.
 */
import { NextRequest, NextResponse } from "next/server"
import { isAddress, getAddress } from "viem"
import { checkHoodbumpHold } from "@/lib/hold-gate"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddressRaw = searchParams.get("userAddress")
    if (!userAddressRaw || !isAddress(userAddressRaw)) {
      return NextResponse.json({ error: "Invalid userAddress" }, { status: 400 })
    }
    const userAddress = getAddress(userAddressRaw) as `0x${string}`

    const result = await checkHoodbumpHold(userAddress)
    return NextResponse.json({
      eligible: result.eligible,
      balance: result.formatted?.balance || "0",
      required: result.formatted?.required || "10,000,000",
      shortfall: result.formatted?.shortfall || "0",
      symbol: result.symbol || "HOODBUMP",
      bypassed: result.error?.includes("not deployed"),
      error: result.error,
    })
  } catch (error: any) {
    console.error("[/api/bot/hold-check]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}