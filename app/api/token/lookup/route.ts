import { NextResponse } from "next/server"
import { isAddress } from "viem"
import { createPublicClient, http } from "viem"
import { robinhoodChain } from "@/lib/chain-config"

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http(
    process.env.NEXT_PUBLIC_HOODBUMP_ALCHEMY_URL ||
      process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL ||
      "https://rpc.mainnet.chain.robinhood.com"
  ),
})

const ERC20_ABI = [
  {
    inputs: [],
    name: "symbol",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get("address")

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 })
  }

  try {
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "symbol",
      }).catch(() => "UNKNOWN"),
      client.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "name",
      }).catch(() => "Unknown Token"),
      client.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
      }).catch(() => 18),
    ])

    return NextResponse.json({
      address,
      symbol,
      name,
      decimals,
      verified: true,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: "Token not found or invalid contract" },
      { status: 404 }
    )
  }
}