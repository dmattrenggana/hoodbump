"use client"

import { useQuery } from "@tanstack/react-query"

export function useEthPrice() {
  const { data: price } = useQuery({
    queryKey: ["eth-price"],
    queryFn: async () => {
      const res = await fetch("/api/eth-price")
      if (!res.ok) return 3000
      const data = await res.json()
      return data.price || 3000
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  })
  return { price: price || 3000 }
}