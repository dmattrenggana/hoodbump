import { NextResponse } from "next/server"

export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 30 } }
    )
    if (!res.ok) throw new Error("CoinGecko failed")
    const data = await res.json()
    return NextResponse.json({ price: data.ethereum?.usd || 3000 })
  } catch {
    return NextResponse.json({ price: 3000 })
  }
}