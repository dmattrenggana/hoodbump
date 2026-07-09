import {
  generatePrivateKey,
  privateKeyToAccount,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type WalletClient,
} from "viem"
import { createPublicClient } from "viem"
import { createSupabaseServiceClient } from "./supabase"
import { encryptPrivateKey, decryptPrivateKey } from "./bot-wallet-encryption"
import { robinhoodChain } from "./chain-config"
import { RH_WETH_ADDRESS, WALLETS_PER_USER } from "./constants"

/**
 * Bot wallet management for HoodBump
 * 
 * - Creates 10 EOA wallets per user (no AA, no sponsorship)
 * - Private keys encrypted with master key (AES-256-GCM)
 * - Server-side signing only (worker)
 */

export interface BotWallet {
  id: string
  user_address: string
  wallet_index: number
  address: Address
  encrypted_private_key: string
  eth_balance_wei: string
  weth_balance_wei: string
  total_gas_spent_wei: string
  last_swap_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Create 10 bot wallets for a user
 * - Generates 10 random private keys
 * - Encrypts each with master key
 * - Stores in Supabase
 * 
 * Idempotent: if user already has 10 wallets, returns existing
 */
export async function createBotWallets(userAddress: string): Promise<BotWallet[]> {
  const supabase = createSupabaseServiceClient()
  const normalizedAddress = userAddress.toLowerCase()

  // Check if wallets already exist
  const { data: existing, error: fetchError } = await supabase
    .from("bot_wallets")
    .select("*")
    .eq("user_address", normalizedAddress)
    .order("wallet_index", { ascending: true })

  if (fetchError) {
    throw new Error(`Failed to fetch existing wallets: ${fetchError.message}`)
  }

  if (existing && existing.length === WALLETS_PER_USER) {
    console.log(
      `✅ User ${normalizedAddress} already has ${WALLETS_PER_USER} bot wallets`
    )
    return existing as BotWallet[]
  }

  // If partial wallets exist, error out (don't auto-fill)
  if (existing && existing.length > 0) {
    throw new Error(
      `User has ${existing.length}/${WALLETS_PER_USER} wallets. ` +
        `Manual cleanup required.`
    )
  }

  // Create 10 new wallets
  console.log(
    `🔐 Creating ${WALLETS_PER_USER} bot wallets for ${normalizedAddress}...`
  )
  const walletsToInsert: Partial<BotWallet>[] = []

  for (let i = 0; i < WALLETS_PER_USER; i++) {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const encrypted = encryptPrivateKey(privateKey)

    walletsToInsert.push({
      user_address: normalizedAddress,
      wallet_index: i,
      address: account.address,
      encrypted_private_key: encrypted,
      eth_balance_wei: "0",
      weth_balance_wei: "0",
      total_gas_spent_wei: "0",
    })
  }

  const { data: inserted, error: insertError } = await supabase
    .from("bot_wallets")
    .insert(walletsToInsert)
    .select()

  if (insertError) {
    throw new Error(`Failed to insert wallets: ${insertError.message}`)
  }

  console.log(
    `✅ Created ${inserted.length} bot wallets for ${normalizedAddress}`
  )
  return inserted as BotWallet[]
}

/**
 * Get all bot wallets for a user
 */
export async function getBotWallets(userAddress: string): Promise<BotWallet[]> {
  const supabase = createSupabaseServiceClient()
  const normalizedAddress = userAddress.toLowerCase()

  const { data, error } = await supabase
    .from("bot_wallets")
    .select("*")
    .eq("user_address", normalizedAddress)
    .order("wallet_index", { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch wallets: ${error.message}`)
  }

  return (data || []) as BotWallet[]
}

/**
 * Get a specific bot wallet by index
 */
export async function getBotWalletByIndex(
  userAddress: string,
  walletIndex: number
): Promise<BotWallet | null> {
  const supabase = createSupabaseServiceClient()
  const normalizedAddress = userAddress.toLowerCase()

  const { data, error } = await supabase
    .from("bot_wallets")
    .select("*")
    .eq("user_address", normalizedAddress)
    .eq("wallet_index", walletIndex)
    .single()

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to fetch wallet: ${error.message}`)
  }

  return (data as BotWallet) || null
}

/**
 * Create a viem wallet client for a bot wallet
 * Decrypts the private key in memory, never persists
 */
export function createBotWalletClient(wallet: BotWallet): WalletClient {
  const privateKey = decryptPrivateKey(wallet.encrypted_private_key) as Hex
  const account = privateKeyToAccount(privateKey)

  return createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http(process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL!),
  })
}

/**
 * Get public client for reading blockchain state
 */
export function getPublicClient() {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(process.env.NEXT_PUBLIC_HOODBUMP_RPC_URL!),
  })
}

/**
 * Sign and send a transaction from a specific bot wallet
 * Returns the transaction hash
 */
export async function signAndSendTransaction(
  userAddress: string,
  walletIndex: number,
  tx: {
    to: Address
    data?: Hex
    value?: bigint
    gas?: bigint
  }
): Promise<Hex> {
  const wallet = await getBotWalletByIndex(userAddress, walletIndex)
  if (!wallet) {
    throw new Error(`Bot wallet ${walletIndex} not found for user ${userAddress}`)
  }

  const client = createBotWalletClient(wallet)
  const publicClient = getPublicClient()

  try {
    // Estimate gas if not provided
    const gas = tx.gas || (await publicClient.estimateGas({
      account: wallet.address,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    }))

    // Sign + send
    const hash = await client.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value || BigInt(0),
      gas,
    })

    return hash
  } catch (error: any) {
    throw new Error(`Transaction failed: ${error.message}`)
  }
}

/**
 * Update wallet balances in DB
 * Call after a swap to keep DB in sync with on-chain state
 */
export async function updateWalletBalances(
  userAddress: string,
  walletIndex: number,
  ethBalanceWei: bigint,
  wethBalanceWei: bigint,
  gasSpentWei: bigint = BigInt(0)
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const normalizedAddress = userAddress.toLowerCase()

  const { error } = await supabase
    .from("bot_wallets")
    .update({
      eth_balance_wei: ethBalanceWei.toString(),
      weth_balance_wei: wethBalanceWei.toString(),
      total_gas_spent_wei: gasSpentWei.toString(),
      last_swap_at: new Date().toISOString(),
    })
    .eq("user_address", normalizedAddress)
    .eq("wallet_index", walletIndex)

  if (error) {
    throw new Error(`Failed to update wallet balances: ${error.message}`)
  }
}
