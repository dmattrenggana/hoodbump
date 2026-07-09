"use client"

import { useQuery } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CheckCircle, XCircle, Info, Clock, ExternalLink, Activity } from "lucide-react"
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

interface BotLiveActivityProps {
  userAddress: string | null
}

export function BotLiveActivity({ userAddress }: BotLiveActivityProps) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["bot-logs", userAddress],
    queryFn: async (): Promise<BotLog[]> => {
      if (!userAddress) return []
      const res = await fetch(`/api/bot/logs?userAddress=${userAddress}&limit=30`)
      if (!res.ok) return []
      const data = await res.json()
      return data.logs || []
    },
    enabled: !!userAddress,
    refetchInterval: 4_000,
  })

  const getStatusIcon = (status: BotLog["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-3.5 w-3.5 text-primary" />
      case "error":
        return <XCircle className="h-3.5 w-3.5 text-destructive" />
      case "info":
        return <Info className="h-3.5 w-3.5 text-blue-500" />
      default:
        return <Clock className="h-3.5 w-3.5 text-yellow-500" />
    }
  }

  const getActionLabel = (action: string) => {
    const map: Record<string, string> = {
      swap_executed: "Swap",
      swap_failed: "Failed",
      cycle_skipped: "Skipped",
      cycle_error: "Error",
      approval_granted: "Approved",
      session_stopped: "Stopped",
      session_started: "Started",
      quote_failed: "Quote",
    }
    return map[action] || action
  }

  return (
    <Card className="bg-card border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">LIVE ACTIVITY</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {logs?.length || 0} events
          </span>
        </div>

        {!userAddress ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Connect wallet to view activity
          </p>
        ) : isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Loading...
          </p>
        ) : !logs || logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No activity yet. Start the bot to see swaps.
          </p>
        ) : (
          <ScrollArea className="h-[300px] pr-2">
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 bg-background border border-border rounded-md"
                >
                  <div className="flex items-start gap-2">
                    {getStatusIcon(log.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">
                          {getActionLabel(log.action)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      {log.message && (
                        <p className="text-xs text-muted-foreground break-words">
                          {log.message}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        {log.bot_wallet_address && (
                          <span className="text-xs font-mono text-muted-foreground">
                            {formatAddress(log.bot_wallet_address, 3)}
                          </span>
                        )}
                        {log.tx_hash && (
                          <a
                            href={`https://robinhoodchain.blockscout.com/tx/${log.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                          >
                            TX
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </Card>
  )
}