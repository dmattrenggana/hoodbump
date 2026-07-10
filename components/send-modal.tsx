"use client"

import { useState } from "react"
import { useSendTransaction } from "@privy-io/react-auth"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Send, X, Coins, AlertCircle, CheckCircle2 } from "lucide-react"
import { isAddress, parseUnits, encodeFunctionData, erc20Abi, createPublicClient, http, getAddress } from "viem"
import { toast } from "sonner"
import { robinhoodChain } from "@/lib/chain-config"

interface SendModalProps {
  smartWalletAddress: string
  onClose: () => void
  onSuccess?: () => void
}

type SendType = "eth" | "token"

const KNOWN_TOKENS = [
  { symbol: "WETH", address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", decimals: 18 },
  { symbol: "HOODIE", address: "0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3", decimals: 18 },
  { symbol: "CLANKHOOD", address: "0xa379a3955e496cde8635586293117e7272d14157", decimals: 18 },
  { symbol: "USDG", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6 },
]

export function SendModal({ smartWalletAddress, onClose, onSuccess }: SendModalProps) {
  const { sendTransaction } = useSendTransaction()
  const [type, setType] = useState<SendType>("eth")
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [tokenAddr, setTokenAddr] = useState(KNOWN_TOKENS[0].address)
  const [isSending, setIsSending] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport: http(process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL!),
  })

  const selectedToken = KNOWN_TOKENS.find((t) => t.address.toLowerCase() === tokenAddr.toLowerCase())

  const handleSend = async () => {
    // Validate
    if (!isAddress(recipient)) {
      toast.error("Invalid recipient address")
      return
    }
    const recipientChecksum = getAddress(recipient)

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Invalid amount")
      return
    }

    setIsSending(true)
    setTxHash(null)

    try {
      if (type === "eth") {
        const valueWei = parseUnits(amount, 18)
        const { hash } = await sendTransaction(
          {
            to: recipientChecksum as `0x${string}`,
            value: valueWei,
            chainId: 4663,
          },
          { address: smartWalletAddress }
        )
        setTxHash(hash)
        toast.success("ETH sent", {
          description: `${amount} ETH → ${recipientChecksum.slice(0, 10)}...`,
          action: {
            label: "View",
            onClick: () => window.open(`https://robinhoodchain.blockscout.com/tx/${hash}`, "_blank"),
          },
        })
      } else {
        // Token transfer
        if (!selectedToken) {
          toast.error("Select a token")
          return
        }
        const amountWei = parseUnits(amount, selectedToken.decimals)
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [recipientChecksum, amountWei],
        })
        const { hash } = await sendTransaction(
          {
            to: selectedToken.address as `0x${string}`,
            data,
            value: BigInt(0),
            chainId: 4663,
          },
          { address: smartWalletAddress }
        )
        setTxHash(hash)
        toast.success(`${selectedToken.symbol} sent`, {
          description: `${amount} ${selectedToken.symbol} → ${recipientChecksum.slice(0, 10)}...`,
          action: {
            label: "View",
            onClick: () => window.open(`https://robinhoodchain.blockscout.com/tx/${hash}`, "_blank"),
          },
        })
      }
      onSuccess?.()
    } catch (err: any) {
      const msg = err?.message || "Send failed"
      toast.error("Send failed", { description: msg })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="bg-card border-border w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Send from Smart Wallet</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Type selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setType("eth")}
              className={`flex-1 h-10 rounded border text-sm font-medium transition ${
                type === "eth"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Native ETH
            </button>
            <button
              onClick={() => setType("token")}
              className={`flex-1 h-10 rounded border text-sm font-medium transition ${
                type === "token"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Token
            </button>
          </div>

          {type === "token" && (
            <div>
              <Label className="text-xs">Token</Label>
              <select
                value={tokenAddr}
                onChange={(e) => setTokenAddr(e.target.value)}
                className="w-full h-9 px-3 bg-background border border-border rounded text-sm"
              >
                {KNOWN_TOKENS.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol} ({t.address.slice(0, 6)}...{t.address.slice(-4)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recipient */}
          <div>
            <Label className="text-xs">Recipient address</Label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="font-mono text-xs h-9"
            />
          </div>

          {/* Amount */}
          <div>
            <Label className="text-xs">Amount</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="font-mono text-sm h-9"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {type === "eth" ? "ETH" : selectedToken?.symbol}
            </p>
          </div>

          {txHash && (
            <div className="text-xs bg-primary/10 border border-primary/30 rounded p-2 flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-medium">Transaction sent!</p>
                <a
                  href={`https://robinhoodchain.blockscout.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-mono break-all"
                >
                  {txHash.slice(0, 20)}...{txHash.slice(-10)}
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isSending}>
            {txHash ? "Close" : "Cancel"}
          </Button>
          {!txHash && (
            <Button
              onClick={handleSend}
              disabled={isSending || !recipient || !amount}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}