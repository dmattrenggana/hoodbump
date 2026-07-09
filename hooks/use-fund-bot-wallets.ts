"use client"

import { useState, useCallback, useRef } from "react"
import { useSendTransaction } from "@privy-io/react-auth"
import { encodeAbiParameters, encodeFunctionData, type Address, parseUnits, type Hex } from "viem"
import { RH_WETH_ADDRESS } from "@/lib/constants"

export interface BotWalletToFund {
  id: string
  address: Address
  walletIndex: number
}

export interface FundConfig {
  walletCount: number
  ethAmount: string
  wethAmount: string
}

const KERNEL_BATCH_MODE: Hex = "0x0100000000000000000000000000000000000000000000000000000000000000"

const KERNEL_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "mode", type: "bytes32" },
      { name: "executionData", type: "bytes" },
    ],
    outputs: [{ name: "returnData", type: "bytes[]" }],
  },
] as const

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

interface Call {
  to: Address
  value: bigint
  data: Hex
}

/**
 * Fund bot wallets via Privy Kernel smart wallet's batched execute.
 *
 * 1 userOp = 1 signature = N atomic calls.
 * 10 wallets × (1 ETH + 1 WETH) = 20 calls in 1 signature.
 *
 * Encodes Kernel's `execute(mode=0x01, calls[])` and sends to the
 * smart wallet's own address — the smart wallet decodes and runs
 * all calls atomically. User signs once in Phantom.
 */
export function useFundBotWallets(
  smartWalletAddress: string | null,
  botWallets: BotWalletToFund[],
  config: FundConfig
) {
  const { sendTransaction } = useSendTransaction()
  const [isRunning, setIsRunning] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  const fund = useCallback(async () => {
    if (!smartWalletAddress) {
      setError("Smart wallet not connected")
      return
    }
    if (botWallets.length === 0) {
      setError("No bot wallets to fund. Generate wallets first.")
      return
    }

    const targets = botWallets.slice(0, config.walletCount)
    const ethWei = parseUnits(config.ethAmount, 18)
    const wethWei = parseUnits(config.wethAmount, 18)

    cancelRef.current = false
    setIsRunning(true)
    setError(null)
    setTxHash(null)

    try {
      // Build batched calls
      const calls: Call[] = []

      for (const wallet of targets) {
        if (cancelRef.current) break

        // ETH transfer (native)
        if (ethWei > 0n) {
          calls.push({
            to: wallet.address,
            value: ethWei,
            data: "0x",
          })
        }

        // WETH transfer (ERC-20)
        if (wethWei > 0n) {
          const wethData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [wallet.address, wethWei],
          })
          calls.push({
            to: RH_WETH_ADDRESS,
            value: 0n,
            data: wethData,
          })
        }
      }

      if (calls.length === 0) {
        throw new Error("No calls to execute (set ETH or WETH amount > 0)")
      }

      // Encode executionData: abi.encode(Call[])
      const executionData = encodeAbiParameters(
        [
          {
            name: "calls",
            type: "tuple[]",
            components: [
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
              { name: "data", type: "bytes" },
            ],
          },
        ],
        [
          calls.map((c) => ({
            to: c.to,
            value: c.value,
            data: c.data,
          })),
        ]
      )

      // Encode Kernel.execute(mode, executionData)
      const txData = encodeFunctionData({
        abi: KERNEL_ABI,
        functionName: "execute",
        args: [KERNEL_BATCH_MODE, executionData],
      })

      // Total ETH value (sum of all ETH transfers)
      const totalValue = calls.reduce((sum, c) => sum + c.value, BigInt(0))

      // 1 userOp, 1 signature
      const { hash } = await sendTransaction(
        {
          to: smartWalletAddress as `0x${string}`,
          data: txData,
          value: totalValue,
          chainId: 4663,
        },
        { address: smartWalletAddress }
      )

      setTxHash(hash)
    } catch (err: any) {
      setError(err.message || "Funding failed")
    } finally {
      setIsRunning(false)
    }
  }, [smartWalletAddress, botWallets, config, sendTransaction])

  const reset = useCallback(() => {
    setTxHash(null)
    setError(null)
  }, [])

  return {
    fund,
    reset,
    isRunning,
    txHash,
    error,
    callCount: config.walletCount * (parseFloat(config.ethAmount) > 0 ? 1 : 0) + config.walletCount * (parseFloat(config.wethAmount) > 0 ? 1 : 0),
  }
}
