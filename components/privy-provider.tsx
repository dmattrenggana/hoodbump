"use client"

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth"
import { WagmiProvider } from "@privy-io/wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { http, createConfig } from "wagmi"
import { ReactNode } from "react"
import { robinhoodChain } from "@/lib/chain-config"

const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  transports: {
    [robinhoodChain.id]: http(
      process.env.NEXT_PUBLIC_HOODBUMP_ALCHEMY_URL ||
        process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL ||
        "https://rpc.mainnet.chain.robinhood.com"
    ),
  },
})

const queryClient = new QueryClient()

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID

if (!PRIVY_APP_ID) {
  throw new Error(
    "NEXT_PUBLIC_PRIVY_APP_ID environment variable is required. Get one at https://dashboard.privy.io"
  )
}

interface PrivyProviderProps {
  children: ReactNode
}

export function PrivyProvider({ children }: PrivyProviderProps) {
  return (
    <PrivyProviderBase
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#00ff00",
          logo: "/icon.png",
        },
        // Embedded wallets (regular EOAs) - still works for email/social users
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
        },
        // Smart wallets DISABLED ENTIRELY
        // Coinbase Smart Wallet doesn't support Robinhood Chain (4663)
        // and crashes on init. HoodBump doesn't need AA - bot uses EOA wallets.
        smartWallets: {
          enabled: false,
          createOnLogin: "off",
        },
        defaultChain: robinhoodChain,
        supportedChains: [robinhoodChain],
      } as any}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProviderBase>
  )
}