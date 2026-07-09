import { NextRequest, NextResponse } from "next/server"
import { isAddress } from "viem"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/bot/logs?userAddress=0x...&limit=20
 * Get recent bot activity logs for a user.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get("userAddress")
    const limit = parseInt(searchParams.get("limit") || "20", 10)

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json(
        { error: "Missing or invalid userAddress" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from("bot_logs")
      .select("*")
      .eq("user_address", userAddress.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 100))

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({
      success: true,
      logs: data || [],
    })
  } catch (error: any) {
    console.error("❌ Get logs error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
