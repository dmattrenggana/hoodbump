import { NextRequest, NextResponse } from "next/server"
import { isAddress, getAddress } from "viem"
import { createSupabaseServiceClient } from "@/lib/supabase"
import { getEthPriceUsd, usdToWei } from "@/lib/eth-price"
import { getBotWallets } from "@/lib/bot-wallet"
import {
  ANTI_DETECTION_CONFIG,
  MIN_INTERVAL_SECONDS,
  MAX_INTERVAL_SECONDS,
  MIN_SWAP_USD,
  WALLETS_PER_USER,
} from "@/lib/constants"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface StartSessionRequest {
  userAddress: string
  tokenAddress: string
  amountUsd: string
  intervalSeconds: number
}

/**
 * POST /api/bot/session
 * 
 * Start a new bot session.
 * Validates: token address, amount, interval, wallet existence.
 */
export async function POST(request: NextRequest) {
  try {
    const body: StartSessionRequest = await request.json()
    const { userAddress, tokenAddress, amountUsd, intervalSeconds } = body

    // Validate required fields
    if (!userAddress || !tokenAddress || !amountUsd || !intervalSeconds) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (!isAddress(userAddress) || !isAddress(tokenAddress)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      )
    }

    const normalizedUser = userAddress.toLowerCase()
    const checksummedToken = getAddress(tokenAddress) // validate + checksum

    // Validate amount
    const amountValue = parseFloat(amountUsd)
    if (isNaN(amountValue) || amountValue < MIN_SWAP_USD) {
      return NextResponse.json(
        { error: `Minimum amount is $${MIN_SWAP_USD.toFixed(2)} USD` },
        { status: 400 }
      )
    }

    // Validate interval
    if (intervalSeconds < MIN_INTERVAL_SECONDS || intervalSeconds > MAX_INTERVAL_SECONDS) {
      return NextResponse.json(
        {
          error: `Interval must be ${MIN_INTERVAL_SECONDS}-${MAX_INTERVAL_SECONDS} seconds`,
        },
        { status: 400 }
      )
    }

    // Check if user has bot wallets
    const wallets = await getBotWallets(normalizedUser)
    if (wallets.length !== WALLETS_PER_USER) {
      return NextResponse.json(
        {
          error: `Need ${WALLETS_PER_USER} bot wallets. You have ${wallets.length}. Create them first.`,
        },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()

    // Check for existing active session
    const { data: existing } = await supabase
      .from("bot_sessions")
      .select("id")
      .eq("user_address", normalizedUser)
      .eq("status", "running")
      .single()

    if (existing) {
      return NextResponse.json(
        { error: "You already have an active session. Stop it first." },
        { status: 409 }
      )
    }

    // Convert USD to wei (for display, not stored)
    const ethPriceUsd = await getEthPriceUsd()
    const amountWei = usdToWei(amountValue, ethPriceUsd)

    // Create session
    const { data: session, error } = await supabase
      .from("bot_sessions")
      .insert({
        user_address: normalizedUser,
        token_address: checksummedToken,
        amount_usd: amountUsd,
        interval_seconds: intervalSeconds,
        wallet_rotation_index: 0,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("❌ Create session error:", error)
      return NextResponse.json(
        { error: "Failed to create session", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      session,
      config: {
        amountWei: amountWei.toString(),
        amountEth: (Number(amountWei) / 1e18).toFixed(6),
        ethPriceUsd,
        antiDetection: ANTI_DETECTION_CONFIG,
      },
    })
  } catch (error: any) {
    console.error("❌ Start session error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/bot/session?userAddress=0x...
 * Stop active session.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get("userAddress")

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json(
        { error: "Missing or invalid userAddress" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from("bot_sessions")
      .update({
        status: "stopped",
        stopped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_address", userAddress.toLowerCase())
      .eq("status", "running")
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: "No active session found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, session: data })
  } catch (error: any) {
    console.error("❌ Stop session error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/bot/session?userAddress=0x...
 * Get current session status.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get("userAddress")

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json(
        { error: "Missing or invalid userAddress" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from("bot_sessions")
      .select("*")
      .eq("user_address", userAddress.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      session: data || null,
    })
  } catch (error: any) {
    console.error("❌ Get session error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
