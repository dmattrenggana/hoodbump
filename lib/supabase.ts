import { createClient, SupabaseClient } from "@supabase/supabase-js"

/**
 * Supabase client setup for HoodBump
 * 
 * Two clients:
 * 1. createSupabaseClient() - for client-side (uses anon key)
 * 2. createSupabaseServiceClient() - for server-side (uses service role key)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Singleton for client-side (prevents multiple GoTrueClient instances)
let supabaseClientInstance: SupabaseClient | null = null

/**
 * Client-side Supabase client (uses anon key)
 * Use this in components, hooks, client-side logic
 */
export function createSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }

  if (supabaseClientInstance) {
    return supabaseClientInstance
  }

  supabaseClientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return supabaseClientInstance
}

/**
 * Server-side Supabase client (uses service role key - bypasses RLS)
 * Use this in API routes, workers, server-side logic
 */
export function createSupabaseServiceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase service role key. Set SUPABASE_SERVICE_ROLE_KEY in env."
    )
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
