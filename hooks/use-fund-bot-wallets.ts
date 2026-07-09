"use client"

import { useState, useCallback } from "react"
import { useSendTransaction } from "@privy-io/react-auth"
import { encodeFunctionData, type Address, parseUnits, type Hex } from "viem"
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

/**
 * Fund bot wallets from the user's connected smart wallet.
 *
 * Sequential one-by-one — Privy dashboard is configured to batch
 * userOps without multiple popups. Each step = 1 ETH transfer + 1 WETH transfer.
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

    setIsRunning(true)
    setError(null)
    setTxHash(null)

    try {
      let lastHash: `0x${string}` | null = null

      for (const wallet of targets) {
        if (ethWei > 0n) {
          const { hash } = await sendTransaction(
            {
              to: wallet.address,
              value: ethWei,
              chainId: 4663,
            },
            { address: smartWalletAddress }
          )
          lastHash = hash
        }

        if (wethWei > 0n) {
          const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [wallet.address, wethWei],
          })
          const { hash } = await sendTransaction(
            {
              to: RH_WETH_ADDRESS,
              data,
              value: BigInt(0),
              chainId: 4663,
            },
            { address: smartWalletAddress }
          )
          lastHash = hash
        }
      }

      setTxHash(lastHash)
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
  }
}
