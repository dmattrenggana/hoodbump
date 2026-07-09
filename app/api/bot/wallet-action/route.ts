/**
 * Bot wallet action — transfer or sell tokens from a bot wallet.
 *
 * POST /api/bot/wallet-action
 * Body:
 *   {
 *     userAddress: "0x...",     // user's smart wallet (for auth/display only)
 *     walletIndex: 0-9,
 *     action: "transfer" | "sell",
 *     tokenAddress: "0x...",    // ERC-20 token to act on
 *     amount: "all" | "<wei>",  // "all" = full balance, else specific amount
 *     recipient?: "0x...",      // for transfer, defaults to user's smart wallet
 *   }
 *
 * Returns:
 *   { success, hash, action, amountTransferred, error? }
 */
import { NextRequest, NextResponse } from "next/server"
import { isAddress, getAddress, createPublicClient, http, encodeFunctionData, erc20Abi } from "viem"
import { getBotWalletByIndex, signAndSendTransaction, getPublicClient } from "@/lib/bot-wallet"
import { robinhoodChain } from "@/lib/chain-config"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const body = await request.json()
    const { userAddress, walletIndex, action, tokenAddress, amount, recipient } = body

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ error: "Invalid userAddress" }, { status: 400 })
    }
    if (typeof walletIndex !== "number" || walletIndex < 0 || walletIndex > 9) {
      return NextResponse.json({ error: "walletIndex must be 0-9" }, { status: 400 })
    }
    if (action !== "transfer" && action !== "sell") {
      return NextResponse.json({ error: "action must be 'transfer' or 'sell'" }, { status: 400 })
    }
    if (!tokenAddress || !isAddress(tokenAddress)) {
      return NextResponse.json({ error: "Invalid tokenAddress" }, { status: 400 })
    }

    const normalizedToken = getAddress(tokenAddress) as `0x${string}`

    const wallet = await getBotWalletByIndex(userAddress, walletIndex)
    if (!wallet) {
      return NextResponse.json({ error: `Bot wallet ${walletIndex} not found` }, { status: 404 })
    }

    const publicClient = getPublicClient()

    // Read current token balance
    const balance = (await publicClient.readContract({
      address: normalizedToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.address as `0x${string}`],
    })) as bigint

    if (balance === 0n) {
      return NextResponse.json({ error: "Bot wallet has 0 balance for this token" }, { status: 400 })
    }

    // Determine amount
    let amountWei: bigint
    if (amount === "all") {
      amountWei = balance
    } else {
      try {
        amountWei = BigInt(amount)
      } catch {
        return NextResponse.json({ error: "Invalid amount (must be 'all' or wei string)" }, { status: 400 })
      }
      if (amountWei > balance) {
        return NextResponse.json({ error: "Amount exceeds balance" }, { status: 400 })
      }
    }

    if (action === "transfer") {
      const toAddress = recipient
        ? getAddress(recipient) as `0x${string}`
        : getAddress(userAddress) as `0x${string}` // default = user's smart wallet

      console.log(`[WalletAction] Transfer ${amountWei.toString()} of ${normalizedToken} from wallet ${walletIndex} (${wallet.address}) → ${toAddress}`)

      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [toAddress, amountWei],
      })

      const hash = await signAndSendTransaction(userAddress, walletIndex, {
        to: normalizedToken,
        data,
        value: 0n,
        gas: 100000n,
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })

      return NextResponse.json({
        success: receipt.status === "success",
        action: "transfer",
        hash,
        amountTransferred: amountWei.toString(),
        from: wallet.address,
        to: toAddress,
        tokenAddress: normalizedToken,
        blockNumber: receipt.blockNumber.toString(),
        durationMs: Date.now() - startTime,
      })
    } else {
      // action === "sell" — swap token → ETH via 0x v2 AllowanceHolder
      const { getZeroXQuote, buildSwapFromQuote } = await import("@/lib/swap")

      console.log(`[WalletAction] Sell ${amountWei.toString()} of ${normalizedToken} from wallet ${walletIndex} (${wallet.address}) → ETH`)

      // Get quote: selling token, buying ETH
      const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as `0x${string}`
      const quote = await getZeroXQuote({
        sellToken: normalizedToken,
        buyToken: ETH_ADDRESS,
        sellAmount: amountWei,
        takerAddress: wallet.address as `0x${string}`,
      })

      const txParams = buildSwapFromQuote(quote)
      const allowanceTarget = txParams.allowanceTarget

      // Approve if needed
      const currentAllowance = (await publicClient.readContract({
        address: normalizedToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [wallet.address as `0x${string}`, allowanceTarget],
      })) as bigint

      if (currentAllowance < amountWei) {
        console.log(`[WalletAction] Approving ${normalizedToken} → ${allowanceTarget}`)
        const MAX_UINT256 = (1n << 256n) - 1n
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [allowanceTarget, MAX_UINT256],
        })
        const approveHash = await signAndSendTransaction(userAddress, walletIndex, {
          to: normalizedToken,
          data: approveData,
          value: 0n,
          gas: 100000n,
        })
        const approveReceipt = await publicClient.waitForTransactionReceipt({
          hash: approveHash,
          confirmations: 1,
        })
        if (approveReceipt.status !== "success") {
          throw new Error("Approve reverted")
        }
        console.log(`[WalletAction] Approved`)
      }

      // Execute sell
      const swapGas = (txParams.gasLimit * 120n) / 100n
      const swapHash = await signAndSendTransaction(userAddress, walletIndex, {
        to: txParams.to,
        data: txParams.data,
        value: txParams.value,
        gas: swapGas,
      })
      const swapReceipt = await publicClient.waitForTransactionReceipt({
        hash: swapHash,
        confirmations: 1,
      })

      return NextResponse.json({
        success: swapReceipt.status === "success",
        action: "sell",
        hash: swapHash,
        amountSold: amountWei.toString(),
        ethReceived: quote.buyAmount,
        tokenAddress: normalizedToken,
        from: wallet.address,
        blockNumber: swapReceipt.blockNumber.toString(),
        durationMs: Date.now() - startTime,
      })
    }
  } catch (error: any) {
    console.error("[/api/bot/wallet-action]", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal error",
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}