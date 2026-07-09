"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DollarSign, Clock, Zap } from "lucide-react"

interface ConfigPanelProps {
  buyAmountUsd: string
  onChangeAmount: (amount: string) => void
  intervalSeconds: number
  onChangeInterval: (interval: number) => void
  ethPriceUsd?: number
}

export function ConfigPanel({
  buyAmountUsd,
  onChangeAmount,
  intervalSeconds,
  onChangeInterval,
  ethPriceUsd = 3000,
}: ConfigPanelProps) {
  const ethAmount = parseFloat(buyAmountUsd) / ethPriceUsd

  return (
    <Card className="bg-card border-border">
      <div className="p-4 space-y-4">
        {/* Buy amount */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              BUY AMOUNT
            </Label>
            <span className="text-xs text-muted-foreground">
              ≈ {ethAmount.toFixed(6)} ETH
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={buyAmountUsd}
              onChange={(e) => onChangeAmount(e.target.value)}
              className="font-mono text-sm"
            />
            <div className="flex gap-1">
              {["0.01", "0.05", "0.10", "0.50"].map((amt) => (
                <button
                  key={amt}
                  onClick={() => onChangeAmount(amt)}
                  className={`px-2 py-1 text-xs rounded border transition ${
                    buyAmountUsd === amt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Interval */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              INTERVAL
            </Label>
            <span className="text-xs font-mono">
              {intervalSeconds < 60
                ? `${intervalSeconds}s`
                : `${Math.floor(intervalSeconds / 60)}m ${intervalSeconds % 60}s`}
            </span>
          </div>
          <Slider
            min={10}
            max={300}
            step={5}
            value={[intervalSeconds]}
            onValueChange={(v) => onChangeInterval(v[0])}
            className="py-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>10s</span>
            <span>5m</span>
          </div>
        </div>

        {/* Estimate */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Hourly volume
            </span>
            <span className="font-mono font-semibold">
              ${(parseFloat(buyAmountUsd) * 10 * (3600 / intervalSeconds)).toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            10 wallets × {buyAmountUsd} × ~{Math.floor(3600 / intervalSeconds)} cycles/hr
          </p>
        </div>
      </div>
    </Card>
  )
}