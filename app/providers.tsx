"use client"

import { PrivyProvider } from "@/components/privy-provider"
import { ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  return <PrivyProvider>{children}</PrivyProvider>
}
