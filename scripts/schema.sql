-- =============================================
-- HoodBump Database Schema for Supabase
-- =============================================
-- Phase 2: Bot Wallets
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. BOT WALLETS (Phase 2)
-- =============================================
-- Stores 10 bot wallets per user for swap execution
-- Private keys are encrypted with MASTER_ENCRYPTION_KEY (AES-256-GCM)
CREATE TABLE IF NOT EXISTS bot_wallets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_address TEXT NOT NULL,                    -- Main user's Smart Wallet address (lowercase)
  wallet_index INTEGER NOT NULL,                 -- 0-9 (WALLETS_PER_USER)
  address TEXT NOT NULL,                          -- Bot wallet EOA address
  encrypted_private_key TEXT NOT NULL,           -- AES-256-GCM encrypted private key
  eth_balance_wei TEXT NOT NULL DEFAULT '0',     -- ETH balance (for gas)
  weth_balance_wei TEXT NOT NULL DEFAULT '0',    -- WETH balance (for swaps)
  total_gas_spent_wei TEXT NOT NULL DEFAULT '0', -- Total gas used historically
  last_swap_at TIMESTAMPTZ,                      -- Last time this wallet made a swap
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_address, wallet_index),
  CHECK (wallet_index >= 0 AND wallet_index < 10)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bot_wallets_user_address 
ON bot_wallets(user_address);

CREATE INDEX IF NOT EXISTS idx_bot_wallets_address 
ON bot_wallets(address);

-- =============================================
-- 2. UPDATE TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bot_wallets_updated_at ON bot_wallets;
CREATE TRIGGER update_bot_wallets_updated_at
  BEFORE UPDATE ON bot_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 3. RLS POLICIES
-- =============================================
ALTER TABLE bot_wallets ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for API access)
CREATE POLICY "Service role full access on bot_wallets" 
ON bot_wallets FOR ALL 
USING (true) 
WITH CHECK (true);

-- =============================================
-- VERIFICATION
-- =============================================
-- Run this to verify schema created correctly
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'bot_wallets'
ORDER BY ordinal_position;
