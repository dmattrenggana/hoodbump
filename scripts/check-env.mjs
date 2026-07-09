#!/usr/bin/env node
// Diagnostic script: print all env vars (with values masked) so we can
// see exactly what's loaded vs missing in Railway.

const required = [
  "MASTER_ENCRYPTION_KEY",
  "ZEROX_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "NEXT_PUBLIC_HOODBUMP_RPC_URL",
  "HOODBUMP_RPC_URL",
]

console.log("=== ENV DIAGNOSTIC ===\n")

// All SUPABASE-related vars (catches typos)
const supabaseVars = Object.keys(process.env)
  .filter((k) => k.toLowerCase().includes("supabase"))
  .sort()
console.log("SUPABASE-related vars:", supabaseVars.length > 0 ? supabaseVars : "(none)")

// All ZEROX/Master/RPC related vars
const otherVars = Object.keys(process.env)
  .filter(
    (k) =>
      k.toLowerCase().includes("zero") ||
      k.toLowerCase().includes("master") ||
      k.toLowerCase().includes("rpc") ||
      k.toLowerCase().includes("privy")
  )
  .sort()
console.log("Other relevant vars:", otherVars.length > 0 ? otherVars : "(none)")

console.log("\n=== Required for worker ===")
for (const key of required) {
  const val = process.env[key]
  if (val) {
    const masked = val.length > 12 ? `${val.slice(0, 6)}...${val.slice(-4)} (len ${val.length})` : `(len ${val.length})`
    console.log(`  ✅ ${key}: ${masked}`)
  } else {
    console.log(`  ❌ ${key}: MISSING`)
  }
}

console.log("\n=== Total env count: " + Object.keys(process.env).length + " ===")
