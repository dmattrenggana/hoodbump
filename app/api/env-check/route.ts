import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    // Server-only (should NOT be exposed, just check presence)
    hasMasterKey: !!process.env.MASTER_ENCRYPTION_KEY,
    masterKeyLength: process.env.MASTER_ENCRYPTION_KEY?.length || 0,
    masterKeyIsHex: /^[0-9a-fA-F]+$/.test(process.env.MASTER_ENCRYPTION_KEY || ""),
    
    // Critical env vars
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasSupabaseService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    
    hasZeroXKey: !!process.env.ZEROX_API_KEY,
    hasPrivyAppId: !!process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    
    // RPC
    rpcUrl: process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL || "(default)",
    alchemyUrl: process.env.NEXT_PUBLIC_HOODBUMP_ALCHEMY_URL ? "(set)" : "(missing)",
    
    timestamp: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
  })
}