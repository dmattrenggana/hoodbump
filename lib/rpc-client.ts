"use client"

import { createPublicClient, http } from "viem"
import { robinhoodChain } from "./chain-config"

const RPC_URL =
  process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL ||
  process.env.NEXT_PUBLIC_HOODBUMP_ALCHEMY_URL ||
  process.env.HOODBUMP_RPC_URL ||
  "https://rpc.mainnet.chain.robinhood.com"

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(RPC_URL),
})
