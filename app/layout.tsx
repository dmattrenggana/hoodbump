import type React from "react"
import type { Metadata } from "next"
import { Providers } from "./providers"
import { Toaster } from "sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "HoodBump - Trending Bot for Robinhood Chain",
  description: "Automated trending bot for Robinhood Chain tokens. Bump your token's volume with 10 encrypted bot wallets.",
  keywords: ["Robinhood Chain", "trending bot", "volume bot", "HoodBump", "Web3", "DeFi"],
  authors: [{ name: "HoodBump" }],
  creator: "HoodBump",
  openGraph: {
    title: "HoodBump - Trending Bot for Robinhood Chain",
    description: "Bump your token's volume with automated swaps on Robinhood Chain",
    type: "website",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "HoodBump - Trending Bot for Robinhood Chain",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HoodBump - Trending Bot for Robinhood Chain",
    description: "Bump your token's volume with automated swaps on Robinhood Chain",
    images: ["/og-image.svg"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/logo.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: "/logo.svg",
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