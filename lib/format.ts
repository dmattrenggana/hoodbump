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

export function formatEth(wei: bigint | string, decimals?: number): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei
  const eth = Number(value) / 1e18
  // Adaptive precision: 0.0001 ETH = 1e14 wei, below that 8 decimals needed
  if (decimals !== undefined) return eth.toFixed(decimals)
  if (eth === 0) return "0"
  if (eth >= 1) return eth.toFixed(4)
  if (eth >= 0.001) return eth.toFixed(6)
  if (eth >= 0.000001) return eth.toFixed(8)
  return eth.toPrecision(4)
}
