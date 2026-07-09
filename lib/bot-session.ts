import { createSupabaseServiceClient } from "./supabase"

/**
 * Bot session database operations.
 * 
 * Tables: bot_sessions, bot_logs
 */

export interface BotSession {
  id: string
  user_address: string
  token_address: string
  amount_usd: string
  interval_seconds: number
  wallet_rotation_index: number
  status: "pending" | "running" | "stopped" | "completed" | "failed"
  started_at: string | null
  stopped_at: string | null
  created_at: string
  updated_at: string
}

export interface BotLog {
  id: string
  user_address: string
  bot_wallet_address: string | null
  session_id: string | null
  action: string
  status: "success" | "error" | "info" | "pending"
  message: string | null
  tx_hash: string | null
  amount_wei: string | null
  token_address: string | null
  error_details: string | null
  created_at: string
}

/**
 * Get all active (running) bot sessions.
 * Worker polls this every 30s to know which users need swaps.
 */
export async function getActiveSessions(): Promise<BotSession[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("status", "running")
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch active sessions: ${error.message}`)
  }

  return (data || []) as BotSession[]
}

/**
 * Update wallet rotation index for a session.
 * Called after each swap to advance to next bot wallet.
 */
export async function updateSessionRotation(
  sessionId: string,
  newIndex: number
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from("bot_sessions")
    .update({ wallet_rotation_index: newIndex, updated_at: new Date().toISOString() })
    .eq("id", sessionId)

  if (error) {
    throw new Error(`Failed to update session rotation: ${error.message}`)
  }
}

/**
 * Deactivate a session (mark as stopped).
 * Used when balance depleted, error occurred, or user manually stops.
 */
export async function deactivateSession(
  userAddress: string,
  reason: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from("bot_sessions")
    .update({
      status: "stopped",
      stopped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_address", userAddress.toLowerCase())
    .eq("status", "running")

  if (error) {
    throw new Error(`Failed to deactivate session: ${error.message}`)
  }

  await logBotEvent({
    user_address: userAddress.toLowerCase(),
    action: "session_stopped",
    status: "info",
    message: `[Worker] Session stopped: ${reason}`,
  })
}

/**
 * Log a bot event to bot_logs table.
 */
export async function logBotEvent(event: {
  user_address: string
  bot_wallet_address?: string | null
  session_id?: string | null
  action: string
  status: "success" | "error" | "info" | "pending"
  message?: string | null
  tx_hash?: string | null
  amount_wei?: string | null
  token_address?: string | null
  error_details?: string | null
}): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.from("bot_logs").insert({
    ...event,
    bot_wallet_address: event.bot_wallet_address || null,
    session_id: event.session_id || null,
    message: event.message || null,
    tx_hash: event.tx_hash || null,
    amount_wei: event.amount_wei || null,
    token_address: event.token_address || null,
    error_details: event.error_details || null,
  })

  if (error) {
    console.error("❌ Failed to log bot event:", error)
  }
}
