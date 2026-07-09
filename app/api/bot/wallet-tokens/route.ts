/**
 * Bot wallet tokens — list all ERC-20 tokens held by all 10 bot wallets.
 *
 * GET /api/bot/wallet-tokens?userAddress=0x...
 * Returns:
 *   { wallets: [{ walletIndex, address, ethBalance, tokens: [{ symbol, address, balance, decimals }] }] }
 *
 * Strategy:
 *   1. Get list of bot wallets for the user
 *   2. For each wallet, get recent ERC-20 Transfer events TO the wallet
 *      (filter out ETH/native transfers)
 *   3. For each unique token, read current balance
 *   4. Skip tokens with 0 balance
 */
import { NextRequest, NextResponse } from "next/server"
import { isAddress, getAddress, createPublicClient, http, erc20Abi, parseAbiItem } from "viem"
import { getBotWallets } from "@/lib/bot-wallet"
import { robinhoodChain } from "@/lib/chain-config"

export const dynamic = "force-dynamic"

const KNOWN_TOKENS = [
  // WETH
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  // Common Robinhood Chain tokens (add as needed)
  "0xa379a3955e496cde8635586293117e7272d14157", // CLANKHOOD
  "0xc72c01aAB5f5678dc1d6f5c6d2b417d91d402ba3", // HOODIE
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG
]

const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

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

    // For each wallet, scan recent ERC-20 Transfer events TO the wallet
    // to discover which tokens it has interacted with
    const walletTokenData = await Promise.all(
      wallets.map(async (w) => {
        const ethBalance = await publicClient.getBalance({
          address: w.address as `0x${string}`,
        })

        // Discover tokens via Transfer events (last 100k blocks, ~2 weeks)
        const latestBlock = await publicClient.getBlockNumber()
        const fromBlock = latestBlock - 100000n > 0n ? latestBlock - 100000n : 0n

        const logs = await publicClient.getLogs({
          event: parseAbiItem(
            "event Transfer(address indexed from, address indexed to, uint256 value)"
          ),
          args: { to: w.address as `0x${string}` },
          fromBlock,
          toBlock: latestBlock,
        })

        // Get unique token addresses from logs (also add KNOWN_TOKENS for safety)
        const tokenSet = new Set<string>(KNOWN_TOKENS.map((t) => t.toLowerCase()))
        for (const log of logs) {
          tokenSet.add(log.address.toLowerCase())
        }

        // Read balance + metadata for each token
        const tokens = await Promise.all(
          Array.from(tokenSet).map(async (tokenAddr) => {
            try {
              const [balance, symbol, decimals] = await Promise.all([
                publicClient.readContract({
                  address: tokenAddr as `0x${string}`,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [w.address as `0x${string}`],
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: tokenAddr as `0x${string}`,
                  abi: erc20Abi,
                  functionName: "symbol",
                }) as Promise<string>,
                publicClient.readContract({
                  address: tokenAddr as `0x${string}`,
                  abi: erc20Abi,
                  functionName: "decimals",
                }) as Promise<number>,
              ])

              if (balance === 0n) return null

              return {
                symbol,
                address: tokenAddr,
                balance: balance.toString(),
                balanceFormatted: (Number(balance) / 10 ** Number(decimals)).toFixed(4),
                decimals: Number(decimals),
              }
            } catch {
              return null
            }
          })
        )

        return {
          walletIndex: w.wallet_index,
          address: w.address,
          ethBalance: ethBalance.toString(),
          ethBalanceFormatted: (Number(ethBalance) / 1e18).toFixed(8),
          tokens: tokens.filter((t) => t !== null),
        }
      })
    )

    return NextResponse.json({
      userAddress,
      count: walletTokenData.length,
      wallets: walletTokenData,
    })
  } catch (error: any) {
    console.error("[/api/bot/wallet-tokens]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}