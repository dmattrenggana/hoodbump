/**
 * Format helpers
 */

export function formatAddress(
  address: string | null | undefined,
  chars: number = 4
): string {
  if (!address) return "—"
  if (address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function formatEth(wei: bigint | string, decimals: number = 4): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei
  const eth = Number(value) / 1e18
  return `${eth.toFixed(decimals)} ETH`
}
