import { NextRequest, NextResponse } from "next/server"
import { isAddress, parseEther, formatEther } from "viem"
import { getZeroXQuote, buildSwapFromQuote, formatZeroXError } from "@/lib/swap"
import {
  signAndSendTransaction,
  getBotWalletByIndex,
  updateWalletBalances,
} from "@/lib/bot-wallet"
import { getPublicClient } from "@/lib/bot-wallet"
import { RH_WETH_ADDRESS } from "@/lib/constants"
import { createSupabaseServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface ExecuteSwapRequest {
  userAddress: string
  walletIndex: number
  buyToken: string
  amountWei: string // WETH amount to swap
}

/**
 * POST /api/bot/execute-swap
 * 
 * Execute a single swap from a bot wallet:
 * 1. Get 0x quote (WETH → buyToken) with affiliate fee
 * 2. Sign + send transaction from bot wallet
 * 3. Wait for confirmation
 * 4. Update wallet balances in DB
 */
export async function POST(request: NextRequest) {
  try {
    const body: ExecuteSwapRequest = await request.json()
    const { userAddress, walletIndex, buyToken, amountWei } = body

    // Validate
    if (!userAddress || walletIndex === undefined || !buyToken || !amountWei) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (!isAddress(userAddress) || !isAddress(buyToken)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      )
    }

    const normalizedAddress = userAddress.toLowerCase()
    const sellAmount = BigInt(amountWei)

    // Get bot wallet
    const wallet = await getBotWalletByIndex(normalizedAddress, walletIndex)
    if (!wallet) {
      return NextResponse.json(
        { error: `Bot wallet ${walletIndex} not found` },
        { status: 404 }
      )
    }

    console.log(`\n🔄 Executing swap for user ${normalizedAddress}`)
    console.log(`   Wallet #${walletIndex + 1}: ${wallet.address}`)
    console.log(`   Selling: ${formatEther(sellAmount)} WETH`)
    console.log(`   Buying: ${buyToken}`)

    // 1. Get 0x quote
    const quote = await getZeroXQuote({
      sellToken: RH_WETH_ADDRESS,
      buyToken: buyToken as `0x${string}`,
      sellAmount,
      takerAddress: wallet.address as `0x${string}`,
    })

    console.log(`   ✅ Quote received`)
    console.log(`   Buy amount: ${quote.buyAmount}`)
    console.log(`   Min buy: ${quote.minBuyAmount}`)
    console.log(`   Price impact: ${quote.estimatedPriceImpact}`)
    console.log(`   Gas: ${quote.gas}`)

    // 2. Build swap transaction
    const txParams = buildSwapFromQuote(quote)

    // 3. Check WETH allowance (if needed)
    const publicClient = getPublicClient()
    const allowanceTarget = quote.allowanceTarget as `0x${string}`

    const currentAllowance = (await publicClient.readContract({
      address: RH_WETH_ADDRESS,
      abi: [
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "allowance",
      args: [wallet.address as `0x${string}`, allowanceTarget],
    })) as bigint

    let approvalHash: string | null = null
    if (currentAllowance < sellAmount) {
      console.log(`   📝 Approving WETH spend...`)
      // Approve max uint256 to avoid future approvals
      const approvalData = `0x095ea7b3${allowanceTarget
        .slice(2)
        .toLowerCase()}ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff` as `0x${string}`

      approvalHash = await signAndSendTransaction(
        normalizedAddress,
        walletIndex,
        {
          to: RH_WETH_ADDRESS,
          data: approvalData,
          value: BigInt(0),
        }
      )
      console.log(`   ✅ Approval tx: ${approvalHash}`)
    } else {
      console.log(`   ✅ Allowance sufficient, skipping approval`)
    }

    // 4. Execute swap
    console.log(`   📤 Sending swap transaction...`)
    const swapHash = await signAndSendTransaction(
      normalizedAddress,
      walletIndex,
      {
        to: txParams.to,
        data: txParams.data,
        value: txParams.value,
        gas: txParams.gasLimit,
      }
    )

    console.log(`   ✅ Swap tx: ${swapHash}`)

    // 5. Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: swapHash as `0x${string}`,
      confirmations: 1,
    })

    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`)

    // 6. Update wallet balances
    const newEthBalance = (await publicClient.getBalance({
      address: wallet.address as `0x${string}`,
    }))

    const newWethBalance = (await publicClient.readContract({
      address: RH_WETH_ADDRESS,
      abi: [
        {
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [wallet.address as `0x${string}`],
    })) as bigint

    const gasSpent = BigInt(wallet.total_gas_spent_wei) + BigInt(receipt.gasUsed * receipt.effectiveGasPrice)

    await updateWalletBalances(
      normalizedAddress,
      walletIndex,
      newEthBalance,
      newWethBalance,
      gasSpent
    )

    // 7. Log to database
    const supabase = createSupabaseServiceClient()
    await supabase.from("bot_logs").insert({
      user_address: normalizedAddress,
      bot_wallet_address: wallet.address,
      token_address: buyToken,
      amount_wei: sellAmount.toString(),
      action: "swap_executed",
      message: `Swapped ${formatEther(sellAmount)} WETH for ${buyToken}`,
      status: "success",
      tx_hash: swapHash,
    })

    return NextResponse.json({
      success: true,
      swapHash,
      approvalHash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
      buyAmount: quote.buyAmount,
      priceImpact: quote.estimatedPriceImpact,
    })
  } catch (error: any) {
    console.error("❌ Swap execution failed:", error)
    return NextResponse.json(
      {
        error: formatZeroXError(error),
        details: error.message,
      },
      { status: 500 }
    )
  }
}
