"use client"

import { useQuery } from "@tanstack/react-query"
import { useSmartWalletAddress } from "@/hooks/use-smart-wallet-address"
import { Loader2, Activity, CheckCircle, XCircle, Info, Clock } from "lucide-react"
import { formatAddress } from "@/lib/format"

interface BotLog {
  id: string
  user_address: string
  bot_wallet_address: string | null
  session_id: string | null
  action: string
  status: "success" | "error" | "info" | "pending"
  message: string | null
  tx_hash: string | null
  amount_wei: string | null
  token_address: string | null
  created_at: string
}

export function ActivityFeed() {
  const userAddress = useSmartWalletAddress()

  const { data: logs, isLoading } = useQuery({
    queryKey: ["bot-logs", userAddress],
    queryFn: async (): Promise<BotLog[]> => {
      if (!userAddress) return []
      const res = await fetch(
        `/api/bot/logs?userAddress=${userAddress}&limit=20`
      )
      if (!res.ok) return []
      const data = await res.json()
      return data.logs || []
    },
    enabled: !!userAddress,
    refetchInterval: 5_000, // Live updates
  })

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg bg-card p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Loading activity...</p>
      </div>
    )
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="border border-border rounded-lg bg-card p-6 text-center">
        <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-sm font-semibold mb-1">No activity yet</h3>
        <p className="text-xs text-muted-foreground">
          Start the bot to see live swap activity
        </p>
      </div>
    )
  }

  function getStatusIcon(status: BotLog["status"]) {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-primary" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  function getActionLabel(action: string) {
    const map: Record<string, string> = {
      swap_executed: "Swap Executed",
      swap_failed: "Swap Failed",
      cycle_skipped: "Cycle Skipped",
      cycle_error: "Cycle Error",
      approval_granted: "Approval",
      approval_failed: "Approval Failed",
      session_stopped: "Session Stopped",
      quote_failed: "Quote Failed",
    }
    return map[action] || action
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          LIVE ACTIVITY
        </h3>
        <span className="text-xs text-muted-foreground">
          Last {logs.length} events
        </span>
      </div>
      {logs.map((log) => (
        <div
          key={log.id}
          className="border border-border rounded-lg bg-card p-3"
        >
          <div className="flex items-start gap-2">
            {getStatusIcon(log.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                  {getActionLabel(log.action)}
                </p>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
              </div>
              {log.message && (
                <p className="text-xs text-muted-foreground mt-0.5 break-words">
                  {log.message}
                </p>
              )}
              {log.bot_wallet_address && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {formatAddress(log.bot_wallet_address, 3)}
                </p>
              )}
              {log.tx_hash && (
                <a
                  href={`https://robinhoodchain.blockscout.com/tx/${log.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-0.5 block"
                >
                  View TX →
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
