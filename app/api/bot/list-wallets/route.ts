/**
 * List all bot wallets for a user (debug helper).
 *
 * GET /api/bot/list-wallets?userAddress=0x...
 */
import { NextRequest, NextResponse } from "next/server"
import { isAddress, getAddress, createPublicClient, http } from "viem"
import { erc20Abi } from "viem"
import { getBotWallets } from "@/lib/bot-wallet"
import { robinhoodChain } from "@/lib/chain-config"

export const dynamic = "force-dynamic"

const RH_WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddressRaw = searchParams.get("userAddress")
    if (!userAddressRaw || !isAddress(userAddressRaw)) {
      return NextResponse.json({ error: "Invalid userAddress" }, { status: 400 })
    }
    const userAddress = getAddress(userAddressRaw)

    const wallets = await getBotWallets(userAddress)
    if (wallets.length === 0) {
      return NextResponse.json({ error: "No bot wallets found" }, { status: 404 })
    }

    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: http(process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL!),
    })

    // Fetch on-chain balances for all wallets in parallel
    const enriched = await Promise.all(
      wallets.map(async (w) => {
        try {
          const [eth, wethBal] = await Promise.all([
            publicClient.getBalance({ address: w.address as `0x${string}` }),
            publicClient.readContract({
              address: RH_WETH_ADDRESS,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [w.address as `0x${string}`],
            }) as Promise<bigint>,
          ])
          return {
            walletIndex: w.wallet_index,
            address: w.address,
            eth: eth.toString(),
            ethFormatted: (Number(eth) / 1e18).toFixed(8),
            weth: wethBal.toString(),
            wethFormatted: (Number(wethBal) / 1e18).toFixed(8),
          }
        } catch {
          return {
            walletIndex: w.wallet_index,
            address: w.address,
            error: "balance check failed",
          }
        }
      })
    )

    return NextResponse.json({
      userAddress,
      count: enriched.length,
      wallets: enriched,
    })
  } catch (error: any) {
    console.error("[/api/bot/list-wallets]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}