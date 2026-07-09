"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, AlertCircle, Loader2, ExternalLink } from "lucide-react"
import { isAddress } from "viem"
import { toast } from "sonner"

interface TokenInputProps {
  value: string | null
  onChange: (address: string | null) => void
  onVerified?: (metadata: any) => void
}

export function TokenInput({ value, onChange, onVerified }: TokenInputProps) {
  const [address, setAddress] = useState(value || "")
  const [isVerifying, setIsVerifying] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (value) setAddress(value)
  }, [value])

  const handleVerify = async () => {
    if (!address.trim()) {
      setError("Enter a token address")
      return
    }
    if (!isAddress(address.trim())) {
      setError("Invalid address format")
      return
    }

    setIsVerifying(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/token/lookup?address=${address.trim()}`
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Token not found")
      }
      const data = await res.json()
      setIsVerified(true)
      onChange(address.trim())
      onVerified?.(data)
      toast.success(`Verified: ${data.symbol || "Token"}`)
    } catch (err: any) {
      setError(err.message || "Verification failed")
      setIsVerified(false)
    } finally {
      setIsVerifying(false)
    }
  }

  const handleClear = () => {
    setAddress("")
    setIsVerified(false)
    setError(null)
    onChange(null)
  }

  return (
    <Card className="bg-card border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">TARGET TOKEN</span>
          {isVerified && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Check className="h-3 w-3" />
              Verified
            </span>
          )}
        </div>

        <div className="flex gap-2 mb-2">
          <Input
            placeholder="0x... (token contract address)"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              setIsVerified(false)
              setError(null)
            }}
            className="font-mono text-xs"
            disabled={isVerifying}
          />
          {isVerified ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="px-3"
            >
              Clear
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleVerify}
              disabled={isVerifying || !address.trim()}
              className="px-3 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isVerifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Verify"
              )}
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        )}

        {address && isAddress(address) && (
          <a
            href={`https://robinhoodchain.blockscout.com/token/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-2"
          >
            View token
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </Card>
  )
}