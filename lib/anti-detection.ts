/**
 * Anti-detection utilities removed per user request (2026-07-09).
 *
 * Kept file as a stub so existing imports don't break. Returns
 * deterministic values (no jitter, no skipping, no variance).
 */

/**
 * Fixed interval — no jitter.
 */
export function getNextInterval(baseIntervalMs: number): number {
  return baseIntervalMs
}

/**
 * Never skip cycles.
 */
export function shouldSkipCycle(): boolean {
  return false
}

/**
 * Fixed amount — no variance.
 */
export function getVariableAmount(baseAmountWei: bigint): bigint {
  return baseAmountWei
}

/**
 * Fixed multiplier.
 */
export function getTimeOfDayMultiplier(): number {
  return 1.0
}