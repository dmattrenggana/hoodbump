/**
 * Anti-detection utilities for bot swap timing.
 * 
 * Makes bot swap pattern look organic (like a real user),
 * not a robotic fixed-interval loop.
 */

import {
  ANTI_DETECTION_CONFIG,
  MIN_INTERVAL_SECONDS,
  MAX_INTERVAL_SECONDS,
} from "./constants"

/**
 * Calculate the next swap interval with anti-detection jitter.
 * 
 * Base interval = user-set (e.g. 60s)
 * Jitter = ±30% of base
 * Result = base + jitter, clamped to safe range
 * 
 * @param baseIntervalMs - User-configured interval in milliseconds
 * @returns Adjusted interval in milliseconds
 */
export function getNextInterval(baseIntervalMs: number): number {
  if (!ANTI_DETECTION_CONFIG.enabled) {
    return baseIntervalMs
  }

  const jitterPercent =
    (Math.random() - 0.5) *
    (ANTI_DETECTION_CONFIG.intervalJitterPercent * 2) /
    100 // -0.3 to +0.3

  const jitter = jitterPercent * baseIntervalMs
  const actual = baseIntervalMs + jitter

  // Clamp to safe range
  return Math.max(MIN_INTERVAL_SECONDS * 1000, Math.min(MAX_INTERVAL_SECONDS * 1000, actual))
}

/**
 * Decide if this cycle should be skipped (simulate user "AFK").
 * 
 * @returns true if cycle should be skipped
 */
export function shouldSkipCycle(): boolean {
  if (!ANTI_DETECTION_CONFIG.enabled) return false
  return Math.random() < ANTI_DETECTION_CONFIG.skipRatePercent / 100
}

/**
 * Calculate the swap amount with anti-detection variance.
 * 
 * Base amount = user-set (e.g. $0.10)
 * Variance = ±30%
 * Result = base * (0.7 to 1.3)
 * 
 * @param baseAmountWei - Base amount in wei
 * @returns Adjusted amount in wei
 */
export function getVariableAmount(baseAmountWei: bigint): bigint {
  if (!ANTI_DETECTION_CONFIG.enabled) return baseAmountWei

  // 0.7 to 1.3 (30% variance)
  const multiplier = 0.7 + Math.random() * 0.6
  // Use BigInt math to avoid precision loss
  const result = (baseAmountWei * BigInt(Math.floor(multiplier * 1000))) / BigInt(1000)
  return result
}

/**
 * Get activity multiplier based on time of day.
 * Real users are more active during certain hours.
 * 
 * @returns 0.3 to 1.5 (lower at night, higher during day)
 */
export function getTimeOfDayMultiplier(): number {
  const hour = new Date().getUTCHours()
  // 0-6 UTC: low activity (sleeping)
  // 7-12 UTC: medium
  // 13-23 UTC: high (US/EU awake)
  if (hour >= 0 && hour < 6) return 0.3 + Math.random() * 0.2
  if (hour >= 6 && hour < 12) return 0.7 + Math.random() * 0.3
  return 1.2 + Math.random() * 0.3
}
