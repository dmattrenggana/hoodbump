import type React from "react"
import type { Metadata } from "next"
import { Providers } from "./providers"
import { Toaster } from "sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "HoodBump - Trending Bot for Robinhood Chain",
  description: "Automated trending bot for Robinhood Chain tokens",
  icons: {
    icon: "/icon.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-mono antialiased">
        <Providers>
          {children}
          <Toaster position="top-center" richColors theme="dark" />
        </Providers>
      </body>
    </html>
  )
}
