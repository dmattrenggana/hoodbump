import type React from "react"
import type { Metadata, Viewport } from "next"
import { JetBrains_Mono } from "next/font/google"
import { Providers } from "./providers"
import { Toaster } from "sonner"
import "./globals.css"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hoodbump.xyz"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: "HoodBump - Trending Bot for Robinhood Chain",
  description: "Professional Bump Bot for Robinhood Chain. Bump your token's volume with 10 encrypted bot wallets.",
  generator: "HoodBump",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/logo.png", type: "image/png", sizes: "any" },
    ],
    apple: "/logo.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HoodBump" />
      </head>
      <body className={`${jetbrainsMono.variable} font-mono antialiased bg-background text-foreground min-h-screen`}>
        <Providers>
          {children}
          <Toaster position="top-center" richColors theme="dark" />
        </Providers>
      </body>
    </html>
  )
}