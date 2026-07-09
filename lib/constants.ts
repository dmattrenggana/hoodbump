/**
 * HoodBump - Core Constants
 * 
 * All addresses for Robinhood Chain (chain ID 4663)
 * Updated: 2026-07-09
 */

// ============================================
// Robinhood Chain Core Tokens
// ============================================

// WETH on Robinhood Chain (different from Base!)
export const RH_WETH_ADDRESS =
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const

// USDG - Robinhood's stablecoin (primary base pair)
export const RH_USDG_ADDRESS =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const

// Token decimals
export const WETH_DECIMALS = 18
export const USDG_DECIMALS = 18

// ============================================
// Uniswap V3 on Robinhood Chain
// ============================================
export const UNISWAP_V3_FACTORY =
  "0x1f7d7550b1b028f7571e69a784071f0205fd2efa" as const

export const UNISWAP_V3_SWAP_ROUTER_02 =
  "0xcaf681a66d020601342297493863e78c959e5cb2" as const

export const UNISWAP_V3_NFT_POSITION_MANAGER =
  "0x73991a25c818bf1f1128deaab1492d45638de0d3" as const

export const UNISWAP_V3_QUOTER_V2 =
  "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7" as const

// ============================================
// Uniswap V4 on Robinhood Chain
// ============================================
export const UNISWAP_V4_POOL_MANAGER =
  "0x8366a39cc670b4001a1121b8f6a443a643e40951" as const

export const UNISWAP_V4_POSITION_MANAGER =
  "0x58daec3116aae6d93017baaea7749052e8a04fa7" as const

export const UNISWAP_V4_POSITION_DESCRIPTOR =
  "0x9639443158e8c5efa35bd45287bf2effd3d8dc06" as const

export const UNISWAP_V4_QUOTER =
  "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" as const

export const UNISWAP_V4_STATE_VIEW =
  "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as const

// ============================================
// Common
// ============================================
export const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const

// ============================================
// $HOODBUMP Token (TO BE DEPLOYED)
// ============================================
// TODO: Replace with actual deployed address after token launch
export const HOODBUMP_TOKEN_ADDRESS =
  (process.env.NEXT_PUBLIC_HOODBUMP_TOKEN_ADDRESS as `0x${string}`) ||
  ("0x0000000000000000000000000000000000000000" as const) // placeholder

export const HOODBUMP_TOKEN_DECIMALS = 18

// ============================================
// 0x API (Phase 3)
// ============================================
export const ZEROX_API_BASE = "https://api.0x.org"
export const ROBINHOOD_CHAIN_ID_0X = "4663" // 0x API chain ID for Robinhood Chain

// ============================================
// HoodBump Bot Configuration
// ============================================
// Decisions made 2026-07-09

// 1A: Swap provider
export const SWAP_PROVIDER = "0x" as const

// 2D: Affiliate fee (1%)
export const AFFILIATE_FEE_BPS = 100

// 3B: Slippage tolerance (1%)
export const SLIPPAGE_BPS = 100

// 4A: Treasury address (shared with ClawdBump)
export const HOODBUMP_TREASURY_ADDRESS =
  "0x43d9a5cb3c0299e3de882e10036ee9de0497f234" as const

// 5A: Anti-detection (basic: variable ±30% + 8% skip)
export const ANTI_DETECTION_CONFIG = {
  intervalJitterPercent: 30,  // ±30% interval variance
  skipRatePercent: 8,          // 8% cycles skipped
  enabled: true,
} as const

// 6B: Minimum swap amount ($0.10 USD)
export const MIN_SWAP_USD = 0.10

// Default swap interval (60s)
export const DEFAULT_INTERVAL_SECONDS = 60
export const MIN_INTERVAL_SECONDS = 10  // 10s minimum (anti-bot)
export const MAX_INTERVAL_SECONDS = 600 // 10 minutes maximum

// Bot wallet config
export const WALLETS_PER_USER = 10
export const MASTER_ENCRYPTION_KEY = process.env.MASTER_ENCRYPTION_KEY || ""

// Validation moved to /api/env-check endpoint (server-side only)
// Don't warn on import - prevents client console noise


// 0x API key (get from https://dashboard.0x.org)
export const ZEROX_API_KEY = process.env.ZEROX_API_KEY || ""
